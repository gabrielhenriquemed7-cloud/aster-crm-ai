export const appointmentStatuses = ["scheduled", "confirmed", "waiting", "in_progress", "completed", "cancelled", "no_show"] as const;
export type AppointmentStatus = (typeof appointmentStatuses)[number];
export const appointmentStatusLabels: Record<AppointmentStatus, string> = {
  scheduled: "Agendada", confirmed: "Confirmada", waiting: "Aguardando", in_progress: "Em atendimento",
  completed: "Finalizada", cancelled: "Cancelada", no_show: "Faltou",
};

export const appointmentTypes = ["consultation", "return", "procedure", "teleconsultation", "exam", "other"] as const;
export type AppointmentType = (typeof appointmentTypes)[number];
export const appointmentTypeLabels: Record<AppointmentType, string> = {
  consultation: "Consulta", return: "Retorno", procedure: "Procedimento",
  teleconsultation: "Teleconsulta", exam: "Exame", other: "Outro",
};

export interface Appointment {
  id: string;
  clinic_id: string;
  patient_id: string;
  professional_id: string;
  title: string;
  appointment_date: string;
  start_time: string;
  end_time: string;
  appointment_type: AppointmentType;
  status: AppointmentStatus;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  arrived_at: string | null;
  check_in_at: string | null;
  checked_in_by: string | null;
  waiting_since: string | null;
  called_at: string | null;
  finished_at: string | null;
  arrival_notes: string | null;
  started_at: string | null;
  completed_at: string | null;
  completed_by: string | null;
  patient?: { full_name: string; phone: string | null } | null;
  professional?: { full_name: string | null } | null;
}

export interface Professional { id: string; full_name: string | null; role: string; }
