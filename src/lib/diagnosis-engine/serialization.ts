import type {
  ClinicalDiagnosis,
  DiagnosisPriority,
  DiagnosisStatus,
  DiagnosticClassificationSystem,
} from "@/lib/diagnosis-engine/types";

export const diagnosisStatusLabels: Record<DiagnosisStatus, string> = {
  hypothesis: "Hipótese diagnóstica",
  probable: "Diagnóstico provável",
  confirmed: "Diagnóstico confirmado",
  discarded: "Diagnóstico descartado",
  preexisting: "Condição preexistente",
  follow_up: "Problema em acompanhamento",
};

const priorityLabels: Record<DiagnosisPriority, string> = {
  primary: "PRINCIPAL",
  secondary: "SECUNDÁRIO",
};

export function diagnosesToRecordFields(diagnoses: ClinicalDiagnosis[]) {
  return {
    assessment: diagnoses
      .map((item) =>
        [
          `[${priorityLabels[item.priority]}] [${diagnosisStatusLabels[item.status]}] ${item.classificationSystem} ${item.code} — ${item.description}`,
          item.observation?.text &&
            `Observação clínica: ${item.observation.text}`,
        ]
          .filter(Boolean)
          .join("\n"),
      )
      .join("\n\n"),
    cid10: diagnoses
      .map((item) => `${item.classificationSystem}: ${item.code}`)
      .join("\n"),
  };
}

const codePattern = /^(CID-10|CID-11|CIAP-2):\s*(\S+)(?:\s+—\s+(.+))?$/;

export function diagnosesFromRecordFields(
  assessment: string,
  classifications: string,
): ClinicalDiagnosis[] {
  const codes = classifications
    .split("\n")
    .map((line) => line.trim().match(codePattern))
    .filter((match): match is RegExpMatchArray => Boolean(match));
  const blocks = assessment.split(/\n{2,}/);
  return codes.map((match, index) => {
    const block = blocks[index] ?? "";
    const status =
      (Object.entries(diagnosisStatusLabels).find(([, label]) =>
        block.includes(`[${label}]`),
      )?.[0] as DiagnosisStatus | undefined) ?? "hypothesis";
    const observation =
      block.match(/Observação clínica:\s*([\s\S]+)/)?.[1]?.trim() ?? "";
    const description =
      match[3] ?? block.match(/\s—\s([^\n]+)/)?.[1]?.trim() ?? "";
    const now = new Date().toISOString();
    return {
      id: crypto.randomUUID(),
      code: match[2],
      description,
      classificationSystem: match[1] as DiagnosticClassificationSystem,
      priority: block.includes("[PRINCIPAL]") ? "primary" : "secondary",
      status,
      observation: observation ? { text: observation, updatedAt: now } : null,
      origin: "professional",
      createdAt: now,
      updatedAt: now,
      createdBy: null,
    };
  });
}
