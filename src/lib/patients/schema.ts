import { z } from "zod";

const optionalText = z.string().trim().max(1000).optional().or(z.literal(""));

export const patientSchema = z.object({
  full_name: z.string().trim().min(3, "Informe o nome completo.").max(160),
  cpf: z.string().trim().regex(/^$|^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/, "CPF inválido."),
  cns: z.string().trim().regex(/^$|^\d{15}$/, "CNS deve conter 15 dígitos."),
  birth_date: z.string().optional(),
  gender: optionalText,
  marital_status: optionalText,
  occupation: optionalText,
  zip_code: z.string().trim().regex(/^$|^\d{5}-?\d{3}$/, "CEP inválido."),
  address: optionalText,
  city: optionalText,
  state: z.string().trim().max(2).optional().or(z.literal("")),
  phone: optionalText,
  whatsapp: optionalText,
  email: z.string().trim().email("E-mail inválido.").optional().or(z.literal("")),
  insurance: optionalText,
  insurance_card: optionalText,
  emergency_contact: optionalText,
  allergies: optionalText,
  comorbidities: optionalText,
  notes: optionalText,
});

export type PatientFormValues = z.infer<typeof patientSchema>;

export const patientDefaultValues: PatientFormValues = {
  full_name: "", cpf: "", cns: "", birth_date: "", gender: "", marital_status: "",
  occupation: "", zip_code: "", address: "", city: "", state: "", phone: "",
  whatsapp: "", email: "", insurance: "", insurance_card: "", emergency_contact: "",
  allergies: "", comorbidities: "", notes: "",
};
