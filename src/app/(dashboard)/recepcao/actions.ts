"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { onPatientCheckedIn, onWaitingRoomEntered } from "@/lib/reception/events";
import type { ReceptionPatient } from "@/lib/reception/types";
import { createClient } from "@/lib/supabase/server";

const idSchema = z.string().uuid();
const notesSchema = z.string().trim().max(2000).optional();

async function receptionContext() {
  const supabase = await createClient();
  if (!supabase) return { error: "Supabase não configurado." as const };
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "Sua sessão expirou. Entre novamente." as const };
  const { data: profile } = await supabase.from("profiles").select("active_clinic_id").eq("id", auth.user.id).maybeSingle();
  if (!profile?.active_clinic_id) return { error: "Selecione uma clínica ativa." as const };
  return { supabase, userId: auth.user.id, clinicId: profile.active_clinic_id, error: null };
}

function todayInClinic() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date());
}

export async function listReceptionPatients(): Promise<{ patients: ReceptionPatient[]; error: string | null }> {
  const current = await receptionContext();
  if (current.error) return { patients: [], error: current.error };
  const today = todayInClinic();
  const { data, error } = await current.supabase
    .from("appointments")
    .select("id, patient_id, professional_id, status, appointment_date, start_time, end_time, notes, check_in_at, checked_in_by, waiting_since, called_at, finished_at, arrival_notes, patient:patients(full_name, birth_date, gender, phone, cpf, insurance, insurance_card, notes, medical_history, photo_url)")
    .eq("clinic_id", current.clinicId)
    .eq("appointment_date", today)
    .order("start_time");
  if (error) return { patients: [], error: "Não foi possível carregar os pacientes de hoje." };

  const rows = data ?? [];
  const professionalIds = [...new Set(rows.flatMap((row) => [row.professional_id, row.checked_in_by].filter(Boolean) as string[]))];
  const patientIds = [...new Set(rows.map((row) => row.patient_id))];
  const [{ data: profiles }, { data: previous }] = await Promise.all([
    professionalIds.length ? current.supabase.from("profiles").select("id, full_name").in("id", professionalIds) : Promise.resolve({ data: [] }),
    patientIds.length
      ? current.supabase.from("appointments").select("patient_id, appointment_date, start_time").eq("clinic_id", current.clinicId).in("patient_id", patientIds).eq("status", "completed").lt("appointment_date", today).order("appointment_date", { ascending: false }).order("start_time", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);
  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name ?? "Profissional"]));
  const lastByPatient = new Map<string, string>();
  for (const item of previous ?? []) {
    if (!lastByPatient.has(item.patient_id)) lastByPatient.set(item.patient_id, `${item.appointment_date}T${item.start_time}`);
  }

  const patients = rows.flatMap((row) => {
    const patient = Array.isArray(row.patient) ? row.patient[0] : row.patient;
    if (!patient) return [];
    return [{
      appointmentId: row.id,
      patientId: row.patient_id,
      professionalId: row.professional_id,
      status: row.status,
      appointmentDate: row.appointment_date,
      startTime: row.start_time,
      endTime: row.end_time,
      appointmentNotes: row.notes,
      checkInAt: row.check_in_at,
      checkedInBy: row.checked_in_by,
      waitingSince: row.waiting_since,
      calledAt: row.called_at,
      finishedAt: row.finished_at,
      arrivalNotes: row.arrival_notes,
      patient: {
        fullName: patient.full_name,
        birthDate: patient.birth_date,
        gender: patient.gender,
        phone: patient.phone,
        cpf: patient.cpf,
        insurance: patient.insurance,
        insuranceCard: patient.insurance_card,
        notes: patient.notes,
        medicalHistory: patient.medical_history,
        photoUrl: patient.photo_url,
      },
      professionalName: names.get(row.professional_id) ?? "Profissional",
      lastAppointmentAt: lastByPatient.get(row.patient_id) ?? null,
      checkedInByName: row.checked_in_by ? names.get(row.checked_in_by) ?? "Usuário da clínica" : null,
    } satisfies ReceptionPatient];
  });
  return { patients, error: null };
}

async function advanceReception(appointmentId: string, status: "confirmed" | "waiting", notes?: string) {
  if (!idSchema.safeParse(appointmentId).success) return { error: "Agendamento inválido." };
  const parsedNotes = notesSchema.safeParse(notes);
  if (!parsedNotes.success) return { error: "As observações devem ter no máximo 2.000 caracteres." };
  const current = await receptionContext();
  if (current.error) return { error: current.error };
  const { data, error } = await current.supabase.rpc("advance_reception_appointment", {
    target_appointment_id: appointmentId,
    target_status: status,
    reception_notes: parsedNotes.data || null,
  });
  if (error) return { error: error.message || "Não foi possível atualizar a Recepção." };
  const appointment = Array.isArray(data) ? data[0] : data;
  const event = { appointmentId, patientId: appointment.patient_id, occurredAt: new Date().toISOString(), actorId: current.userId };
  if (status === "confirmed") await onPatientCheckedIn(event);
  else await onWaitingRoomEntered(event);
  revalidatePath("/recepcao");
  revalidatePath("/appointments");
  revalidatePath("/dashboard");
  revalidatePath(`/appointments/${appointmentId}`);
  return { success: status === "confirmed" ? "Chegada confirmada com sucesso." : "Paciente encaminhado para a fila de espera." };
}

export async function confirmPatientArrival(appointmentId: string, notes?: string) {
  return advanceReception(appointmentId, "confirmed", notes);
}

export async function sendPatientToWaitingRoom(appointmentId: string, notes?: string) {
  return advanceReception(appointmentId, "waiting", notes);
}
