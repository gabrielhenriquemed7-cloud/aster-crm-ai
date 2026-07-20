import type {
  ClinicalPlan,
  ClinicalPlanRecordFields,
  FollowUpPlan,
} from "@/lib/clinical-plan/types";
import { ExamOrderGenerator } from "@/lib/clinical-plan/exam-order-generator";

const statusLabels = {
  planned: "Planejado",
  active: "Ativo",
  completed: "Concluído",
  suspended: "Suspenso",
} as const;

const referralStatusLabels = {
  planned: "Planejado",
  requested: "Solicitado",
  scheduled: "Agendado",
  completed: "Realizado",
  cancelled: "Cancelado",
} as const;

const followUpLabels = {
  days: "Retorno em dias",
  weeks: "Retorno em semanas",
  months: "Retorno em meses",
  specific_date: "Retorno em data específica",
  after_results: "Retorno após resultados de exames",
  as_needed: "Retorno conforme necessidade",
  early_if_worse: "Retorno antecipado em caso de piora",
  continuous: "Acompanhamento contínuo",
  episode_closed: "Encerramento do episódio",
} as const;

function followUpText(followUp: FollowUpPlan | null) {
  if (!followUp) return "";
  return [
    followUpLabels[followUp.type],
    followUp.interval ? `Prazo: ${followUp.interval}` : "",
    followUp.expectedDate
      ? `Data prevista: ${new Date(`${followUp.expectedDate}T12:00:00`).toLocaleDateString("pt-BR")}`
      : "",
    followUp.reason ? `Motivo: ${followUp.reason}` : "",
    followUp.responsible ? `Responsável: ${followUp.responsible}` : "",
    followUp.observations,
  ]
    .filter(Boolean)
    .join("\n");
}

export class ClinicalPlanGenerator {
  static toRecordFields(plan: ClinicalPlan): ClinicalPlanRecordFields {
    const treatment = plan.treatmentItems.map(
      (item) =>
        `- [${statusLabels[item.status]}] ${item.title}${item.details ? ` — ${item.details}` : ""}`,
    );
    const referrals = plan.referrals.map(
      (item) =>
        `- [${referralStatusLabels[item.status]}] ${item.destination}${item.reason ? ` — Motivo: ${item.reason}` : ""}${item.diagnosisRef ? ` — Diagnóstico relacionado: ${item.diagnosisRef}` : ""}`,
    );
    const procedures = plan.performedProcedures.map(
      (item) =>
        `- ${item.name} — ${item.description}${item.result ? ` — Resultado: ${item.result}` : ""}`,
    );
    const planSections = [
      treatment.length && `PLANO TERAPÊUTICO\n${treatment.join("\n")}`,
      referrals.length && `ENCAMINHAMENTOS\n${referrals.join("\n")}`,
      procedures.length && `PROCEDIMENTOS REALIZADOS\n${procedures.join("\n")}`,
      plan.additionalNotes && `OBSERVAÇÕES ADICIONAIS\n${plan.additionalNotes}`,
    ].filter(Boolean);

    return {
      plan: planSections.join("\n\n"),
      exam_requests: ExamOrderGenerator.toRecordText({
        items: plan.examOrders,
        generalClinicalIndication: plan.examOrderGeneralIndication,
        generalDiagnosisRef: plan.examOrderDiagnosisRef,
        generalGuidance: plan.examOrderGeneralGuidance,
      }),
      guidance: plan.patientGuidance
        .map(
          (item) =>
            `- ${item.warningSign ? "[Sinal de alerta] " : ""}${item.text}`,
        )
        .join("\n"),
      return_guidance: followUpText(plan.followUp),
    };
  }

  static preview(plan: ClinicalPlan, hasPrescription: boolean) {
    const fields = this.toRecordFields(plan);
    return [
      fields.plan && `CONDUTA\n${fields.plan}`,
      fields.exam_requests &&
        `SOLICITAÇÕES DE EXAMES E PROCEDIMENTOS\n${fields.exam_requests}`,
      fields.guidance && `ORIENTAÇÕES AO PACIENTE\n${fields.guidance}`,
      fields.return_guidance &&
        `RETORNO E SEGUIMENTO\n${fields.return_guidance}`,
      hasPrescription && "PRESCRIÇÃO\nPrescrição vinculada ao atendimento.",
    ]
      .filter(Boolean)
      .join("\n\n");
  }
}
