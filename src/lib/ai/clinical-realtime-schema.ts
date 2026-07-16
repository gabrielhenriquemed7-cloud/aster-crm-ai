import { z } from "zod";

const text = z.string().trim().max(2000);
const shortList = z.array(text).max(12);
const identified = { id: z.string().trim().min(1).max(120) };

export const realtimeClinicalAnalysisSchema = z
  .object({
    alerts: z
      .array(
        z
          .object({
            ...identified,
            title: text,
            evidence: text,
            confirmationNeeded: shortList,
            suggestedAssessment: text,
            level: z.enum(["crítico", "importante", "atenção"]),
          })
          .strict(),
      )
      .max(8),
    hypotheses: z
      .array(
        z
          .object({
            ...identified,
            name: text,
            compatibility: z.enum(["Alta", "Moderada", "Baixa"]),
            favorableArguments: shortList,
            contraryArguments: shortList,
            missingData: shortList,
            situation: z.enum([
              "nova",
              "mantida",
              "menos provável",
              "removida",
            ]),
          })
          .strict(),
      )
      .max(8),
    missingQuestions: z
      .array(
        z
          .object({
            ...identified,
            category: z.enum([
              "história da doença atual",
              "antecedentes",
              "medicamentos e alergias",
              "epidemiologia",
              "hábitos",
              "revisão de sistemas",
              "fatores de risco",
            ]),
            question: text,
            reason: text,
            priority: z.enum(["alta", "média", "baixa"]),
          })
          .strict(),
      )
      .max(16),
    physicalExamSuggestions: z
      .array(
        z
          .object({
            ...identified,
            systemOrManeuver: text,
            purpose: text,
            relatedHypothesis: text,
            priority: z.enum(["alta", "média", "baixa"]),
          })
          .strict(),
      )
      .max(12),
    testSuggestions: z
      .array(
        z
          .object({
            ...identified,
            name: text,
            purpose: text,
            relatedHypothesis: text,
            priority: z.enum(["imediato", "breve", "eletivo"]),
            indicationCondition: text,
            reasonNotToRequest: text,
          })
          .strict(),
      )
      .max(10),
    importantPatientData: z
      .array(
        z
          .object({
            ...identified,
            label: text,
            value: text,
            source: text,
            divergence: text,
          })
          .strict(),
      )
      .max(16),
    possibleProtocols: z
      .array(
        z
          .object({
            ...identified,
            name: text,
            relevance: text,
            presentCriteria: shortList,
            criteriaToVerify: shortList,
            checklist: shortList,
          })
          .strict(),
      )
      .max(6),
    contradictions: z
      .array(
        z
          .object({
            ...identified,
            description: text,
            sources: shortList,
          })
          .strict(),
      )
      .max(10),
    summary: text,
    updatedAt: z.string().trim().max(100),
  })
  .strict();

export type RealtimeClinicalAnalysis = z.infer<
  typeof realtimeClinicalAnalysisSchema
>;

const stringArray = { type: "array", items: { type: "string" } } as const;
const objectArray = (
  properties: Record<string, unknown>,
  required: string[],
) => ({
  type: "array",
  items: { type: "object", additionalProperties: false, properties, required },
});

export const realtimeClinicalAnalysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    alerts: objectArray(
      {
        id: { type: "string" },
        title: { type: "string" },
        evidence: { type: "string" },
        confirmationNeeded: stringArray,
        suggestedAssessment: { type: "string" },
        level: { type: "string", enum: ["crítico", "importante", "atenção"] },
      },
      [
        "id",
        "title",
        "evidence",
        "confirmationNeeded",
        "suggestedAssessment",
        "level",
      ],
    ),
    hypotheses: objectArray(
      {
        id: { type: "string" },
        name: { type: "string" },
        compatibility: { type: "string", enum: ["Alta", "Moderada", "Baixa"] },
        favorableArguments: stringArray,
        contraryArguments: stringArray,
        missingData: stringArray,
        situation: {
          type: "string",
          enum: ["nova", "mantida", "menos provável", "removida"],
        },
      },
      [
        "id",
        "name",
        "compatibility",
        "favorableArguments",
        "contraryArguments",
        "missingData",
        "situation",
      ],
    ),
    missingQuestions: objectArray(
      {
        id: { type: "string" },
        category: {
          type: "string",
          enum: [
            "história da doença atual",
            "antecedentes",
            "medicamentos e alergias",
            "epidemiologia",
            "hábitos",
            "revisão de sistemas",
            "fatores de risco",
          ],
        },
        question: { type: "string" },
        reason: { type: "string" },
        priority: { type: "string", enum: ["alta", "média", "baixa"] },
      },
      ["id", "category", "question", "reason", "priority"],
    ),
    physicalExamSuggestions: objectArray(
      {
        id: { type: "string" },
        systemOrManeuver: { type: "string" },
        purpose: { type: "string" },
        relatedHypothesis: { type: "string" },
        priority: { type: "string", enum: ["alta", "média", "baixa"] },
      },
      ["id", "systemOrManeuver", "purpose", "relatedHypothesis", "priority"],
    ),
    testSuggestions: objectArray(
      {
        id: { type: "string" },
        name: { type: "string" },
        purpose: { type: "string" },
        relatedHypothesis: { type: "string" },
        priority: { type: "string", enum: ["imediato", "breve", "eletivo"] },
        indicationCondition: { type: "string" },
        reasonNotToRequest: { type: "string" },
      },
      [
        "id",
        "name",
        "purpose",
        "relatedHypothesis",
        "priority",
        "indicationCondition",
        "reasonNotToRequest",
      ],
    ),
    importantPatientData: objectArray(
      {
        id: { type: "string" },
        label: { type: "string" },
        value: { type: "string" },
        source: { type: "string" },
        divergence: { type: "string" },
      },
      ["id", "label", "value", "source", "divergence"],
    ),
    possibleProtocols: objectArray(
      {
        id: { type: "string" },
        name: { type: "string" },
        relevance: { type: "string" },
        presentCriteria: stringArray,
        criteriaToVerify: stringArray,
        checklist: stringArray,
      },
      [
        "id",
        "name",
        "relevance",
        "presentCriteria",
        "criteriaToVerify",
        "checklist",
      ],
    ),
    contradictions: objectArray(
      {
        id: { type: "string" },
        description: { type: "string" },
        sources: stringArray,
      },
      ["id", "description", "sources"],
    ),
    summary: { type: "string" },
    updatedAt: { type: "string" },
  },
  required: [
    "alerts",
    "hypotheses",
    "missingQuestions",
    "physicalExamSuggestions",
    "testSuggestions",
    "importantPatientData",
    "possibleProtocols",
    "contradictions",
    "summary",
    "updatedAt",
  ],
} as const;
