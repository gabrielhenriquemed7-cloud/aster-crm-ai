export interface Patient {
  id: string;
  full_name: string;
  cpf: string | null;
  cns: string | null;
  birth_date: string | null;
  gender: string | null;
  marital_status: string | null;
  occupation: string | null;
  zip_code: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  insurance: string | null;
  insurance_card: string | null;
  emergency_contact: string | null;
  allergies: string | null;
  comorbidities: string | null;
  notes: string | null;
  photo_url: string | null;
  created_at: string;
  updated_at: string;
}

export type PatientInput = Omit<Patient, "id" | "created_at" | "updated_at" | "photo_url">;
