"use server";

import { createHash } from "node:crypto";
import { z } from "zod";
import {
  ClinicalAiError,
  generateClinicalSuggestion,
} from "@/lib/ai/clinical-assistant";
import { createClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  appointmentId: z.string().uuid(),
  text: z.string().trim().min(30).max(50000),
});
const auditSchema = z.object({
  generationId: z.string().uuid(),
  sections: z.array(z.string()).max(18),
});

function age(birthDate: string | null) {
  if (!birthDate) return null;
  const birth = new Date(`${birthDate}T12:00:00`);
  const now = new Date();
  return (
    now.getFullYear() -
    birth.getFullYear() -
    (now < new Date(now.getFullYear(), birth.getMonth(), birth.getDate())
      ? 1
      : 0)
  );
}
async function authContext() {
  const supabase = await createClient();
  if (!supabase) return { error: "Serviço indisponível." } as const;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user)
    return { error: "Sua sessão expirou. Entre novamente." } as const;
  const { data: profile } = await supabase
    .from("profiles")
    .select("active_clinic_id")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (!profile?.active_clinic_id)
    return { error: "Selecione uma clínica ativa." } as const;
  return {
    supabase,
    userId: auth.user.id,
    clinicId: profile.active_clinic_id,
    error: null,
  } as const;
}
function log(
  code: string,
  message: string,
  appointmentId: string,
  hasAuthenticatedUser: boolean,
) {
  console.error("ASTER_CLINICAL_AI_ERROR", {
    code,
    message,
    appointmentId,
    hasAuthenticatedUser,
  });
}

export async function generateClinicalAiSuggestion(input: unknown) {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success)
    return {
      error:
        parsed.error.issues[0]?.code === "too_small"
          ? "Conteúdo insuficiente. Informe ao menos 30 caracteres."
          : "Dados inválidos.",
    };
  const c = await authContext();
  if (c.error) return { error: c.error };
  const { appointmentId, text } = parsed.data;
  const { data: appointment } = await c.supabase
    .from("appointments")
    .select(
      "id,patient_id,professional_id,status,patient:patients(birth_date,gender,allergies,continuous_medications)",
    )
    .eq("id", appointmentId)
    .eq("clinic_id", c.clinicId)
    .maybeSingle();
  if (!appointment || appointment.professional_id !== c.userId)
    return { error: "Você não possui acesso a esta consulta." };
  if (appointment.status !== "in_progress")
    return { error: "A IA só pode ser usada durante o atendimento." };
  const { data: settings } = await c.supabase
    .from("ai_settings")
    .select("*")
    .eq("clinic_id", c.clinicId)
    .maybeSingle();
  if (!settings?.enabled)
    return { error: "A IA Clínica está desabilitada nas configurações." };
  const [{ data: record }, { data: professional }, { data: history }] =
    await Promise.all([
      c.supabase
        .from("medical_records")
        .select("id,chief_complaint,allergies,medications")
        .eq("appointment_id", appointmentId)
        .is("deleted_at", null)
        .maybeSingle(),
      c.supabase
        .from("professional_profiles")
        .select("specialty")
        .eq("clinic_id", c.clinicId)
        .eq("user_id", c.userId)
        .maybeSingle(),
      c.supabase
        .from("medical_records")
        .select("chief_complaint,assessment,plan")
        .eq("clinic_id", c.clinicId)
        .eq("patient_id", appointment.patient_id)
        .neq("appointment_id", appointmentId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(3),
    ]);
  const patient = Array.isArray(appointment.patient)
    ? appointment.patient[0]
    : appointment.patient;
  try {
    const generated = await generateClinicalSuggestion(
      text,
      {
        age: age(patient?.birth_date ?? null),
        gender: patient?.gender ?? null,
        allergies: record?.allergies ?? patient?.allergies ?? null,
        medications:
          record?.medications ?? patient?.continuous_medications ?? null,
        chiefComplaint: record?.chief_complaint ?? null,
        previousHistory: (history ?? [])
          .map((item) =>
            [item.chief_complaint, item.assessment, item.plan]
              .filter(Boolean)
              .join(" | "),
          )
          .filter(Boolean),
      },
      {
        language: settings.language,
        specialty: professional?.specialty || settings.default_specialty || "",
        detailLevel: settings.detail_level,
        evolutionFormat: settings.evolution_format,
        suggestCid: settings.suggest_cid,
        suggestDifferentials: settings.suggest_differentials,
        suggestExams: settings.suggest_exams,
        suggestConduct: settings.suggest_conduct,
      },
    );
    const status = "generated";
    const { data: audit, error } = await c.supabase
      .from("ai_clinical_generations")
      .insert({
        clinic_id: c.clinicId,
        patient_id: appointment.patient_id,
        appointment_id: appointment.id,
        medical_record_id: record?.id ?? null,
        professional_id: c.userId,
        status,
        input_hash: createHash("sha256").update(text).digest("hex"),
        model: generated.model,
        generated_sections: Object.keys(generated.suggestion).filter(
          (key) =>
            generated.suggestion[key as keyof typeof generated.suggestion],
        ),
        accepted_sections: [],
      })
      .select("id")
      .single();
    if (error || !audit) {
      log(
        "AUDIT_FAILED",
        error?.message ?? "Audit unavailable",
        appointmentId,
        true,
      );
      return {
        error:
          "Não foi possível registrar a geração com segurança. A sugestão não foi exibida.",
      };
    }
    return { suggestion: generated.suggestion, generationId: audit.id };
  } catch (error) {
    const clinical =
      error instanceof ClinicalAiError
        ? error
        : new ClinicalAiError(
            "CONNECTION",
            "Falha inesperada no serviço de IA.",
          );
    log(clinical.code, clinical.message, appointmentId, true);
    return { error: clinical.message };
  }
}

export async function acceptClinicalAiSections(input: unknown) {
  const parsed = auditSchema.safeParse(input);
  if (!parsed.success) return { error: "Auditoria inválida." };
  const c = await authContext();
  if (c.error) return { error: c.error };
  const current = await c.supabase
    .from("ai_clinical_generations")
    .select("accepted_sections")
    .eq("id", parsed.data.generationId)
    .eq("clinic_id", c.clinicId)
    .eq("professional_id", c.userId)
    .maybeSingle();
  if (current.error || !current.data)
    return { error: "Não foi possível registrar a aceitação." };
  const acceptedSections = [
    ...new Set([
      ...(current.data.accepted_sections ?? []),
      ...parsed.data.sections,
    ]),
  ];
  const { data, error } = await c.supabase
    .from("ai_clinical_generations")
    .update({
      status: "accepted",
      accepted_sections: acceptedSections,
      accepted_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.generationId)
    .eq("clinic_id", c.clinicId)
    .eq("professional_id", c.userId)
    .select("id")
    .maybeSingle();
  if (error || !data)
    return { error: "Não foi possível registrar a aceitação." };
  return { success: true };
}
export async function discardClinicalAiSuggestion(generationId: string) {
  const parsed = z.string().uuid().safeParse(generationId);
  if (!parsed.success) return { error: "Auditoria inválida." };
  const c = await authContext();
  if (c.error) return { error: c.error };
  const { data, error } = await c.supabase
    .from("ai_clinical_generations")
    .update({ status: "discarded", discarded_at: new Date().toISOString() })
    .eq("id", parsed.data)
    .eq("clinic_id", c.clinicId)
    .eq("professional_id", c.userId)
    .select("id")
    .maybeSingle();
  if (error || !data)
    return { error: "Não foi possível descartar a sugestão." };
  return { success: true };
}
