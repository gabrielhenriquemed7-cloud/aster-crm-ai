import { z } from "zod";

const item = z.string().trim().min(1).max(500);

export const realtimeClinicalAnalysisSchema = z
  .object({
    hypotheses: z
      .array(
        z
          .object({
            name: item,
            compatibility: z.enum(["Alta", "Moderada", "Baixa"]),
          })
          .strict(),
      )
      .max(5),
    questions: z.array(item).max(8),
    physicalExam: z.array(item).max(8),
    alerts: z.array(item).max(6),
    importantData: z.array(item).max(6),
  })
  .strict();

export type RealtimeClinicalAnalysis = z.infer<
  typeof realtimeClinicalAnalysisSchema
>;

export const realtimeClinicalAnalysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    hypotheses: {
      type: "array",
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          compatibility: {
            type: "string",
            enum: ["Alta", "Moderada", "Baixa"],
          },
        },
        required: ["name", "compatibility"],
      },
    },
    questions: { type: "array", maxItems: 8, items: { type: "string" } },
    physicalExam: {
      type: "array",
      maxItems: 8,
      items: { type: "string" },
    },
    alerts: { type: "array", maxItems: 6, items: { type: "string" } },
    importantData: {
      type: "array",
      maxItems: 6,
      items: { type: "string" },
    },
  },
  required: [
    "hypotheses",
    "questions",
    "physicalExam",
    "alerts",
    "importantData",
  ],
} as const;
