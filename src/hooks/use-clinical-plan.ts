"use client";

import { useMemo, useState } from "react";

import { ClinicalPlanGenerator } from "@/lib/clinical-plan/generator";
import type {
  ClinicalPlan,
  ClinicalPlanItem,
  ExamOrder,
  FollowUpPlan,
  PatientGuidance,
  PerformedProcedure,
  Referral,
} from "@/lib/clinical-plan/types";

function initialPlan(appointmentId: string): ClinicalPlan {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    appointmentId,
    treatmentItems: [],
    examOrders: [],
    examOrderGeneralIndication: "",
    examOrderGeneralGuidance: "",
    examOrderDiagnosisRef: "",
    procedureOrders: [],
    referrals: [],
    patientGuidance: [],
    followUp: null,
    performedProcedures: [],
    additionalNotes: "",
    createdAt: now,
    updatedAt: now,
    createdBy: null,
  };
}

export function useClinicalPlan(
  appointmentId: string,
  hasPrescription: boolean,
) {
  const [plan, setPlan] = useState(() => initialPlan(appointmentId));
  const [dirty, setDirty] = useState(false);

  function update(change: Partial<ClinicalPlan>) {
    setPlan((current) => ({
      ...current,
      ...change,
      updatedAt: new Date().toISOString(),
    }));
    setDirty(true);
  }

  function moveTreatment(id: string, direction: -1 | 1) {
    setPlan((current) => {
      const items = [...current.treatmentItems];
      const index = items.findIndex((item) => item.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= items.length) return current;
      [items[index], items[target]] = [items[target], items[index]];
      return { ...current, treatmentItems: items };
    });
    setDirty(true);
  }

  const preview = useMemo(
    () => ClinicalPlanGenerator.preview(plan, hasPrescription),
    [hasPrescription, plan],
  );

  return {
    plan,
    dirty,
    preview,
    recordFields: () => ClinicalPlanGenerator.toRecordFields(plan),
    markSaved: () => setDirty(false),
    addTreatment: (item: ClinicalPlanItem) =>
      update({ treatmentItems: [...plan.treatmentItems, item] }),
    updateTreatment: (item: ClinicalPlanItem) =>
      update({
        treatmentItems: plan.treatmentItems.map((entry) =>
          entry.id === item.id ? item : entry,
        ),
      }),
    removeTreatment: (id: string) =>
      update({
        treatmentItems: plan.treatmentItems.filter((item) => item.id !== id),
      }),
    moveTreatment,
    addExam: (item: ExamOrder) => {
      if (
        plan.examOrders.some(
          (entry) =>
            entry.name.trim().toLocaleLowerCase("pt-BR") ===
            item.name.trim().toLocaleLowerCase("pt-BR"),
        )
      )
        return false;
      update({ examOrders: [...plan.examOrders, item] });
      return true;
    },
    setExamOrders: (examOrders: ExamOrder[]) => update({ examOrders }),
    setExamOrderMetadata: (metadata: {
      examOrderGeneralIndication: string;
      examOrderGeneralGuidance: string;
      examOrderDiagnosisRef: string;
    }) => update(metadata),
    updateExam: (item: ExamOrder) =>
      update({
        examOrders: plan.examOrders.map((entry) =>
          entry.id === item.id ? item : entry,
        ),
      }),
    removeExam: (id: string) =>
      update({ examOrders: plan.examOrders.filter((item) => item.id !== id) }),
    addReferral: (item: Referral) => {
      if (
        plan.referrals.some(
          (entry) =>
            entry.destination.trim().toLocaleLowerCase("pt-BR") ===
              item.destination.trim().toLocaleLowerCase("pt-BR") &&
            entry.reason.trim().toLocaleLowerCase("pt-BR") ===
              item.reason.trim().toLocaleLowerCase("pt-BR"),
        )
      )
        return false;
      update({ referrals: [...plan.referrals, item] });
      return true;
    },
    removeReferral: (id: string) =>
      update({ referrals: plan.referrals.filter((item) => item.id !== id) }),
    addGuidance: (item: PatientGuidance) =>
      update({ patientGuidance: [...plan.patientGuidance, item] }),
    removeGuidance: (id: string) =>
      update({
        patientGuidance: plan.patientGuidance.filter((item) => item.id !== id),
      }),
    setFollowUp: (followUp: FollowUpPlan | null) => update({ followUp }),
    addProcedure: (item: PerformedProcedure) =>
      update({
        performedProcedures: [...plan.performedProcedures, item],
      }),
    removeProcedure: (id: string) =>
      update({
        performedProcedures: plan.performedProcedures.filter(
          (item) => item.id !== id,
        ),
      }),
    setAdditionalNotes: (additionalNotes: string) =>
      update({ additionalNotes }),
  };
}
