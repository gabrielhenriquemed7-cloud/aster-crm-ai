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
      "id,patient_id,professional_id,status,patient:patients(allergies,continuous_medications,medical_history)",
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
  const [{ data: settings }, { data: lastRecord }] = await Promise.all([
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
        instructions: `Você é um copiloto clínico assistivo acompanhando uma consulta em andamento.
Atualize somente: hipóteses a considerar, perguntas ainda relevantes, exame físico sugerido, sinais de alerta e dados importantes já registrados.
Nunca gere SOAP, anamnese, CID-10, prescrição ou conduta. Nunca afirme diagnóstico definitivo, nunca use porcentagens e nunca invente perguntas sem relação com o contexto recebido.
Hipóteses devem usar apenas compatibilidade Alta, Moderada ou Baixa. Alertas devem aparecer somente quando sustentados pelo relato. Exames físicos devem ser contextuais.
Use o estado anterior como cache e o trecho novo como atualização. Remova itens que deixaram de ser pertinentes. Responda apenas no schema JSON.`,
        input: JSON.stringify({
          newContextOnly: parsed.data.delta,
          previousAssistantState: parsed.data.previous,
          availablePatientData: {
            allergies: patient?.allergies || null,
            medications: patient?.continuous_medications || null,
            medicalHistory: patient?.medical_history || null,
            lastConsultationAt: lastRecord?.created_at || null,
          },
          specialty: settings.default_specialty || null,
          language: settings.language || "pt-BR",
        }),
        max_output_tokens: 1800,
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
      durationMs: Date.now() - startedAt,
      tokens: payload.usage?.total_tokens ?? null,
    });
    return { analysis: result.data };
  } catch (error) {
    console.error("ASTER_REALTIME_COPILOT_ERROR", {
      appointmentId: appointment.id,
      clinicId: profile.active_clinic_id,
      analysisType: "incremental_assistance",
      durationMs: Date.now() - startedAt,
      code: error instanceof Error ? error.name : "UNKNOWN",
    });
    return { error: "Não foi possível atualizar a assistência clínica." };
  }
}
