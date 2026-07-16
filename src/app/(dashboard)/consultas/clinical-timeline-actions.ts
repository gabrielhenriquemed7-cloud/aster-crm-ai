"use server";

import { z } from "zod";

import {
  clinicalTimelineJsonSchema,
  clinicalTimelineResponseSchema,
  type ClinicalTimelineEvent,
} from "@/lib/ai/clinical-timeline-schema";
import { createClient } from "@/lib/supabase/server";

const inputSchema = z.object({
  appointmentId: z.string().uuid(),
  context: z.string().trim().min(3).max(50000),
  relativeTimeMs: z.number().int().min(0),
  knownFingerprints: z.array(z.string().max(200)).max(300),
});

function responseText(payload: unknown) {
  const value = payload as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  return (
    value.output_text ??
    value.output
      ?.flatMap((item) => item.content ?? [])
      .find((item) => item.type === "output_text")?.text
  );
}

export async function extractClinicalTimeline(input: unknown): Promise<{
  events?: ClinicalTimelineEvent[];
  error?: string;
}> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { error: "Contexto da timeline inválido." };
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
    .select("id,professional_id,status")
    .eq("id", parsed.data.appointmentId)
    .eq("clinic_id", profile.active_clinic_id)
    .maybeSingle();
  if (
    !appointment ||
    appointment.professional_id !== auth.user.id ||
    appointment.status !== "in_progress"
  )
    return { error: "Timeline disponível apenas na consulta ativa." };
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { error: "Serviço de IA não configurado." };
  const model = process.env.OPENAI_CLINICAL_TIMELINE_MODEL || "gpt-4.1-mini";
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        instructions: `Extraia somente eventos clínicos relevantes da consulta atual. Não invente dados, não transforme negação em presença e não registre sugestão da IA como decisão profissional. Use os índices exatos do texto como sourceStart/sourceEnd quando puder; use null quando não puder. O tempo relativo de novos eventos é ${parsed.data.relativeTimeMs} ms. Não exponha raciocínio interno. Retorne apenas JSON no schema.`,
        input: JSON.stringify({
          consultationContext: parsed.data.context,
          fingerprintsAlreadyKnown: parsed.data.knownFingerprints,
        }),
        max_output_tokens: 3500,
        text: {
          format: {
            type: "json_schema",
            name: "clinical_timeline",
            strict: true,
            schema: clinicalTimelineJsonSchema,
          },
        },
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok)
      return { error: `Timeline indisponível (HTTP ${response.status}).` };
    const payload = await response.json();
    const text = responseText(payload);
    const result = clinicalTimelineResponseSchema.safeParse(
      text ? JSON.parse(text) : null,
    );
    if (!result.success) return { error: "Resposta da timeline inválida." };
    console.info("ASTER_CLINICAL_TIMELINE", {
      clinicId: profile.active_clinic_id,
      appointmentId: appointment.id,
      eventCount: result.data.events.length,
      eventTypes: [...new Set(result.data.events.map((event) => event.type))],
      durationMs: Date.now() - startedAt,
      model,
      status: "success",
    });
    return { events: result.data.events };
  } catch (error) {
    console.error("ASTER_CLINICAL_TIMELINE_ERROR", {
      clinicId: profile.active_clinic_id,
      appointmentId: appointment.id,
      durationMs: Date.now() - startedAt,
      model,
      code: error instanceof Error ? error.name : "UNKNOWN",
    });
    return { error: "Não foi possível atualizar a timeline." };
  }
}
