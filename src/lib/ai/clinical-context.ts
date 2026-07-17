import type { MedicalRecordFormValues } from "@/lib/medical-records/schema";

export type ClinicalContext = {
  patientSummary?: {
    age?: number;
    gender?: string;
  };
  chiefComplaint?: string;
  historyOfPresentIllness?: string;
  personalHistory?: string;
  currentMedications?: string;
  allergies?: string;
  familyHistory?: string;
  socialHistory?: string;
  reviewOfSystems?: string;
  physicalExam?: string;
  vitalSigns?: string;
  hypotheses?: string;
  diagnoses?: string;
  requestedTests?: string;
  treatmentPlan?: string;
  prescriptions?: string;
  referrals?: string;
  recentTimeline?: string[];
  transcription?: string;
  lastUpdatedAt: string;
};

function present(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized || undefined;
}

export function buildClinicalContext({
  values,
  transcription,
  patientAge,
  patientGender,
}: {
  values: MedicalRecordFormValues;
  transcription: string;
  patientAge: number | null;
  patientGender: string | null;
}): ClinicalContext {
  const patientSummary = {
    ...(patientAge !== null ? { age: patientAge } : {}),
    ...(present(patientGender) ? { gender: present(patientGender) } : {}),
  };

  return {
    ...(Object.keys(patientSummary).length ? { patientSummary } : {}),
    ...(present(values.chief_complaint)
      ? { chiefComplaint: present(values.chief_complaint) }
      : {}),
    ...(present(values.hpi)
      ? { historyOfPresentIllness: present(values.hpi) }
      : {}),
    ...(present(values.pmh) ? { personalHistory: present(values.pmh) } : {}),
    ...(present(values.medications)
      ? { currentMedications: present(values.medications) }
      : {}),
    ...(present(values.allergies) ? { allergies: present(values.allergies) } : {}),
    ...(present(values.family_history)
      ? { familyHistory: present(values.family_history) }
      : {}),
    ...(present(values.social_history)
      ? { socialHistory: present(values.social_history) }
      : {}),
    ...(present(values.physical_exam)
      ? { physicalExam: present(values.physical_exam) }
      : {}),
    ...(present(values.vital_signs)
      ? { vitalSigns: present(values.vital_signs) }
      : {}),
    ...(present(values.assessment)
      ? {
          hypotheses: present(values.assessment),
          diagnoses: present(values.assessment),
        }
      : {}),
    ...(present(values.cid10) ? { diagnoses: present(values.cid10) } : {}),
    ...(present(values.exam_requests)
      ? { requestedTests: present(values.exam_requests) }
      : {}),
    ...(present(values.plan) ? { treatmentPlan: present(values.plan) } : {}),
    ...(present(values.prescription)
      ? { prescriptions: present(values.prescription) }
      : {}),
    ...(present(transcription) ? { transcription: present(transcription) } : {}),
    lastUpdatedAt: new Date().toISOString(),
  };
}

export function hasSufficientClinicalContext(context: ClinicalContext) {
  return Boolean(
    context.chiefComplaint ||
      (context.historyOfPresentIllness?.length ?? 0) >= 20 ||
      (context.transcription?.length ?? 0) >= 30,
  );
}

export function getDocumentationPendingItems(values: MedicalRecordFormValues) {
  const items: string[] = [];
  const clinicalText = `${values.chief_complaint || ""}\n${values.hpi || ""}`.toLocaleLowerCase("pt-BR");
  const physicalExam = (values.physical_exam || "").toLocaleLowerCase("pt-BR");
  const vitalSigns = (values.vital_signs || "").toLocaleLowerCase("pt-BR");
  if (present(values.chief_complaint) && !present(values.hpi))
    items.push("Verifique se é necessário registrar a história da doença atual.");
  if (!present(values.allergies))
    items.push("Verifique se é necessário registrar alergias.");
  if (present(values.assessment) && !present(values.plan))
    items.push("Verifique se é necessário registrar a conduta para a hipótese descrita.");
  if (!present(values.return_guidance))
    items.push("Verifique se é necessário registrar orientação de retorno.");
  if (/dor abdominal|abd[oô]men/.test(clinicalText) && !/abd[oô]men|abdominal/.test(physicalExam))
    items.push("Foi registrada queixa abdominal. Considere se é necessário documentar o exame abdominal.");
  if (/dispneia|falta de ar/.test(clinicalText) && !/spo2|satura/.test(vitalSigns))
    items.push("Foi registrada dispneia. Considere verificar e documentar a saturação, quando pertinente.");
  if (/dor torácica|precordial/.test(clinicalText) && !/ausculta|bulhas|card[ií]ac/.test(physicalExam))
    items.push("Foi registrada dor torácica. Considere se é necessário documentar a avaliação cardiovascular.");
  if (/cefaleia/.test(clinicalText) && !/neurol|pupila|glasgow|força|rigidez/.test(physicalExam))
    items.push("Foi registrada cefaleia. Considere se é necessário documentar o exame neurológico.");
  return items;
}
