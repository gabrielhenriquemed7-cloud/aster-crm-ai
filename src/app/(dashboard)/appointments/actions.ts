"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { appointmentSchema, type AppointmentFormValues } from "@/lib/appointments/schema";
import type { Appointment, AppointmentStatus, Professional } from "@/lib/appointments/types";
import type { Patient } from "@/lib/patients/types";
import { createClient } from "@/lib/supabase/server";

type Result = { error?: string; id?: string; success?: string };
type DbError = {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
};
const idSchema = z.string().uuid("Consulta inválida.");

function refresh(id?: string) {
  revalidatePath("/appointments"); revalidatePath("/dashboard"); revalidatePath("/recepcao");
  if (id) revalidatePath(`/appointments/${id}`);
}

function errorMessage(error: DbError | null, fallback: string) {
  const message = error?.message ?? "";
  if (message.includes("Conflito de horário")) return "Conflito de horário: o profissional já possui uma consulta neste período.";
  if (message.includes("Paciente não pertence")) return "O paciente selecionado não pertence à clínica ativa.";
  if (message.includes("Profissional não pertence")) return "O profissional selecionado não pertence à clínica ativa.";
  if (message.includes("motivo do cancelamento")) return "Informe o motivo do cancelamento.";
  if (message.includes("Somente o profissional responsável")) return message;
  if (message.includes("precisa estar aguardando")) return message;
  if (message.includes("Consulta não encontrada na clínica ativa")) return message;
  console.error("appointment database error", {
    message: error?.message ?? null,
    details: error?.details ?? null,
    hint: error?.hint ?? null,
    code: error?.code ?? null,
  });
  return fallback;
}

async function context() {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase não configurado." as const };
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "Sua sessão expirou. Entre novamente." as const };
  const { data: profile } = await supabase.from("profiles").select("active_clinic_id").eq("id", auth.user.id).maybeSingle();
  if (!profile?.active_clinic_id) return { error: "Selecione uma clínica ativa." as const };
  const { data: member } = await supabase.from("clinic_members").select("id").eq("clinic_id", profile.active_clinic_id).eq("user_id", auth.user.id).eq("status", "active").maybeSingle();
  if (!member) return { error: "Seu usuário não possui vínculo ativo com a clínica selecionada." as const };
  return { supabase, userId: auth.user.id, clinicId: profile.active_clinic_id, error: null };
}

async function addProfessionalNames(appointments: Appointment[], supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>) {
  const ids = [...new Set(appointments.map((item) => item.professional_id))];
  if (!ids.length) return appointments;
  const { data } = await supabase.from("profiles").select("id, full_name").in("id", ids);
  const names = new Map((data ?? []).map((profile) => [profile.id, profile.full_name]));
  return appointments.map((item) => ({ ...item, professional: { full_name: names.get(item.professional_id) ?? "Profissional" } }));
}

export async function listAppointments({ from, to, search = "", professionalId = "", status = "" }: { from: string; to: string; search?: string; professionalId?: string; status?: string }) {
  const current = await context();
  if (current.error) return { appointments: [] as Appointment[], error: current.error };
  let query = current.supabase.from("appointments").select("*, patient:patients(full_name, phone)").eq("clinic_id", current.clinicId).gte("appointment_date", from).lte("appointment_date", to).order("appointment_date").order("start_time");
  if (professionalId) query = query.eq("professional_id", professionalId);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) return { appointments: [] as Appointment[], error: errorMessage(error, "Não foi possível carregar a agenda.") };
  let appointments = (data ?? []) as Appointment[];
  if (search.trim()) appointments = appointments.filter((item) => item.patient?.full_name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  return { appointments: await addProfessionalNames(appointments, current.supabase), error: null };
}

export async function getAppointment(id: string) {
  if (!idSchema.safeParse(id).success) return null;
  const current = await context(); if (current.error) return null;
  const { data } = await current.supabase.from("appointments").select("*, patient:patients(full_name, phone)").eq("id", id).eq("clinic_id", current.clinicId).maybeSingle();
  if (!data) return null;
  return (await addProfessionalNames([data as Appointment], current.supabase))[0] ?? null;
}

export async function getAppointmentFormData() {
  const current = await context();
  if (current.error) return { patients: [] as Pick<Patient, "id" | "full_name">[], professionals: [] as Professional[], currentUserId: "", defaultDuration: 30, error: current.error };
  const [{ data: patients }, { data: members }] = await Promise.all([
    current.supabase.from("patients").select("id, full_name").eq("clinic_id", current.clinicId).is("deleted_at", null).order("full_name"),
    current.supabase.from("clinic_members").select("user_id, role").eq("clinic_id", current.clinicId).eq("status", "active").in("role", ["clinic_admin", "doctor"]),
  ]);
  const memberIds = (members ?? []).map((member) => member.user_id);
  const { data: profiles } = memberIds.length ? await current.supabase.from("profiles").select("id, full_name").in("id", memberIds) : { data: [] };
  const profileNames = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name]));
  const professionals = (members ?? []).map((member) => ({ id: member.user_id, role: member.role, full_name: profileNames.get(member.user_id) ?? "Profissional" }));
  const { data: schedule } = await current.supabase.from("schedule_settings").select("default_duration").eq("clinic_id", current.clinicId).maybeSingle();
  return { patients: (patients ?? []) as Pick<Patient, "id" | "full_name">[], professionals, currentUserId: current.userId, defaultDuration: schedule?.default_duration ?? 30, error: null };
}

async function saveAppointment(id: string | null, values: AppointmentFormValues): Promise<Result> {
  const parsed = appointmentSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const current = await context(); if (current.error) return { error: current.error };
  const payload = { ...parsed.data, notes: parsed.data.notes || null, cancellation_reason: parsed.data.cancellation_reason || null };
  const conflictQuery = current.supabase.from("appointments").select("id").eq("clinic_id", current.clinicId).eq("professional_id", payload.professional_id).eq("appointment_date", payload.appointment_date).not("status", "in", "(cancelled,no_show)").lt("start_time", payload.end_time).gt("end_time", payload.start_time);
  const { data: conflicts, error: conflictError } = id ? await conflictQuery.neq("id", id).limit(1) : await conflictQuery.limit(1);
  if (conflictError) return { error: errorMessage(conflictError, "Não foi possível validar o horário.") };
  if (conflicts?.length) return { error: "Conflito de horário: o profissional já possui uma consulta neste período." };
  if (id) {
    const { error } = await current.supabase.from("appointments").update(payload).eq("id", id).eq("clinic_id", current.clinicId);
    if (error) return { error: errorMessage(error, "Não foi possível atualizar a consulta.") };
    refresh(id); return { success: "Consulta atualizada com sucesso.", id };
  }
  const { data, error } = await current.supabase.from("appointments").insert(payload).select("id").single();
  if (error || !data) return { error: errorMessage(error, "Não foi possível agendar a consulta.") };
  refresh(data.id); return { success: "Consulta agendada com sucesso.", id: data.id };
}

export async function createAppointment(values: AppointmentFormValues) { return saveAppointment(null, values); }
export async function updateAppointment(id: string, values: AppointmentFormValues) { if (!idSchema.safeParse(id).success) return { error: "Consulta inválida." }; return saveAppointment(id, values); }

export async function updateAppointmentStatus(id: string, status: AppointmentStatus, reason = ""): Promise<Result> {
  if (!idSchema.safeParse(id).success) return { error: "Consulta inválida." };
  const allowed: AppointmentStatus[] = ["confirmed", "waiting", "cancelled", "no_show"];
  if (!allowed.includes(status)) return { error: "Status inválido." };
  if (status === "cancelled" && !reason.trim()) return { error: "Informe o motivo do cancelamento." };
  const current = await context(); if (current.error) return { error: current.error };
  const { data: appointment } = await current.supabase.from("appointments").select("status").eq("id", id).eq("clinic_id", current.clinicId).maybeSingle();
  if (!appointment) return { error: "Consulta não encontrada na clínica ativa." };
  const transitions: Partial<Record<AppointmentStatus, AppointmentStatus[]>> = { scheduled: ["confirmed", "cancelled", "no_show"], confirmed: ["waiting", "cancelled", "no_show"] };
  if (!transitions[appointment.status as AppointmentStatus]?.includes(status)) return { error: "Esta mudança de status não é permitida no fluxo clínico." };
  const { error } = await current.supabase.from("appointments").update({ status, cancellation_reason: status === "cancelled" ? reason.trim() : null, arrived_at: status === "waiting" ? new Date().toISOString() : undefined }).eq("id", id).eq("clinic_id", current.clinicId);
  if (error) return { error: errorMessage(error, "Não foi possível atualizar o status da consulta.") };
  refresh(id); return { success: status === "cancelled" ? "Consulta cancelada." : "Status atualizado com sucesso.", id };
}

export async function startClinicalEncounter(id: string, lockToken: string): Promise<{ error?: string }> {
  if (!idSchema.safeParse(id).success) return { error: "Consulta inválida." };
  if (!idSchema.safeParse(lockToken).success) return { error: "Sessão de edição inválida." };
  const current = await context(); if (current.error) return { error: current.error };
  const { error } = await current.supabase.rpc("open_or_resume_consultation", { target_appointment_id: id, lock_token: lockToken });
  if (error) return { error: errorMessage(error, "Não foi possível iniciar o atendimento.") };
  refresh(id); revalidatePath(`/consultas/${id}/prontuario`);
  redirect(`/consultas/${id}/prontuario?session=${lockToken}`);
}

export async function getTodayAppointmentMetrics() {
  const current = await context(); if (current.error) return { total: 0, awaitingConfirmation: 0, error: current.error };
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date());
  const { data, error } = await current.supabase.from("appointments").select("status").eq("clinic_id", current.clinicId).eq("appointment_date", today).neq("status", "cancelled");
  if (error) return { total: 0, awaitingConfirmation: 0, error: "Não foi possível carregar os indicadores da agenda." };
  return { total: data?.length ?? 0, awaitingConfirmation: data?.filter((item) => item.status === "scheduled").length ?? 0, error: null };
}
