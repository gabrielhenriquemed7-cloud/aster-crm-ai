import type { WorkspaceSectionDefinition } from "@/lib/clinical-workspace/types";

export const workspaceSections: WorkspaceSectionDefinition[] = [
  {
    id: "anamnesis",
    label: "Anamnese",
    shortLabel: "Anamnese",
    selector: '[data-section="chief_complaint"]',
    description: "História clínica e antecedentes",
    contextualTools: ["Captura de áudio", "IA clínica", "Resumo", "Sugestões"],
    futureModules: ["Telemedicina", "Assistente por voz"],
  },
  {
    id: "scores",
    label: "Scores Clínicos",
    shortLabel: "Scores",
    selector: '[data-section="clinical_scores"]',
    description: "Escalas e resultados clínicos",
    contextualTools: ["Escalas disponíveis", "Resultados", "Registro clínico"],
  },
  {
    id: "physical_exam",
    label: "Exame Físico",
    shortLabel: "Exame",
    selector: '[data-section="physical_exam"]',
    description: "Sinais vitais e exame por sistemas",
    contextualTools: ["Sinais vitais", "Alertas", "Resumo"],
    futureModules: ["Dispositivos clínicos"],
  },
  {
    id: "assessment",
    label: "Hipóteses Diagnósticas",
    shortLabel: "Hipóteses",
    selector: '[data-section="assessment"]',
    description: "Diagnósticos e classificações",
    contextualTools: ["CID", "Diagnósticos", "Diferenciais"],
  },
  {
    id: "plan",
    label: "Conduta Clínica",
    shortLabel: "Conduta",
    selector: '[data-section="plan"]',
    description: "Plano terapêutico e seguimento",
    contextualTools: ["Resumo", "Ações rápidas", "Exames", "Encaminhamentos"],
    futureModules: ["Cirurgia", "Internação"],
  },
  {
    id: "prescription",
    label: "Prescrição Médica",
    shortLabel: "Prescrição",
    selector: '[data-section="prescription"]',
    description: "Receita e revisão profissional",
    contextualTools: ["Receita", "Alertas", "Interações"],
  },
  {
    id: "record",
    label: "Prontuário Consolidado",
    shortLabel: "Prontuário",
    selector: '[data-section="documents"]',
    description: "Documento vivo, PDF e documentos",
    contextualTools: ["Preview", "PDF", "Compartilhar", "Documentos"],
    futureModules: ["Vacinas", "Comparação entre consultas"],
  },
];

export function registerWorkspaceSection(
  registry: WorkspaceSectionDefinition[],
  section: WorkspaceSectionDefinition,
) {
  if (registry.some((item) => item.id === section.id)) return registry;
  return [...registry, section];
}
