import "server-only";

import {
  clinicalAiJsonSchema,
  clinicalAiSuggestionSchema,
  type ClinicalAiSuggestion,
} from "@/lib/ai/clinical-schema";

export type ClinicalAiConfig = {
  language: string;
  specialty: string;
  detailLevel: string;
  evolutionFormat: string;
  suggestCid: boolean;
  suggestDifferentials: boolean;
  suggestExams: boolean;
  suggestConduct: boolean;
};
export type ClinicalAiContext = {
  age: number | null;
  gender: string | null;
  allergies: string | null;
  medications: string | null;
  chiefComplaint: string | null;
  previousHistory: string[];
};

export class ClinicalAiError extends Error {
  constructor(
    public code:
      "MISSING_KEY" | "RATE_LIMIT" | "INVALID_RESPONSE" | "CONNECTION",
    message: string,
  ) {
    super(message);
  }
}

const SYSTEM_PROMPT = `Você é um assistente de documentação clínica, nunca um substituto da decisão médica.
Organize somente informações presentes no texto e no contexto autorizado. Não invente sinais, sintomas, exames ou antecedentes.
Não afirme diagnóstico definitivo e não prescreva automaticamente. Separe fatos relatados de sugestões, destaque incertezas e use português do Brasil.
Campos sem informação devem ser uma string vazia. Toda saída exige revisão médica. Responda estritamente no schema JSON solicitado.`;

function responseText(payload: unknown) {
  const value = payload as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  return (
    value.output_text ??
    value.output
      ?.flatMap((item) => item.content ?? [])
      .find((item) => item.type === "output_text")?.text
  );
}

export async function generateClinicalSuggestion(
  input: string,
  context: ClinicalAiContext,
  config: ClinicalAiConfig,
): Promise<{ suggestion: ClinicalAiSuggestion; model: string }> {
  const key = process.env.OPENAI_API_KEY;
  if (!key)
    throw new ClinicalAiError(
      "MISSING_KEY",
      "A chave da OpenAI não está configurada.",
    );
  const model = process.env.OPENAI_CLINICAL_MODEL || "gpt-4.1-mini";
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        instructions: SYSTEM_PROMPT,
        input: JSON.stringify({
          consultationText: input,
          authorizedContext: context,
          configuration: config,
        }),
        text: {
          format: {
            type: "json_schema",
            name: "clinical_ai_suggestion",
            strict: true,
            schema: clinicalAiJsonSchema,
          },
        },
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new ClinicalAiError(
      "CONNECTION",
      "Não foi possível conectar ao serviço de IA.",
    );
  }
  if (response.status === 429)
    throw new ClinicalAiError(
      "RATE_LIMIT",
      "O limite de uso da IA foi atingido. Tente novamente mais tarde.",
    );
  if (!response.ok)
    throw new ClinicalAiError(
      "CONNECTION",
      "O serviço de IA não respondeu. Tente novamente.",
    );
  const text = responseText(await response.json());
  if (!text)
    throw new ClinicalAiError(
      "INVALID_RESPONSE",
      "A IA retornou uma resposta inválida. Tente novamente.",
    );
  try {
    const parsed = clinicalAiSuggestionSchema.parse(JSON.parse(text));
    if (!config.suggestCid) parsed.cid10Suggestions = "";
    if (!config.suggestDifferentials) parsed.differentialDiagnoses = "";
    if (!config.suggestExams) parsed.suggestedExams = "";
    if (!config.suggestConduct) parsed.plan = "";
    return { suggestion: parsed, model };
  } catch {
    throw new ClinicalAiError(
      "INVALID_RESPONSE",
      "A IA retornou uma resposta inválida. Tente novamente.",
    );
  }
}
