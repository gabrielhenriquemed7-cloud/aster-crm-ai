export const appointmentStatuses = ["scheduled", "confirmed", "in_progress", "completed", "cancelled", "no_show"] as const;
export type AppointmentStatus = (typeof appointmentStatuses)[number];
export const appointmentStatusLabels: Record<AppointmentStatus, string> = { scheduled: "Agendada", confirmed: "Confirmada", in_progress: "Em atendimento", completed: "Finalizada", cancelled: "Cancelada", no_show: "Faltou" };

export interface Appointment {
  id: string; patient_id: string; doctor_id: string; starts_at: string; ends_at: string; status: AppointmentStatus; appointment_type: string; notes: string | null; cancellation_reason: string | null; created_at: string; updated_at: string;
  patient?: { full_name: string; phone: string | null } | null;
}

export interface Doctor { id: string; full_name: string | null; }
