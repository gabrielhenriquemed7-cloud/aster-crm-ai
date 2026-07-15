import { z } from "zod";

const text = z.string().trim().max(12000);
const sourceIds = z.array(z.string().trim().max(100)).max(20);
const sourcedItem = z
  .object({
    label: z.string().trim().max(1000),
    details: text,
    sourceIds,
  })
  .strict();

export const longitudinalSummarySchema = z
  .object({
    overview: text,
    activeProblems: z
      .array(
        z
          .object({
            name: z.string().trim().max(500),
            approximateOnset: z.string().trim().max(100),
            status: z.enum([
              "ativo",
              "controlado",
              "em investigação",
              "não confirmado",
            ]),
            lastInformation: text,
            sourceIds,
          })
          .strict(),
      )
      .max(30),
    relevantHistory: z.array(sourcedItem).max(30),
    allergies: z
      .array(
        z
          .object({
            substance: z.string().trim().max(500),
            reaction: text,
            sourceIds,
          })
          .strict(),
      )
      .max(30),
    currentMedications: z.array(sourcedItem).max(40),
    previousMedications: z.array(sourcedItem).max(40),
    discontinuedMedications: z.array(sourcedItem).max(40),
    confirmedDiagnoses: z.array(sourcedItem).max(40),
    registeredCids: z.array(sourcedItem).max(40),
    unconfirmedOldHypotheses: z.array(sourcedItem).max(30),
    relevantExams: z
      .array(
        z
          .object({
            exam: z.string().trim().max(500),
            result: text,
            date: z.string().trim().max(100),
            trend: text,
            sourceIds,
          })
          .strict(),
      )
      .max(40),
    timeline: z
      .array(
        z
          .object({
            date: z.string().trim().max(100),
            reason: text,
            mainFinding: text,
            conduct: text,
            recordedEvolution: text,
            sourceIds,
          })
          .strict(),
      )
      .max(60),
    alerts: z.array(sourcedItem).max(30),
    missingOrUncertainInformation: z.array(sourcedItem).max(30),
    partiallyProcessed: z.boolean(),
  })
  .strict();

export type LongitudinalSummary = z.infer<typeof longitudinalSummarySchema>;

const sourcedItemJson = {
  type: "object",
  additionalProperties: false,
  properties: {
    label: { type: "string" },
    details: { type: "string" },
    sourceIds: { type: "array", items: { type: "string" } },
  },
  required: ["label", "details", "sourceIds"],
} as const;

export const longitudinalSummaryJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    overview: { type: "string" },
    activeProblems: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          approximateOnset: { type: "string" },
          status: {
            type: "string",
            enum: ["ativo", "controlado", "em investigação", "não confirmado"],
          },
          lastInformation: { type: "string" },
          sourceIds: { type: "array", items: { type: "string" } },
        },
        required: [
          "name",
          "approximateOnset",
          "status",
          "lastInformation",
          "sourceIds",
        ],
      },
    },
    relevantHistory: { type: "array", items: sourcedItemJson },
    allergies: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          substance: { type: "string" },
          reaction: { type: "string" },
          sourceIds: { type: "array", items: { type: "string" } },
        },
        required: ["substance", "reaction", "sourceIds"],
      },
    },
    currentMedications: { type: "array", items: sourcedItemJson },
    previousMedications: { type: "array", items: sourcedItemJson },
    discontinuedMedications: { type: "array", items: sourcedItemJson },
    confirmedDiagnoses: { type: "array", items: sourcedItemJson },
    registeredCids: { type: "array", items: sourcedItemJson },
    unconfirmedOldHypotheses: { type: "array", items: sourcedItemJson },
    relevantExams: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          exam: { type: "string" },
          result: { type: "string" },
          date: { type: "string" },
          trend: { type: "string" },
          sourceIds: { type: "array", items: { type: "string" } },
        },
        required: ["exam", "result", "date", "trend", "sourceIds"],
      },
    },
    timeline: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          date: { type: "string" },
          reason: { type: "string" },
          mainFinding: { type: "string" },
          conduct: { type: "string" },
          recordedEvolution: { type: "string" },
          sourceIds: { type: "array", items: { type: "string" } },
        },
        required: [
          "date",
          "reason",
          "mainFinding",
          "conduct",
          "recordedEvolution",
          "sourceIds",
        ],
      },
    },
    alerts: { type: "array", items: sourcedItemJson },
    missingOrUncertainInformation: { type: "array", items: sourcedItemJson },
    partiallyProcessed: { type: "boolean" },
  },
  required: [
    "overview",
    "activeProblems",
    "relevantHistory",
    "allergies",
    "currentMedications",
    "previousMedications",
    "discontinuedMedications",
    "confirmedDiagnoses",
    "registeredCids",
    "unconfirmedOldHypotheses",
    "relevantExams",
    "timeline",
    "alerts",
    "missingOrUncertainInformation",
    "partiallyProcessed",
  ],
} as const;

export type LongitudinalSource = {
  id: string;
  date: string;
  recordType: string;
  professional: string;
  excerpt: string;
  url: string;
};

export type StoredLongitudinalSummary = {
  id: string;
  patient_id: string;
  generated_at: string;
  last_record_at: string | null;
  records_count: number;
  model: string;
  schema_version: string;
  summary: LongitudinalSummary;
  sources: LongitudinalSource[];
  status: string;
  has_new_records?: boolean;
};
