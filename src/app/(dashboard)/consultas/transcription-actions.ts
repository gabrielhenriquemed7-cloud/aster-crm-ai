"use server";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const eventSchema = z.object({
  appointmentId: z.string().uuid(),
  status: z.enum(["consent_confirmed", "transcription_cancelled"]),
  durationSeconds: z.number().int().min(0).max(1800).optional(),
});

export async function recordTranscriptionEvent(input: unknown) {
  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) return { error: "Evento de gravação inválido." };
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
    .select("id, professional_id, status")
    .eq("id", parsed.data.appointmentId)
    .eq("clinic_id", profile.active_clinic_id)
    .maybeSingle();
  if (
    !appointment ||
    appointment.professional_id !== auth.user.id ||
    appointment.status !== "in_progress"
  )
    return { error: "Você não possui permissão para gravar esta consulta." };
  const { error } = await supabase
    .from("clinical_transcription_events")
    .insert({
      clinic_id: profile.active_clinic_id,
      appointment_id: appointment.id,
      requested_by: auth.user.id,
      status: parsed.data.status,
      consent_confirmed: parsed.data.status === "consent_confirmed",
      duration_seconds: parsed.data.durationSeconds ?? null,
    });
  if (error)
    return { error: "Não foi possível registrar o evento de gravação." };
  return { success: true };
}
