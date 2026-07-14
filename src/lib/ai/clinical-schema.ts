import { z } from "zod";

const section = z.string().trim().max(12000);

export const clinicalAiSuggestionSchema = z
  .object({
    chiefComplaint: section,
    hpi: section,
    personalHistory: section,
    familyHistory: section,
    socialHistory: section,
    medications: section,
    allergies: section,
    reviewOfSystems: section,
    vitalSigns: section,
    physicalExam: section,
    clinicalAssessment: section,
    diagnosticHypotheses: section,
    differentialDiagnoses: section,
    cid10Suggestions: section,
    plan: section,
    suggestedExams: section,
    guidance: section,
    followUp: section,
    alertsAndMissingInformation: section,
  })
  .strict();

export type ClinicalAiSuggestion = z.infer<typeof clinicalAiSuggestionSchema>;

export const clinicalAiJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: Object.fromEntries(
    Object.keys(clinicalAiSuggestionSchema.shape).map((key) => [
      key,
      { type: "string" },
    ]),
  ),
  required: Object.keys(clinicalAiSuggestionSchema.shape),
} as const;
