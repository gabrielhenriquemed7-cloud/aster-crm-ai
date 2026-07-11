"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { medicalRecordSchema, type MedicalRecordFormValues } from "@/lib/medical-records/schema";
import type { MedicalRecord, MedicalRecordAppointment } from "@/lib/medical-records/types";
import { createClient } from "@/lib/supabase/server";

type SaveResult = { error?: string; id?: string; success?: string };
const idSchema = z.string().uuid();

function nullable(value?: string) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function recordPayload(values: MedicalRecordFormValues) {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, nullable(value)]),
  );
}

async function context() {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase não configurado." as const };
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "Sua sessão expirou. Entre novamente." as const };
  const { data: profile } = await supabase
    .from("profiles")
    .select("active_clinic_id")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (!profile?.active_clinic_id) return { error: "Selecione uma clínica ativa." as const };
  const { data: membership } = await supabase
    .from("clinic_members")
    .select("id, role")
    .eq("clinic_id", profile.active_clinic_id)
    .eq("user_id", auth.user.id)
    .eq("status", "active")
    .maybeSingle();
  if (!membership) return { error: "Seu usuário não possui vínculo ativo com a clínica selecionada." as const };
  return { supabase, userId: auth.user.id, clinicId: profile.active_clinic_id, error: null };
}

export async function getMedicalRecordPageData(appointmentId: string) {
  if (!idSchema.safeParse(appointmentId).success) return null;
  const current = await context();
  if (current.error) return { error: current.error, appointment: null, record: null, canEdit: false };

  const { data: appointment, error: appointmentError } = await current.supabase
    .from("appointments")
    .select("id, clinic_id, patient_id, professional_id, title, appointment_date, start_time, status, patient:patients(id, full_name, birth_date, cpf, phone, insurance, allergies, continuous_medications, medical_history)")
    .eq("id", appointmentId)
    .eq("clinic_id", current.clinicId)
    .maybeSingle();
  if (appointmentError || !appointment) return null;

  const [{ data: professional }, { data: record, error: recordError }] = await Promise.all([
    current.supabase.from("profiles").select("full_name").eq("id", appointment.professional_id).maybeSingle(),
    current.supabase.from("medical_records").select("*").eq("appointment_id", appointmentId).is("deleted_at", null).maybeSingle(),
  ]);
  if (recordError) {
    console.error("medical record load failed", {
      message: recordError.message,
      details: recordError.details,
      hint: recordError.hint,
      code: recordError.code,
    });
    return { error: "Não foi possível carregar o prontuário.", appointment: null, record: null, canEdit: false };
  }

  const normalizedAppointment = {
    ...appointment,
    patient: Array.isArray(appointment.patient) ? appointment.patient[0] ?? null : appointment.patient,
    professional,
  } as MedicalRecordAppointment;

  return {
    error: null,
    appointment: normalizedAppointment,
    record: (record as MedicalRecord | null) ?? null,
    canEdit: appointment.professional_id === current.userId,
  };
}

export async function saveMedicalRecord(appointmentId: string, values: MedicalRecordFormValues): Promise<SaveResult> {
  if (!idSchema.safeParse(appointmentId).success) return { error: "Consulta inválida." };
  const parsed = medicalRecordSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados clínicos inválidos." };
  const current = await context();
  if (current.error) return { error: current.error };

  const { data: appointment } = await current.supabase
    .from("appointments")
    .select("id, professional_id")
    .eq("id", appointmentId)
    .eq("clinic_id", current.clinicId)
    .maybeSingle();
  if (!appointment) return { error: "Consulta não encontrada na clínica ativa." };
  if (appointment.professional_id !== current.userId) return { error: "Somente o profissional da consulta pode salvar o prontuário." };

  const { data: existing, error: lookupError } = await current.supabase
    .from("medical_records")
    .select("id")
    .eq("appointment_id", appointmentId)
    .is("deleted_at", null)
    .maybeSingle();
  if (lookupError) return { error: "Não foi possível verificar o prontuário da consulta." };

  const payload = recordPayload(parsed.data);
  const result = existing
    ? await current.supabase.from("medical_records").update(payload).eq("id", existing.id).select("id").single()
    : await current.supabase.from("medical_records").insert({ appointment_id: appointmentId, ...payload }).select("id").single();

  if (result.error || !result.data) {
    console.error("medical record save failed", {
      message: result.error?.message,
      details: result.error?.details,
      hint: result.error?.hint,
      code: result.error?.code,
    });
    return { error: "Não foi possível salvar o prontuário." };
  }

  revalidatePath(`/consultas/${appointmentId}/prontuario`);
  revalidatePath(`/consultas/${appointmentId}`);
  revalidatePath(`/appointments/${appointmentId}`);
  return { success: "Prontuário salvo com sucesso.", id: result.data.id };
}
