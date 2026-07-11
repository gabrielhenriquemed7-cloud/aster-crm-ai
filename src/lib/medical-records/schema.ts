import { z } from "zod";

const clinicalText = z.string().trim().max(12000, "O campo deve ter no máximo 12.000 caracteres.").optional();

export const medicalRecordSchema = z.object({
  chief_complaint: clinicalText,
  hpi: clinicalText,
  pmh: clinicalText,
  medications: clinicalText,
  allergies: clinicalText,
  family_history: clinicalText,
  social_history: clinicalText,
  physical_exam: clinicalText,
  assessment: clinicalText,
  cid10: z.string().trim().max(500, "CID-10 deve ter no máximo 500 caracteres.").optional(),
  plan: clinicalText,
  prescription: clinicalText,
  exam_requests: clinicalText,
  certificate: clinicalText,
  return_guidance: clinicalText,
});

export type MedicalRecordFormValues = z.infer<typeof medicalRecordSchema>;

export const medicalRecordDefaultValues: MedicalRecordFormValues = {
  chief_complaint: "",
  hpi: "",
  pmh: "",
  medications: "",
  allergies: "",
  family_history: "",
  social_history: "",
  physical_exam: "",
  assessment: "",
  cid10: "",
  plan: "",
  prescription: "",
  exam_requests: "",
  certificate: "",
  return_guidance: "",
};
