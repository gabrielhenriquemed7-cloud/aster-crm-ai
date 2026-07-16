"use server";

import { z } from "zod";

import {
  aiPrescriptionJsonSchema,
  aiPrescriptionSchema,
} from "@/lib/ai/prescription-schema";
import { createClient } from "@/lib/supabase/server";

const PROMPT_VERSION = "prescription-v1";
const contextText = z.string().trim().max(12000).optional();
const generateSchema = z.object({
  appointmentId: z.string().uuid(),
  context: z.object({
    anamnesis: contextText,
    hpi: contextText,
    soap: contextText,
    physicalExam: contextText,
    hypotheses: contextText,
    suggestedCids: z.string().trim().max(1000).optional(),
    allergies: contextText,
    medications: contextText,
    vitalSigns: contextText,
  }),
});
const finalizeSchema = z.object({
  generationId: z.string().uuid(),
  prescription: aiPrescriptionSchema,
});

function age(birthDate: string | null) {
  if (!birthDate) return null;
  const birth = new Date(`${birthDate}T12:00:00`);
  const today = new Date();
  let years = today.getFullYear() - birth.getFullYear();
  if (
    today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())
  )
    years -= 1;
  return years;
}

function responseText(payload: unknown) {
  const response = payload as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  return (
    response.output_text ??
    response.output
      ?.flatMap((item) => item.content ?? [])
      .find((item) => item.type === "output_text")?.text
  );
}

async function authContext() {
  const supabase = await createClient();
  if (!supabase) return { error: "PRESCRIPTION_ERROR" } as const;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "PRESCRIPTION_AUTH_ERROR" } as const;
  const { data: profile } = await supabase
    .from("profiles")
    .select("active_clinic_id")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (!profile?.active_clinic_id)
    return { error: "PRESCRIPTION_AUTH_ERROR" } as const;
  return {
    supabase,
    userId: auth.user.id,
    clinicId: profile.active_clinic_id,
    error: null,
  } as const;
}

export async function generateAiPrescription(input: unknown) {
  const parsed = generateSchema.safeParse(input);
  if (!parsed.success) return { error: "PRESCRIPTION_EMPTY_CONTEXT" } as const;
  const usefulContext = Object.values(parsed.data.context).some((value) =>
    value?.trim(),
  );
  if (!usefulContext) return { error: "PRESCRIPTION_EMPTY_CONTEXT" } as const;
  const startedAt = Date.now();
  const c = await authContext();
  if (c.error) return { error: c.error } as const;
  const { data: appointment } = await c.supabase
    .from("appointments")
    .select(
      "id,patient_id,professional_id,status,patient:patients(birth_date,gender,allergies,continuous_medications)",
    )
    .eq("id", parsed.data.appointmentId)
    .eq("clinic_id", c.clinicId)
    .maybeSingle();
  if (
    !appointment ||
    appointment.professional_id !== c.userId ||
    appointment.status !== "in_progress"
  )
    return { error: "PRESCRIPTION_AUTH_ERROR" } as const;
  const [{ data: settings }, { data: professional }] = await Promise.all([
    c.supabase
      .from("ai_settings")
      .select("enabled,language,default_specialty")
      .eq("clinic_id", c.clinicId)
      .maybeSingle(),
    c.supabase
      .from("professional_profiles")
      .select("specialty")
      .eq("clinic_id", c.clinicId)
      .eq("user_id", c.userId)
      .maybeSingle(),
  ]);
  if (!settings?.enabled) return { error: "PRESCRIPTION_AUTH_ERROR" } as const;
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { error: "PRESCRIPTION_AUTH_ERROR" } as const;
  const model = process.env.OPENAI_CLINICAL_MODEL || "gpt-4.1-mini";
  const patient = Array.isArray(appointment.patient)
    ? appointment.patient[0]
    : appointment.patient;
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        instructions: `Você é um assistente de prescrição clínica. Gere apenas uma sugestão para revisão e decisão do profissional.
Use exclusivamente o contexto autorizado. Nunca invente diagnóstico, alergia, medicamento, peso ou achado.
Não calcule dose automaticamente nem realize ajuste por função renal, gestação, idade ou interação medicamentosa nesta etapa.
Considere explicitamente as alergias e os medicamentos em uso informados. Se faltarem dados indispensáveis, deixe a informação vazia e registre a limitação em observacoes ou alertas.
O diagnosticoProvavel deve permanecer probabilístico e não confirmado. A justificativa deve relacionar a sugestão ao contexto, sem afirmar certeza.
Retorne somente JSON válido compatível com o schema. Nunca use Markdown, blocos de código ou propriedades adicionais.`,
        input: JSON.stringify({
          clinicalContext: parsed.data.context,
          patientContext: {
            age: age(patient?.birth_date ?? null),
            sexOrGender: patient?.gender || null,
            registeredAllergies:
              parsed.data.context.allergies || patient?.allergies || null,
            currentMedications:
              parsed.data.context.medications ||
              patient?.continuous_medications ||
              null,
            weightWhenAvailable: parsed.data.context.vitalSigns || null,
          },
          specialty:
            professional?.specialty || settings.default_specialty || null,
          language: settings.language || "pt-BR",
        }),
        max_output_tokens: 4000,
        text: {
          format: {
            type: "json_schema",
            name: "assisted_prescription",
            strict: true,
            schema: aiPrescriptionJsonSchema,
          },
        },
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!response.ok) {
      const code =
        response.status === 401 || response.status === 403
          ? "PRESCRIPTION_AUTH_ERROR"
          : response.status === 429
            ? "PRESCRIPTION_QUOTA_ERROR"
            : "PRESCRIPTION_ERROR";
      throw new Error(code);
    }
    const payload = (await response.json()) as {
      output_text?: string;
      usage?: { total_tokens?: number };
    };
    const text = responseText(payload);
    if (!text) throw new Error("PRESCRIPTION_INVALID_RESPONSE");
    let json: unknown;
    try {
      json = JSON.parse(
        text
          .trim()
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/\s*```$/i, ""),
      );
    } catch {
      throw new Error("PRESCRIPTION_INVALID_RESPONSE");
    }
    const prescription = aiPrescriptionSchema.safeParse(json);
    if (!prescription.success) throw new Error("PRESCRIPTION_SCHEMA_ERROR");
    const saved = await c.supabase
      .from("ai_prescription_generations")
      .insert({
        clinic_id: c.clinicId,
        patient_id: appointment.patient_id,
        appointment_id: appointment.id,
        professional_id: c.userId,
        prompt_version: PROMPT_VERSION,
        model,
        generated_prescription: prescription.data,
        final_prescription: null,
        status: "generated",
      })
      .select("id")
      .single();
    if (saved.error || !saved.data) throw new Error("PRESCRIPTION_ERROR");
    console.info("ASTER_AI_PRESCRIPTION", {
      type: "prescription_generation",
      durationMs: Date.now() - startedAt,
      tokens: payload.usage?.total_tokens ?? null,
      model,
      result: "success",
    });
    return { prescription: prescription.data, generationId: saved.data.id };
  } catch (error) {
    const code =
      error instanceof Error && error.message.startsWith("PRESCRIPTION_")
        ? error.message
        : "PRESCRIPTION_ERROR";
    console.error("ASTER_AI_PRESCRIPTION_ERROR", {
      type: "prescription_generation",
      durationMs: Date.now() - startedAt,
      model,
      code,
    });
    return { error: code } as const;
  }
}

export async function acceptAiPrescription(input: unknown) {
  const parsed = finalizeSchema.safeParse(input);
  if (!parsed.success) return { error: "PRESCRIPTION_SCHEMA_ERROR" } as const;
  const c = await authContext();
  if (c.error) return { error: c.error } as const;
  const result = await c.supabase
    .from("ai_prescription_generations")
    .update({
      final_prescription: parsed.data.prescription,
      status: "inserted",
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.generationId)
    .eq("clinic_id", c.clinicId)
    .eq("professional_id", c.userId)
    .select("id")
    .maybeSingle();
  if (result.error || !result.data)
    return { error: "PRESCRIPTION_ERROR" } as const;
  return { success: true } as const;
}

export async function discardAiPrescription(generationId: string) {
  if (!z.string().uuid().safeParse(generationId).success)
    return { error: "PRESCRIPTION_ERROR" } as const;
  const c = await authContext();
  if (c.error) return { error: c.error } as const;
  await c.supabase
    .from("ai_prescription_generations")
    .update({ status: "discarded", updated_at: new Date().toISOString() })
    .eq("id", generationId)
    .eq("clinic_id", c.clinicId)
    .eq("professional_id", c.userId);
  return { success: true } as const;
}
