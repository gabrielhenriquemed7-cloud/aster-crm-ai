import { z } from "zod";

const text = z.string().trim().max(4000);

export const aiMedicationSchema = z
  .object({
    nome: text,
    principioAtivo: text,
    apresentacao: text,
    dose: text,
    via: text,
    frequencia: text,
    duracao: text,
    orientacoes: text,
    justificativa: text,
    alertas: text,
  })
  .strict();

export const aiPrescriptionSchema = z
  .object({
    diagnosticoProvavel: text,
    medicamentos: z.array(aiMedicationSchema).max(20),
    cuidadosGerais: z.array(text).max(30),
    orientacoesPaciente: z.array(text).max(30),
    observacoes: z.array(text).max(30),
  })
  .strict();

export type AiPrescription = z.infer<typeof aiPrescriptionSchema>;
export type AiMedication = z.infer<typeof aiMedicationSchema>;

export const aiPrescriptionJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    diagnosticoProvavel: { type: "string" },
    medicamentos: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          nome: { type: "string" },
          principioAtivo: { type: "string" },
          apresentacao: { type: "string" },
          dose: { type: "string" },
          via: { type: "string" },
          frequencia: { type: "string" },
          duracao: { type: "string" },
          orientacoes: { type: "string" },
          justificativa: { type: "string" },
          alertas: { type: "string" },
        },
        required: [
          "nome",
          "principioAtivo",
          "apresentacao",
          "dose",
          "via",
          "frequencia",
          "duracao",
          "orientacoes",
          "justificativa",
          "alertas",
        ],
      },
    },
    cuidadosGerais: { type: "array", items: { type: "string" } },
    orientacoesPaciente: { type: "array", items: { type: "string" } },
    observacoes: { type: "array", items: { type: "string" } },
  },
  required: [
    "diagnosticoProvavel",
    "medicamentos",
    "cuidadosGerais",
    "orientacoesPaciente",
    "observacoes",
  ],
} as const;
