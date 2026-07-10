"use server";

import { revalidatePath } from "next/cache";
import { appointmentSchema, type AppointmentFormValues } from "@/lib/appointments/schema";
import type { Appointment, Doctor } from "@/lib/appointments/types";
import type { Patient } from "@/lib/patients/types";
import { createClient } from "@/lib/supabase/server";

type Result = { error?: string; id?: string; success?: string };
function refresh() { revalidatePath("/appointments"); revalidatePath("/"); revalidatePath("/dashboard"); }

export async function listAppointments({ from, to, search = "", doctorId = "" }: { from: string; to: string; search?: string; doctorId?: string }) {
  const supabase = await createClient(); if (!supabase) return [] as Appointment[];
  let query = supabase.from("appointments").select("*, patient:patients(full_name, phone)").gte("starts_at", from).lt("starts_at", to).order("starts_at");
  if (doctorId) query = query.eq("doctor_id", doctorId);
  const { data } = await query;
  const appointments = (data ?? []) as Appointment[];
  if (!search.trim()) return appointments;
  const term = search.toLocaleLowerCase(); return appointments.filter((item) => item.patient?.full_name.toLocaleLowerCase().includes(term));
}
export async function getAppointment(id: string) { const supabase = await createClient(); if (!supabase) return null; const { data } = await supabase.from("appointments").select("*, patient:patients(full_name, phone)").eq("id", id).maybeSingle(); return data as Appointment | null; }
export async function getAppointmentFormData() { const supabase = await createClient(); if (!supabase) return { patients: [] as Pick<Patient, "id" | "full_name">[], doctors: [] as Doctor[], currentUserId: "" }; const [{ data: patients }, { data: profile }, { data: auth }] = await Promise.all([supabase.from("patients").select("id, full_name").order("full_name"), supabase.from("profiles").select("id, full_name, role").in("role", ["administrator", "doctor"]), supabase.auth.getUser()]); return { patients: (patients ?? []) as Pick<Patient, "id" | "full_name">[], doctors: (profile ?? []) as Doctor[], currentUserId: auth.user?.id ?? "" }; }
export async function createAppointment(values: AppointmentFormValues): Promise<Result> { const parsed = appointmentSchema.safeParse(values); if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." }; const supabase = await createClient(); if (!supabase) return { error: "Configure o Supabase para criar consultas." }; const { data: auth } = await supabase.auth.getUser(); if (!auth.user) return { error: "Faça login para agendar." }; const { data: profile } = await supabase.from("profiles").select("active_clinic_id").eq("id", auth.user.id).maybeSingle(); if (!profile?.active_clinic_id) return { error: "Selecione ou crie uma clínica antes de agendar." }; const { data, error } = await supabase.from("appointments").insert({ ...parsed.data, notes: parsed.data.notes || null, cancellation_reason: parsed.data.cancellation_reason || null, user_id: auth.user.id, clinic_id: profile.active_clinic_id }).select("id").single(); if (error || !data) return { error: "Não foi possível agendar a consulta." }; refresh(); return { success: "Consulta agendada com sucesso.", id: data.id }; }
export async function updateAppointment(id: string, values: AppointmentFormValues): Promise<Result> { const parsed = appointmentSchema.safeParse(values); if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." }; const supabase = await createClient(); if (!supabase) return { error: "Configure o Supabase para editar consultas." }; const { error } = await supabase.from("appointments").update({ ...parsed.data, notes: parsed.data.notes || null, cancellation_reason: parsed.data.cancellation_reason || null }).eq("id", id); if (error) return { error: "Não foi possível atualizar a consulta." }; refresh(); return { success: "Consulta atualizada com sucesso.", id }; }
export async function cancelAppointment(id: string, reason = ""): Promise<Result> { const supabase = await createClient(); if (!supabase) return { error: "Configure o Supabase para cancelar consultas." }; const { error } = await supabase.from("appointments").update({ status: "cancelled", cancellation_reason: reason || null }).eq("id", id); if (error) return { error: "Não foi possível cancelar a consulta." }; refresh(); return { success: "Consulta cancelada." }; }
export async function deleteAppointment(id: string): Promise<Result> { const supabase = await createClient(); if (!supabase) return { error: "Configure o Supabase para excluir consultas." }; const { error } = await supabase.from("appointments").delete().eq("id", id); if (error) return { error: "Não foi possível excluir a consulta." }; refresh(); return { success: "Consulta excluída." }; }
