import type {
  MedicalRecordCenterData,
  MedicalRecordDocumentKind,
} from "@/lib/medical-record-center/types";

export interface MedicalRecordDocumentDefinition {
  kind: MedicalRecordDocumentKind;
  label: string;
  enabled: boolean;
}

const definitions: MedicalRecordDocumentDefinition[] = [
  { kind: "complete_record", label: "Prontuário Completo", enabled: true },
  {
    kind: "appointment_summary",
    label: "Resumo do Atendimento",
    enabled: false,
  },
  { kind: "evolution", label: "Evolução", enabled: false },
  { kind: "anamnesis", label: "Anamnese", enabled: false },
  { kind: "physical_exam", label: "Exame Físico", enabled: false },
  { kind: "prescription", label: "Receita", enabled: false },
  { kind: "exam_request", label: "Solicitação de Exames", enabled: false },
  { kind: "referral", label: "Encaminhamento", enabled: false },
  { kind: "certificate", label: "Atestado", enabled: false },
  { kind: "medical_report", label: "Relatório Médico", enabled: false },
];

export const MedicalRecordDocumentFactory = {
  list: () => definitions,
  get(kind: MedicalRecordDocumentKind) {
    const definition = definitions.find((item) => item.kind === kind);
    if (!definition)
      throw new Error(`Tipo de documento não suportado: ${kind}`);
    return definition;
  },
  create(kind: MedicalRecordDocumentKind, data: MedicalRecordCenterData) {
    const definition = this.get(kind);
    if (!definition.enabled)
      throw new Error(`Tipo de documento ainda não habilitado: ${kind}`);
    return { definition, data };
  },
};
