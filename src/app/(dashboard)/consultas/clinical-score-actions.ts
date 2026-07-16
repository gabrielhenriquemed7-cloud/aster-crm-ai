"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const payloadSchema = z.object({
  appointmentId: z.string().uuid(),
  score: z.string().min(1).max(80),
  result: z.number().finite(),
  data: z.record(z.string(), z.union([z.number(), z.boolean(), z.null()])),
  version: z.string().max(30),
});

export async function saveClinicalScore(input: z.input<typeof payloadSchema>) {
  const parsed = payloadSchema.safeParse(input);
  if (!parsed.success) return { error: "Dados do score inválidos." };
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase não configurado." };
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "Sua sessão expirou." };
  const { data: appointment } = await supabase
    .from("appointments")
    .select("id,clinic_id,patient_id,professional_id,status")
    .eq("id", parsed.data.appointmentId)
    .maybeSingle();
  if (
    !appointment ||
    appointment.professional_id !== auth.user.id ||
    appointment.status !== "in_progress"
  )
    return { error: "Sem permissão para registrar este score." };
  const { error } = await supabase
    .from("clinical_score_results")
    .insert({
      clinic_id: appointment.clinic_id,
      patient_id: appointment.patient_id,
      appointment_id: appointment.id,
      professional_id: auth.user.id,
      score: parsed.data.score,
      result: parsed.data.result,
      data_used: parsed.data.data,
      score_version: parsed.data.version,
    });
  return error
    ? { error: "Não foi possível registrar o score." }
    : { success: "Score registrado." };
}
