import { z } from "zod";

export const timelineEventTypes = [
  "symptom",
  "relevant_denial",
  "history",
  "allergy",
  "medication",
  "vital_sign",
  "physical_exam",
  "hypothesis_added",
  "hypothesis_changed",
  "hypothesis_removed",
  "clinical_alert",
  "question_answered",
  "professional_decision",
] as const;

export const timelineSourceTypes = [
  "transcription",
  "typed_report",
  "medical_record",
  "copilot",
  "professional_action",
] as const;

export const clinicalTimelineEventSchema = z
  .object({
    type: z.enum(timelineEventTypes),
    title: z.string().trim().min(1).max(160),
    content: z.string().trim().min(1).max(1200),
    sourceType: z.enum(timelineSourceTypes),
    sourceStart: z.number().int().min(0).nullable(),
    sourceEnd: z.number().int().min(0).nullable(),
    relativeTimeMs: z.number().int().min(0),
    confidence: z.enum(["high", "moderate", "low"]),
    clinicalRelevance: z.string().trim().max(600),
    relatedHypothesis: z.string().trim().max(200),
  })
  .strict();

export const clinicalTimelineResponseSchema = z
  .object({ events: z.array(clinicalTimelineEventSchema).max(30) })
  .strict();

export type ClinicalTimelineEvent = z.infer<typeof clinicalTimelineEventSchema>;

export const clinicalTimelineJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    events: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          type: { type: "string", enum: timelineEventTypes },
          title: { type: "string" },
          content: { type: "string" },
          sourceType: { type: "string", enum: timelineSourceTypes },
          sourceStart: { type: ["integer", "null"] },
          sourceEnd: { type: ["integer", "null"] },
          relativeTimeMs: { type: "integer", minimum: 0 },
          confidence: {
            type: "string",
            enum: ["high", "moderate", "low"],
          },
          clinicalRelevance: { type: "string" },
          relatedHypothesis: { type: "string" },
        },
        required: [
          "type",
          "title",
          "content",
          "sourceType",
          "sourceStart",
          "sourceEnd",
          "relativeTimeMs",
          "confidence",
          "clinicalRelevance",
          "relatedHypothesis",
        ],
      },
    },
  },
  required: ["events"],
} as const;
