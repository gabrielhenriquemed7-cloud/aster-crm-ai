"use server";

import { z } from "zod";

import {
  realtimeClinicalAnalysisJsonSchema,
  realtimeClinicalAnalysisSchema,
  type RealtimeClinicalAnalysis,
} from "@/lib/ai/clinical-realtime-schema";
import { createClient } from "@/lib/supabase/server";

const inputSchema = z.object({
  appointmentId: z.string().uuid(),
  delta: z.string().trim().min(3).max(12000),
  previous: realtimeClinicalAnalysisSchema.nullable(),
  currentRecord: z.object({
    chiefComplaint: z.string().max(12000),
    hpi: z.string().max(12000),
    history: z.string().max(12000),
    allergies: z.string().max(12000),
    medications: z.string().max(12000),
    vitalSigns: z.string().max(12000),
    physicalExam: z.string().max(12000),
  }),
  professionalContext: z.object({
    answeredQuestions: z.array(z.string().max(500)).max(30),
    discardedHypotheses: z.array(z.string().max(500)).max(20),
  }),
});

function extractText(payload: unknown) {
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

export async function analyzeClinicalContextIncrement(input: unknown): Promise<{
  analysis?: RealtimeClinicalAnalysis;
  error?: string;
}> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { error: "Contexto incremental inválido." };
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
    return { error: "A assistência está disponível apenas na consulta ativa." };
  const [{ data: settings }, { data: lastRecord }, { data: longitudinal }] =
    await Promise.all([
      supabase
        .from("ai_settings")
        .select("enabled,language,default_specialty")
        .eq("clinic_id", profile.active_clinic_id)
        .maybeSingle(),
      supabase
        .from("medical_records")
        .select("created_at")
        .eq("clinic_id", profile.active_clinic_id)
        .eq("patient_id", appointment.patient_id)
        .neq("appointment_id", appointment.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
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
  const model = process.env.OPENAI_REALTIME_CLINICAL_MODEL || "gpt-4.1-mini";
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        instructions: `Você é um copiloto clínico assistivo acompanhando uma consulta em andamento.
Não invente dados. Reconheça negações e o escopo da frase: "nega dor torácica" nunca é evidência de dor torácica. Separe fatos registrados, hipóteses e sugestões e informe incertezas.
Não confirme diagnósticos, não prescreva, não interprete sugestão antiga como fato, não esconda sinais de alarme e não substitua julgamento profissional. Use linguagem objetiva e clínica.
Alertas exigem evidência concreta e contextual, nunca palavra isolada. Inclua evidência, confirmação necessária e avaliação sugerida, sem afirmar diagnóstico.
Hipóteses não usam porcentagens. Compare com o estado anterior e marque situação nova, mantida, menos provável ou removida. Não reintroduza hipótese descartada pelo profissional.
Perguntas devem ser contextuais, categorizadas e removidas quando o novo contexto já trouxer resposta. Exame físico nunca deve ser descrito como realizado.
Sugira poucos exames complementares com finalidade, condição de indicação e motivo para não solicitar quando aplicável. Nunca crie solicitação.
Protocolos são apenas potencialmente aplicáveis e limitados a: sepse, síndrome coronariana aguda, AVC, crise asmática, anafilaxia, trauma, dor abdominal aguda, síndrome febril, risco de suicídio e emergência hipertensiva. Não execute protocolo.
Use o estado anterior como cache e o trecho novo como atualização. Retorne listas vazias quando não houver suporte contextual. Responda somente no schema JSON, sem Markdown.`,
        input: JSON.stringify({
          newContextOnly: parsed.data.delta,
          previousAssistantState: parsed.data.previous,
          currentMedicalRecord: parsed.data.currentRecord,
          professionalContext: parsed.data.professionalContext,
          availablePatientData: {
            ageOrBirthDate: patient?.birth_date || null,
            sexOrGender: patient?.gender || null,
            allergies: patient?.allergies || null,
            medications: patient?.continuous_medications || null,
            medicalHistory: patient?.medical_history || null,
            lastConsultationAt: lastRecord?.created_at || null,
          },
          longitudinalSummary: longitudinal?.summary || null,
          specialty: settings.default_specialty || null,
          language: settings.language || "pt-BR",
        }),
        max_output_tokens: 5000,
        text: {
          format: {
            type: "json_schema",
            name: "realtime_clinical_assistance",
            strict: true,
            schema: realtimeClinicalAnalysisJsonSchema,
          },
        },
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok)
      return {
        error: `Não foi possível atualizar o Copilot (HTTP ${response.status}).`,
      };
    const payload = (await response.json()) as {
      output_text?: string;
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
        total_tokens?: number;
      };
    };
    const text = extractText(payload);
    const result = realtimeClinicalAnalysisSchema.safeParse(
      text ? JSON.parse(text) : null,
    );
    if (!result.success)
      return { error: "A resposta incremental não pôde ser interpretada." };
    console.info("ASTER_REALTIME_COPILOT", {
      appointmentId: appointment.id,
      clinicId: profile.active_clinic_id,
      analysisType: "incremental_assistance",
      requestedBy: auth.user.id,
      model,
      durationMs: Date.now() - startedAt,
      tokens: payload.usage?.total_tokens ?? null,
      status: "success",
      itemCounts: {
        alerts: result.data.alerts.length,
        hypotheses: result.data.hypotheses.length,
        missingQuestions: result.data.missingQuestions.length,
        physicalExamSuggestions: result.data.physicalExamSuggestions.length,
        testSuggestions: result.data.testSuggestions.length,
        importantPatientData: result.data.importantPatientData.length,
        possibleProtocols: result.data.possibleProtocols.length,
        contradictions: result.data.contradictions.length,
      },
      analyzedAt: new Date().toISOString(),
    });
    return { analysis: result.data };
  } catch (error) {
    console.error("ASTER_REALTIME_COPILOT_ERROR", {
      appointmentId: appointment.id,
      clinicId: profile.active_clinic_id,
      analysisType: "incremental_assistance",
      requestedBy: auth.user.id,
      model,
      durationMs: Date.now() - startedAt,
      status: "error",
      code: error instanceof Error ? error.name : "UNKNOWN",
    });
    return { error: "Não foi possível atualizar a assistência clínica." };
  }
}
