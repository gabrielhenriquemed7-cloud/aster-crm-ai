export type PhysicalExamStatus = "unassessed" | "normal" | "altered";

export type ExamSpecialty =
  | "medical_clinic"
  | "pediatrics"
  | "cardiology"
  | "pulmonology"
  | "neurology"
  | "orthopedics"
  | "gynecology"
  | "obstetrics"
  | "psychiatry"
  | "dermatology"
  | "otolaryngology"
  | "ophthalmology"
  | "surgery";

export type ExamSectionKind = "vital_signs" | "systems" | "observations";
export type ExamFieldKind = "vital_sign" | "system" | "textarea";

export interface ExamField {
  id: string;
  label: string;
  kind: ExamFieldKind;
  normalText?: string;
  unit?: string;
  placeholder?: string;
  inputMode?: "text" | "decimal";
  optional?: boolean;
}

export interface ExamSection {
  id: string;
  label: string;
  kind: ExamSectionKind;
  fields: ExamField[];
}

export interface ExamTemplate {
  id: string;
  specialty: ExamSpecialty;
  label: string;
  version: string;
  sections: ExamSection[];
}

export type PhysicalExamSystemId = string;

export interface PhysicalExamSystemDefinition {
  id: PhysicalExamSystemId;
  label: string;
  normalText: string;
}

export interface PhysicalExamSystemValue {
  status: PhysicalExamStatus;
  description: string;
}

export type PhysicalExamSystems = Record<
  PhysicalExamSystemId,
  PhysicalExamSystemValue
>;

export type VitalSignKey = string;
export type VitalSigns = Record<VitalSignKey, string>;

export interface ClinicalExamSuggestionContext {
  chiefComplaint: string;
  hpi: string;
  scores: string[];
  specialty: ExamSpecialty;
  age: number | null;
  gender: string | null;
  vitalSigns: VitalSigns;
}

export interface ClinicalExamSuggestion {
  sectionId: string;
  suggestion: string;
  rationale: string;
  sourceFields: string[];
}

export interface ClinicalExamSuggestionService {
  suggest(
    context: ClinicalExamSuggestionContext,
  ): Promise<ClinicalExamSuggestion[]>;
}

export interface ClinicalConsistencyContext {
  hpi: string;
  physicalExam: string;
  scores: string[];
  hypotheses: string;
  plan: string;
}

export interface ClinicalConsistencyIssue {
  id: string;
  severity: "information" | "warning";
  message: string;
  sourceFields: string[];
}

export interface ClinicalConsistencyService {
  analyze(
    context: ClinicalConsistencyContext,
  ): Promise<ClinicalConsistencyIssue[]>;
}
