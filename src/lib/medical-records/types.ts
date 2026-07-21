export interface MedicalRecord {
  id: string;
  clinic_id: string;
  patient_id: string;
  appointment_id: string;
  professional_id: string;
  chief_complaint: string | null;
  hpi: string | null;
  pmh: string | null;
  medications: string | null;
  allergies: string | null;
  family_history: string | null;
  social_history: string | null;
  physical_exam: string | null;
  assessment: string | null;
  cid10: string | null;
  plan: string | null;
  prescription: string | null;
  prescription_draft: import("@/lib/prescription-engine/types").PrescriptionDraft | null;
  exam_requests: string | null;
  certificate: string | null;
  return_guidance: string | null;
  vital_signs: string | null;
  guidance: string | null;
  status: "draft" | "finalized" | "amended";
  finalized_at: string | null;
  finalized_by: string | null;
  last_saved_at: string | null;
  autosave_version: number;
  draft_state: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface MedicalRecordAppointment {
  id: string;
  clinic_id: string;
  patient_id: string;
  professional_id: string;
  title: string;
  appointment_date: string;
  start_time: string;
  status: string;
  consultation_started_at: string | null;
  patient: {
    id: string;
    full_name: string;
    social_name: string | null;
    birth_date: string | null;
    created_at: string;
    gender: string | null;
    cpf: string | null;
    phone: string | null;
    insurance: string | null;
    insurance_card: string | null;
    photo_url: string | null;
    allergies: string | null;
    continuous_medications: string | null;
    medical_history: string | null;
  } | null;
  professional: { full_name: string | null } | null;
  appointment_type: import("@/lib/appointments/types").AppointmentType;
}

export interface MedicalRecordHistoryItem extends MedicalRecord {
  appointment_date: string;
  start_time: string;
  title: string;
  professional_name: string;
}
