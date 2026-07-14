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
  patientName: string | null;
  age: number | null;
  gender: string | null;
  allergies: string | null;
  medications: string | null;
  chiefComplaint: string | null;
  previousHistory: string[];
  personalHistory: string | null;
};

export type ClinicalAiRequestType =
  | "structured_anamnesis"
  | "soap"
  | "hypotheses"
  | "cid10"
  | "exams"
  | "conduct";

export class ClinicalAiError extends Error {
  constructor(
    public code:
      | "MISSING_KEY"
      | "NETWORK_ERROR"
      | "OPENAI_AUTH_ERROR"
      | "OPENAI_QUOTA_ERROR"
      | "INVALID_AI_RESPONSE"
      | "SCHEMA_VALIDATION_ERROR"
      | "EMPTY_AI_RESPONSE",
    message: string,
  ) {
    super(message);
  }
}

const SYSTEM_PROMPT = `Você é um assistente de documentação clínica, nunca um substituto da decisão médica.
Organize somente informações presentes no texto e no contexto autorizado. Não invente sinais, sintomas, exames ou antecedentes.
Não afirme diagnóstico definitivo e não prescreva automaticamente. Separe fatos relatados de sugestões, destaque incertezas e use português do Brasil.
Quando houver hipóteses, use linguagem como "Hipóteses a considerar", "Sugestões para avaliação profissional" e "Necessita correlação clínica".
Concentre a resposta no requestType solicitado e deixe vazios os campos que não forem pertinentes. Registre alertas, incertezas e dados ausentes em alertsAndMissingInformation.
Campos sem informação devem ser uma string vazia. Toda saída exige revisão médica. Responda estritamente no schema JSON solicitado.`;

function responseText(payload: unknown) {
  const value = payload as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
    choices?: Array<{ message?: { content?: string } }>;
  };
  return (
    value.output_text ??
    value.output
      ?.flatMap((item) => item.content ?? [])
      .find((item) => item.type === "output_text")?.text ??
    value.choices?.[0]?.message?.content
  );
}

function cleanJsonText(text: string) {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

export async function generateClinicalSuggestion(
  input: string,
  context: ClinicalAiContext,
  config: ClinicalAiConfig,
  requestType: ClinicalAiRequestType,
): Promise<{ suggestion: ClinicalAiSuggestion; model: string }> {
  const key = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_CLINICAL_MODEL || "gpt-4.1-mini";
  if (!key)
    throw new ClinicalAiError(
      "MISSING_KEY",
      "A chave da OpenAI não está configurada.",
    );
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
          requestType,
          authorizedContext: context,
          configuration: config,
        }),
        max_output_tokens: 5000,
        text: {
          format: {
            type: "json_schema",
            name: "clinical_ai_suggestion",
            strict: true,
            schema: clinicalAiJsonSchema,
          },
        },
      }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (error) {
    console.error("ASTER_COPILOT_OPENAI_NETWORK_ERROR", {
      name: error instanceof Error ? error.name : undefined,
      message: error instanceof Error ? error.message : String(error),
      cause:
        error instanceof Error && error.cause instanceof Error
          ? {
              name: error.cause.name,
              message: error.cause.message,
            }
          : error instanceof Error
            ? error.cause
            : undefined,
    });
    throw new ClinicalAiError(
      "NETWORK_ERROR",
      error instanceof Error
        ? `Não foi possível conectar ao serviço de IA: ${error.message}`
        : "Não foi possível conectar ao serviço de IA.",
    );
  }
  if (!response.ok) {
    const errorBody = await response.text();
    let errorMessage = `A OpenAI respondeu com HTTP ${response.status}.`;
    try {
      const payload = JSON.parse(errorBody) as { error?: { message?: string } };
      errorMessage = payload.error?.message || errorMessage;
    } catch {}
    console.error("ASTER_COPILOT_OPENAI_HTTP_ERROR", {
      requestType,
      model,
      status: response.status,
      errorMessage,
      errorBodyLength: errorBody.length,
    });
    if (response.status === 401 || response.status === 403)
      throw new ClinicalAiError("OPENAI_AUTH_ERROR", errorMessage);
    if (response.status === 429)
      throw new ClinicalAiError("OPENAI_QUOTA_ERROR", errorMessage);
    throw new ClinicalAiError("NETWORK_ERROR", errorMessage);
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ClinicalAiError(
      "INVALID_AI_RESPONSE",
      "A IA respondeu, mas o formato não pôde ser interpretado.",
    );
  }
  const text = responseText(payload);
  if (!text?.trim())
    throw new ClinicalAiError(
      "EMPTY_AI_RESPONSE",
      "A IA respondeu sem conteúdo utilizável.",
    );
  const cleanedText = cleanJsonText(text);
  let json: unknown;
  try {
    json = JSON.parse(cleanedText);
  } catch {
    throw new ClinicalAiError(
      "INVALID_AI_RESPONSE",
      "A IA respondeu, mas o formato não pôde ser interpretado.",
    );
  }
  const validated = clinicalAiSuggestionSchema.safeParse(json);
  if (!validated.success) {
    console.error("ASTER_COPILOT_OPENAI_SCHEMA_ERROR", {
      requestType,
      model,
      issueCount: validated.error.issues.length,
      issuePaths: validated.error.issues.map((issue) => issue.path.join(".")),
    });
    throw new ClinicalAiError(
      "SCHEMA_VALIDATION_ERROR",
      "A resposta da IA não corresponde ao formato clínico esperado.",
    );
  }
  const parsed = validated.data;
  if (!config.suggestCid) parsed.cid10Suggestions = "";
  if (!config.suggestDifferentials) parsed.differentialDiagnoses = "";
  if (!config.suggestExams) parsed.suggestedExams = "";
  if (!config.suggestConduct && requestType !== "soap") parsed.plan = "";
  return { suggestion: parsed, model };
}
