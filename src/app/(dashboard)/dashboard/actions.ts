"use server";

import type { Appointment, AppointmentStatus } from "@/lib/appointments/types";
import { createClient } from "@/lib/supabase/server";

export interface DashboardData {
  today: Record<AppointmentStatus, number> & { total: number };
  upcoming: Appointment[];
  pending: { unfinishedRecords: number; awaitingReturn: number; unconfirmed: number; documents: number };
  indicators: { newPatients: number; monthlyAppointments: number; attendanceRate: number; scheduledReturns: number };
  error: string | null;
}

const empty: DashboardData = {
  today: { total: 0, scheduled: 0, confirmed: 0, waiting: 0, in_progress: 0, completed: 0, cancelled: 0, no_show: 0 },
  upcoming: [], pending: { unfinishedRecords: 0, awaitingReturn: 0, unconfirmed: 0, documents: 0 },
  indicators: { newPatients: 0, monthlyAppointments: 0, attendanceRate: 0, scheduledReturns: 0 }, error: null,
};

export async function getDashboardData(): Promise<DashboardData> {
  const supabase = await createClient();
  if (!supabase) return { ...empty, error: "Supabase não configurado." };
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ...empty, error: "Sua sessão expirou. Entre novamente." };
  const { data: profile } = await supabase.from("profiles").select("active_clinic_id").eq("id", auth.user.id).maybeSingle();
  if (!profile?.active_clinic_id) return { ...empty, error: "Selecione uma clínica ativa." };
  const clinicId = profile.active_clinic_id;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date());
  const monthStart = `${today.slice(0, 7)}-01`;
  const nextMonth = new Date(`${monthStart}T12:00:00`); nextMonth.setMonth(nextMonth.getMonth() + 1);
  const monthEnd = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(nextMonth);

  const [todayResult, monthResult, patientsResult, recordsResult] = await Promise.all([
    supabase.from("appointments").select("*, patient:patients(full_name, phone)").eq("clinic_id", clinicId).eq("appointment_date", today).order("start_time"),
    supabase.from("appointments").select("id, patient_id, appointment_date, appointment_type, status").eq("clinic_id", clinicId).gte("appointment_date", monthStart).lt("appointment_date", monthEnd),
    supabase.from("patients").select("id", { count: "exact", head: true }).eq("clinic_id", clinicId).is("deleted_at", null).gte("created_at", `${monthStart}T00:00:00`).lt("created_at", `${monthEnd}T00:00:00`),
    supabase.from("medical_records").select("appointment_id, patient_id, return_guidance, certificate, exam_requests").eq("clinic_id", clinicId).is("deleted_at", null),
  ]);
  if (todayResult.error || monthResult.error || patientsResult.error || recordsResult.error) {
    console.error("dashboard load failed", { today: todayResult.error, month: monthResult.error, patients: patientsResult.error, records: recordsResult.error });
    return { ...empty, error: "Não foi possível carregar os indicadores da clínica." };
  }
  const appointments = (todayResult.data ?? []) as Appointment[];
  const professionalIds = [...new Set(appointments.map((item) => item.professional_id))];
  const { data: professionals } = professionalIds.length ? await supabase.from("profiles").select("id, full_name").in("id", professionalIds) : { data: [] };
  const names = new Map((professionals ?? []).map((item) => [item.id, item.full_name]));
  const withNames = appointments.map((item) => ({ ...item, professional: { full_name: names.get(item.professional_id) ?? "Profissional" } }));
  const statusCounts = { ...empty.today };
  for (const item of appointments) { statusCounts.total += 1; statusCounts[item.status] += 1; }
  const records = recordsResult.data ?? [];
  const recordAppointmentIds = new Set(records.map((item) => item.appointment_id));
  const completedTodayWithoutRecord = appointments.filter((item) => item.status === "completed" && !recordAppointmentIds.has(item.id)).length;
  const monthAppointments = monthResult.data ?? [];
  const attended = monthAppointments.filter((item) => item.status === "completed").length;
  const attendanceBase = monthAppointments.filter((item) => item.status === "completed" || item.status === "no_show").length;
  const returnedPatients = new Set(monthAppointments.filter((item) => item.appointment_type === "return" && item.appointment_date >= today).map((item) => item.patient_id));
  const awaitingReturn = new Set(records.filter((item) => item.return_guidance?.trim() && !returnedPatients.has(item.patient_id)).map((item) => item.patient_id)).size;
  return {
    today: statusCounts,
    upcoming: withNames.filter((item) => !["completed", "cancelled", "no_show"].includes(item.status)).slice(0, 6),
    pending: {
      unfinishedRecords: completedTodayWithoutRecord,
      awaitingReturn,
      unconfirmed: statusCounts.scheduled,
      documents: records.filter((item) => (item.certificate?.trim() || item.exam_requests?.trim()) && appointments.some((appointment) => appointment.id === item.appointment_id && appointment.status !== "completed")).length,
    },
    indicators: {
      newPatients: patientsResult.count ?? 0,
      monthlyAppointments: monthAppointments.length,
      attendanceRate: attendanceBase ? Math.round((attended / attendanceBase) * 100) : 0,
      scheduledReturns: monthAppointments.filter((item) => item.appointment_type === "return" && !["cancelled", "no_show"].includes(item.status)).length,
    }, error: null,
  };
}
