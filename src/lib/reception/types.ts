import type { AppointmentStatus } from "@/lib/appointments/types";

export interface ReceptionPatient {
  appointmentId: string;
  patientId: string;
  professionalId: string;
  status: AppointmentStatus;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  appointmentNotes: string | null;
  checkInAt: string | null;
  checkedInBy: string | null;
  waitingSince: string | null;
  calledAt: string | null;
  finishedAt: string | null;
  arrivalNotes: string | null;
  patient: {
    fullName: string;
    birthDate: string | null;
    gender: string | null;
    phone: string | null;
    cpf: string | null;
    insurance: string | null;
    insuranceCard: string | null;
    notes: string | null;
    medicalHistory: string | null;
    photoUrl: string | null;
  };
  professionalName: string;
  lastAppointmentAt: string | null;
  checkedInByName: string | null;
}
