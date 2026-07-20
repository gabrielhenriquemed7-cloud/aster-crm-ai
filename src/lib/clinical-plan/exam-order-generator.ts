import type { ExamOrder, ExamOrderPreview } from "@/lib/clinical-plan/types";

const priorityLabels = {
  routine: "Rotina",
  priority: "Prioritário",
  urgent: "Urgente",
} as const;

export interface ExamOrderDocumentIdentity {
  clinicName: string;
  clinicLogoUrl?: string | null;
  patientName: string;
  patientBirthDate?: string | null;
  patientCpf?: string | null;
  patientRecordNumber: string;
  professionalName: string;
  council?: string | null;
  councilNumber?: string | null;
  specialty?: string | null;
  dateTime: string;
}

export interface ExamOrderGeneratorInput {
  items: ExamOrder[];
  generalClinicalIndication: string;
  generalDiagnosisRef: string;
  generalGuidance: string;
  identity: ExamOrderDocumentIdentity;
}

export class ExamOrderGenerator {
  static itemText(item: ExamOrder, index: number) {
    return [
      `${index + 1}. ${item.name}`,
      `${item.category} · ${item.type === "exam" ? "Exame" : "Procedimento diagnóstico"} · Prioridade: ${priorityLabels[item.priority]}`,
      item.clinicalIndication &&
        `Indicação específica: ${item.clinicalIndication}`,
      item.diagnosisRef && `Diagnóstico relacionado: ${item.diagnosisRef}`,
      item.guidance && `Orientação: ${item.guidance}`,
      item.observations && `Observações: ${item.observations}`,
      item.expectedDate && `Data prevista: ${item.expectedDate}`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  static generate(input: ExamOrderGeneratorInput): ExamOrderPreview {
    const { identity } = input;
    const header = [
      identity.clinicName,
      "SOLICITAÇÃO DE EXAMES E PROCEDIMENTOS",
      `Paciente: ${identity.patientName}`,
      identity.patientBirthDate &&
        `Nascimento: ${new Date(`${identity.patientBirthDate}T12:00:00`).toLocaleDateString("pt-BR")}`,
      identity.patientCpf && `CPF: ${identity.patientCpf}`,
      `Prontuário: ${identity.patientRecordNumber}`,
      `Data e horário: ${new Date(identity.dateTime).toLocaleString("pt-BR")}`,
    ]
      .filter(Boolean)
      .join("\n");
    const items = input.items
      .map((item, index) => this.itemText(item, index))
      .join("\n\n");
    const footer = [
      input.generalClinicalIndication &&
        `INDICAÇÃO CLÍNICA\n${input.generalClinicalIndication}`,
      input.generalDiagnosisRef &&
        `DIAGNÓSTICOS RELACIONADOS\n${input.generalDiagnosisRef}`,
      input.generalGuidance && `ORIENTAÇÕES\n${input.generalGuidance}`,
      [
        "PROFISSIONAL RESPONSÁVEL",
        identity.professionalName,
        [identity.council, identity.councilNumber].filter(Boolean).join(" "),
        identity.specialty,
        "\n________________________________\nAssinatura",
      ]
        .filter(Boolean)
        .join("\n"),
    ]
      .filter(Boolean)
      .join("\n\n");
    return {
      title: "Solicitação de Exames e Procedimentos",
      body: [header, items, footer].filter(Boolean).join("\n\n"),
      itemCount: input.items.length,
    };
  }

  static toRecordText(input: Omit<ExamOrderGeneratorInput, "identity">) {
    return [
      input.items.map((item, index) => this.itemText(item, index)).join("\n\n"),
      input.generalClinicalIndication &&
        `INDICAÇÃO CLÍNICA GERAL\n${input.generalClinicalIndication}`,
      input.generalDiagnosisRef &&
        `DIAGNÓSTICO GERAL RELACIONADO\n${input.generalDiagnosisRef}`,
      input.generalGuidance && `ORIENTAÇÕES GERAIS\n${input.generalGuidance}`,
    ]
      .filter(Boolean)
      .join("\n\n");
  }
}
