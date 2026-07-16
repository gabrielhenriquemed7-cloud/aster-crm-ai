"use server";

import { z } from "zod";

import { realtimeClinicalAnalysisSchema } from "@/lib/ai/clinical-realtime-schema";
import { clinicalTimelineEventSchema } from "@/lib/ai/clinical-timeline-schema";
import { createClient } from "@/lib/supabase/server";

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(10000),
});

const inputSchema = z.object({
  appointmentId: z.string().uuid(),
  question: z.string().trim().min(2).max(5000),
  clinicalText: z.string().trim().max(50000),
  assistance: realtimeClinicalAnalysisSchema,
  timelineEvents: z.array(clinicalTimelineEventSchema).max(300),
  history: z.array(messageSchema).max(20),
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

export async function askClinicalCopilot(input: unknown) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { error: "Pergunta ou contexto inválido." };
  const startedAt = Date.now();
  const supabase = await createClient();
  if (!supabase) return { error: "Serviço indisponível." };
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "Sua sessão expirou. Entre novamente." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("active_clinic_id")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (!profile?.active_clinic_id)
    return { error: "Selecione uma clínica ativa." };
  const { data: appointment } = await supabase
    .from("appointments")
    .select(
      "id,patient_id,professional_id,status,patient:patients(birth_date,gender,allergies,continuous_medications,medical_history)",
    )
    .eq("id", parsed.data.appointmentId)
    .eq("clinic_id", profile.active_clinic_id)
    .maybeSingle();
  if (
    !appointment ||
    appointment.professional_id !== auth.user.id ||
    appointment.status !== "in_progress"
  )
    return { error: "O chat está disponível apenas na consulta ativa." };
  const [{ data: settings }, { data: record }, { data: longitudinal }] =
    await Promise.all([
      supabase
        .from("ai_settings")
        .select("enabled,language,default_specialty")
        .eq("clinic_id", profile.active_clinic_id)
        .maybeSingle(),
      supabase
        .from("medical_records")
        .select("pmh,assessment")
        .eq("clinic_id", profile.active_clinic_id)
        .eq("appointment_id", appointment.id)
        .is("deleted_at", null)
        .maybeSingle(),
      supabase
        .from("longitudinal_clinical_summaries")
        .select("summary,status")
        .eq("clinic_id", profile.active_clinic_id)
        .eq("patient_id", appointment.patient_id)
        .in("status", ["ready", "partial"])
        .maybeSingle(),
    ]);
  if (!settings?.enabled) return { error: "A IA Clínica está desabilitada." };
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { error: "Serviço de IA não configurado." };
  const patient = Array.isArray(appointment.patient)
    ? appointment.patient[0]
    : appointment.patient;
  const model = process.env.OPENAI_CLINICAL_MODEL || "gpt-4.1-mini";
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        instructions: `Você é o ASTER Copilot, assistente clínico contextual durante uma consulta em andamento.
Responda à pergunta usando exclusivamente o contexto fornecido e o histórico desta conversa. Não solicite novamente informações que já constem no contexto.
Nunca emita diagnóstico definitivo. Use linguagem probabilística, explicite limitações, recomende correlação clínica e preserve o julgamento do médico.
Não altere prontuário, SOAP ou anamnese; não salve dados e não execute condutas.
Quando uma referência realmente conhecida e pertinente sustentar a resposta, cite nominalmente a diretriz ou instituição (por exemplo SBP, SBC, CFM, Ministério da Saúde, IDSA, ATS, AHA ou ESC). Não invente título, ano, recomendação, link ou referência.
Responda em Markdown conciso. Você pode usar listas, tabelas, checklists, alertas em blockquote e destaques.`,
        input: JSON.stringify({
          question: parsed.data.question,
          conversationHistory: parsed.data.history,
          currentConsultationContext: {
            clinicalReportAndTranscription: parsed.data.clinicalText || null,
            currentHypotheses: parsed.data.assistance.hypotheses,
            pendingQuestions: parsed.data.assistance.missingQuestions,
            warningSigns: parsed.data.assistance.alerts,
            timelineEvents: parsed.data.timelineEvents,
            suggestedPhysicalExam:
              parsed.data.assistance.physicalExamSuggestions,
            age: age(patient?.birth_date ?? null),
            sexOrGender: patient?.gender || null,
            registeredAllergies: patient?.allergies || null,
            registeredMedications: patient?.continuous_medications || null,
            activeProblems:
              record?.assessment ||
              record?.pmh ||
              patient?.medical_history ||
              null,
            longitudinalSummary: longitudinal?.summary
              ? {
                  activeProblems: longitudinal.summary.activeProblems,
                  allergies: longitudinal.summary.allergies,
                  currentMedications: longitudinal.summary.currentMedications,
                  relevantHistory: longitudinal.summary.relevantHistory,
                  latestRelevantExams:
                    longitudinal.summary.relevantExams?.slice(-10),
                  alerts: longitudinal.summary.alerts,
                  limitations:
                    longitudinal.summary.missingOrUncertainInformation,
                  partiallyProcessed: longitudinal.summary.partiallyProcessed,
                }
              : null,
          },
          specialty: settings.default_specialty || null,
          language: settings.language || "pt-BR",
        }),
        max_output_tokens: 2500,
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!response.ok)
      return { error: `Não foi possível responder (HTTP ${response.status}).` };
    const payload = (await response.json()) as {
      output_text?: string;
      usage?: { total_tokens?: number };
    };
    const answer = responseText(payload)?.trim();
    if (!answer)
      return { error: "O Copilot respondeu sem conteúdo utilizável." };
    console.info("ASTER_CLINICAL_CHAT", {
      type: "contextual_clinical_chat",
      durationMs: Date.now() - startedAt,
      tokens: payload.usage?.total_tokens ?? null,
    });
    return { answer };
  } catch {
    console.error("ASTER_CLINICAL_CHAT_ERROR", {
      type: "contextual_clinical_chat",
      durationMs: Date.now() - startedAt,
      tokens: null,
    });
    return { error: "Não foi possível responder agora. Tente novamente." };
  }
}
