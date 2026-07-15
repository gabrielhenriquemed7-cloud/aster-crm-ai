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
  | "complete_analysis"
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
Use somente informações presentes no relato e no contexto autorizado. Nunca invente sintomas, sinais, antecedentes, exames, diagnósticos ou tratamentos.
Distinga explicitamente fatos relatados pelo paciente, achados objetivos, hipóteses e sugestões. Evite linguagem de certeza indevida e nunca apresente hipótese ou CID como diagnóstico confirmado.
Destaque sinais de alarme e dados clinicamente relevantes que estejam ausentes em alertsAndMissingInformation.
Não prescreva, não emita documentos, não salve dados e não finalize consultas. Toda saída exige revisão e decisão humana antes de qualquer uso no prontuário.
Concentre-se exclusivamente na tarefa solicitada. Não use blocos Markdown nem delimitadores de código e não crie propriedades fora do schema.
Campos não pertinentes à tarefa devem ser string vazia. Responda somente com o objeto JSON compatível com o schema solicitado.`;

const REQUEST_PROMPTS: Record<ClinicalAiRequestType, string> = {
  complete_analysis: `Analise a consulta inteira em uma única resposta coerente e preencha todas as seções aplicáveis do schema.
Inclua anamnese estruturada: identificação, queixa principal, HDA, interrogatório sintomatológico, antecedentes pessoais, familiares e cirúrgicos, medicamentos, alergias, hábitos, exame físico, impressão clínica e informações faltantes.
Inclua uma evolução SOAP reconhecível: em hpi use o subtítulo "S — Subjetivo"; em physicalExam, "O — Objetivo"; em clinicalAssessment, "A — Avaliação"; e em plan, "P — Plano".
Em diagnosticHypotheses liste até cinco hipóteses e, para cada uma, informe nome, compatibilidade qualitativa, argumentos favoráveis, argumentos contrários e dados necessários para confirmação.
Em cid10Suggestions apresente CID principal, alternativas, justificativa e alertas de uso inadequado, sempre como sugestão.
Em suggestedExams separe exames iniciais, conforme hipótese e conforme evolução, com prioridade e justificativa.
Em plan, guidance e followUp separe medidas imediatas, opções não farmacológicas, possibilidades farmacológicas para avaliação, orientações, sinais de alarme, critérios de encaminhamento e internação e reavaliação.
Em alertsAndMissingInformation liste perguntas clínicas importantes ainda não respondidas e achados de exame físico possivelmente incompletos, usando os títulos "Antes de concluir, considere perguntar:" e "Achados que podem ser importantes conforme o contexto:". Nunca transforme lacunas em fatos.
Não duplique desnecessariamente conteúdo entre as seções e não apresente diagnóstico definitivo.`,
  structured_anamnesis: `Produza uma anamnese estruturada com linguagem médica profissional, sem diagnóstico definitivo.
Separe claramente o relato do paciente dos achados objetivos e distribua o conteúdo assim:
- Identificação: no início de personalHistory, com o título "Identificação", usando apenas idade e sexo/gênero disponíveis.
- Queixa principal: chiefComplaint.
- História da doença atual: hpi, em ordem cronológica.
- Interrogatório sintomatológico: reviewOfSystems.
- Antecedentes pessoais e antecedentes cirúrgicos: personalHistory, em subtítulos separados.
- Antecedentes familiares: familyHistory.
- Medicamentos em uso: medications.
- Alergias: allergies.
- Hábitos de vida: socialHistory.
- Sinais vitais: vitalSigns.
- Exame físico: physicalExam.
- Impressão clínica: clinicalAssessment, como síntese provisória.
- Informações faltantes: alertsAndMissingInformation.
Nesta tarefa, quando uma seção clínica solicitada não tiver dado disponível, escreva "Não informado" no campo correspondente. Deixe vazios somente os campos do schema que não pertencem à anamnese.`,
  soap: `Produza exatamente uma evolução SOAP médica, usando somente quatro campos principais:
- S — SUBJETIVO em hpi: queixa principal, sintomas, duração, evolução, negativas relevantes, antecedentes, medicamentos e alergias informados.
- O — OBJETIVO em physicalExam: sinais vitais, exame físico e exames complementares disponíveis. Não invente achados e mantenha vitalSigns vazio para evitar duplicação.
- A — AVALIAÇÃO em clinicalAssessment: síntese clínica, problemas identificados, hipóteses a considerar e informações faltantes, sem diagnóstico definitivo.
- P — PLANO em plan: investigação, medidas iniciais, orientações, acompanhamento e sinais de alarme. Não prescreva automaticamente medicamentos nem doses não solicitadas.
Comece o texto de cada campo com o marcador correspondente: "S — SUBJETIVO", "O — OBJETIVO", "A — AVALIAÇÃO" e "P — PLANO". Use alertsAndMissingInformation apenas para alertas críticos adicionais. Deixe os demais campos vazios.`,
  hypotheses: `Em diagnosticHypotheses, liste no máximo cinco hipóteses em ordem de relevância clínica.
Para cada hipótese informe: nome; compatibilidade qualitativa (alta, moderada ou baixa); argumentos favoráveis; argumentos contrários; e dados necessários para confirmação ou exclusão.
Nunca use porcentagens numéricas. Termine o campo exatamente com: "Hipóteses para apoio à avaliação profissional. Necessitam correlação clínica."
Use differentialDiagnoses somente para diferenciais adicionais permitidos pela configuração e alertsAndMissingInformation para limitações ou sinais de alarme. Deixe os demais campos vazios.`,
  cid10: `Apresente em cid10Suggestions: CID principal sugerido; descrição; justificativa; CIDs alternativos; e situações em que o CID não deve ser utilizado.
Não registre nenhum código como diagnóstico confirmado. Termine o campo exatamente com: "CID sugerido para validação pelo profissional responsável."
Se os dados forem insuficientes para codificação responsável, deixe cid10Suggestions vazio e explique a insuficiência em alertsAndMissingInformation. Deixe os demais campos vazios.`,
  exams: `Organize suggestedExams em quatro grupos: exames iniciais; exames conforme hipótese diagnóstica; exames conforme evolução; e exames que não parecem indicados com os dados atuais.
Para cada exame informe finalidade, hipótese que ajuda a avaliar e prioridade (imediato, breve ou eletivo).
Evite solicitações excessivas ou sem justificativa. Registre alertas e dados necessários em alertsAndMissingInformation. Deixe os demais campos vazios.`,
  conduct: `Produza sugestões de conduta sem prescrever ou executar ações automaticamente. Considere obrigatoriamente alergias e medicamentos em uso.
Em plan, separe: medidas imediatas; tratamento não farmacológico; possibilidades farmacológicas para avaliação; e critérios de encaminhamento.
Em guidance, registre orientações ao paciente e sinais de alarme.
Em followUp, registre o prazo sugerido para reavaliação e acompanhamento.
Em alertsAndMissingInformation, registre critérios de internação e dados necessários antes de decisões terapêuticas, incluindo quando relevantes peso, idade, função renal, gestação e outras condições.
Não defina doses sem dados suficientes e deixe claro que as sugestões não substituem o julgamento profissional. Deixe os demais campos vazios.`,
};

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

function configurationPrompt(config: ClinicalAiConfig) {
  return `CONFIGURAÇÃO OBRIGATÓRIA DA CLÍNICA:
- Idioma da resposta: ${config.language}.
- Especialidade de referência: ${config.specialty || "não informada"}.
- Nível de detalhamento: ${config.detailLevel}.
- Formato preferencial: ${config.evolutionFormat}; preserve o formato especializado da tarefa quando ela exigir estrutura própria.
- Sugestões de CID-10 habilitadas: ${config.suggestCid ? "sim" : "não"}.
- Hipóteses e diferenciais habilitados: ${config.suggestDifferentials ? "sim" : "não"}.
- Sugestões de exames habilitadas: ${config.suggestExams ? "sim" : "não"}.
- Sugestões de conduta habilitadas: ${config.suggestConduct ? "sim" : "não"}.
Não produza conteúdo pertencente a uma opção marcada como não.`;
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
        instructions: `${SYSTEM_PROMPT}\n\n${configurationPrompt(config)}\n\nTAREFA ESPECIALIZADA:\n${REQUEST_PROMPTS[requestType]}`,
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
  if (!config.suggestDifferentials) {
    parsed.diagnosticHypotheses = "";
    parsed.differentialDiagnoses = "";
  }
  if (!config.suggestExams) parsed.suggestedExams = "";
  if (!config.suggestConduct) {
    parsed.plan = "";
    parsed.guidance = "";
    parsed.followUp = "";
  }
  return { suggestion: parsed, model };
}
