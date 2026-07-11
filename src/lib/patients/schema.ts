import { z } from "zod";

const optionalText = z.string().trim().max(1000).optional().or(z.literal(""));
const optionalShortText = z.string().trim().max(160).optional().or(z.literal(""));

export const patientSchema = z.object({
  full_name: z.string().trim().min(3, "Informe o nome completo.").max(160),
  social_name: optionalShortText,
  cpf: z.string().trim().regex(/^$|^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/, "CPF inválido."),
  rg: optionalShortText,
  cns: z.string().trim().regex(/^$|^\d{15}$/, "CNS deve conter 15 dígitos."),
  birth_date: z.string().optional(),
  gender: optionalShortText,
  race_ethnicity: optionalShortText,
  marital_status: optionalShortText,
  nationality: optionalShortText,
  birthplace: optionalShortText,
  mother_name: optionalShortText,
  father_name: optionalShortText,
  occupation: optionalShortText,
  zip_code: z.string().trim().regex(/^$|^\d{5}-?\d{3}$/, "CEP inválido."),
  address: optionalShortText,
  address_number: optionalShortText,
  address_complement: optionalShortText,
  neighborhood: optionalShortText,
  city: optionalShortText,
  state: z.string().trim().max(2).optional().or(z.literal("")),
  phone: z.string().trim().regex(/^$|^\(?\d{2}\)?\s?\d{4,5}-?\d{4}$/, "Telefone inválido."),
  whatsapp: z.string().trim().regex(/^$|^\(?\d{2}\)?\s?\d{4,5}-?\d{4}$/, "WhatsApp inválido."),
  email: z.string().trim().email("E-mail inválido.").optional().or(z.literal("")),
  insurance: optionalShortText,
  insurance_card: optionalShortText,
  emergency_contact_name: optionalShortText,
  emergency_contact_phone: z.string().trim().regex(/^$|^\(?\d{2}\)?\s?\d{4,5}-?\d{4}$/, "Telefone inválido."),
  emergency_contact_relationship: optionalShortText,
  blood_type: optionalShortText,
  allergies: optionalText,
  comorbidities: optionalText,
  continuous_medications: optionalText,
  medical_history: optionalText,
  notes: optionalText,
});

export type PatientFormValues = z.infer<typeof patientSchema>;

export const patientDefaultValues: PatientFormValues = {
  full_name: "", social_name: "", cpf: "", rg: "", cns: "", birth_date: "", gender: "", race_ethnicity: "", marital_status: "",
  nationality: "Brasileira", birthplace: "", mother_name: "", father_name: "", occupation: "", zip_code: "", address: "", address_number: "",
  address_complement: "", neighborhood: "", city: "", state: "", phone: "", whatsapp: "", email: "", insurance: "", insurance_card: "",
  emergency_contact_name: "", emergency_contact_phone: "", emergency_contact_relationship: "", blood_type: "", allergies: "", comorbidities: "",
  continuous_medications: "", medical_history: "", notes: "",
};
