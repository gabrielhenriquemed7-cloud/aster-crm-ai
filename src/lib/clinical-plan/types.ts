import type { ClinicalDiagnosis } from "@/lib/diagnosis-engine/types";

export type ClinicalPlanStatus =
  "planned" | "active" | "completed" | "suspended";
export type OrderPriority = "routine" | "priority" | "urgent";
export type ExamOrderCategory =
  | "Exames laboratoriais"
  | "Exames de imagem"
  | "Exames cardiológicos"
  | "Exames neurológicos"
  | "Exames endoscópicos"
  | "Exames anatomopatológicos"
  | "Testes funcionais"
  | "Procedimentos diagnósticos"
  | "Outros";
export type ExamOrderItemType = "exam" | "diagnostic_procedure";
export type ExamOrderStatus =
  "draft" | "issued" | "printed" | "downloaded" | "cancelled" | "completed";
export type ReferralStatus =
  "planned" | "requested" | "scheduled" | "completed" | "cancelled";
export type FollowUpType =
  | "days"
  | "weeks"
  | "months"
  | "specific_date"
  | "after_results"
  | "as_needed"
  | "early_if_worse"
  | "continuous"
  | "episode_closed";

export interface ClinicalPlanItem {
  id: string;
  title: string;
  details: string;
  category:
    | "therapeutic_goal"
    | "proposed_treatment"
    | "pharmacological"
    | "non_pharmacological"
    | "lifestyle"
    | "therapeutic_target"
    | "monitoring"
    | "other";
  status: ClinicalPlanStatus;
}

export interface ExamOrder {
  id: string;
  name: string;
  category: ExamOrderCategory;
  type: ExamOrderItemType;
  clinicalIndication: string;
  priority: OrderPriority;
  guidance: string;
  observations: string;
  diagnosisRef: string;
  expectedDate: string;
  status: ExamOrderStatus;
}

export interface ProcedureOrder extends ExamOrder {
  type: "diagnostic_procedure";
}

export interface Referral {
  id: string;
  destinationType: string;
  destination: string;
  reason: string;
  clinicalSummary: string;
  priority: OrderPriority;
  diagnosisRef: string;
  observations: string;
  status: ReferralStatus;
}

export interface PatientGuidance {
  id: string;
  category: string;
  text: string;
  warningSign: boolean;
}

export interface FollowUpPlan {
  type: FollowUpType;
  interval: number | null;
  expectedDate: string;
  reason: string;
  observations: string;
  responsible: string;
}

export interface PerformedProcedure {
  id: string;
  name: string;
  category: string;
  description: string;
  performedAt: string;
  professional: string;
  materials: string;
  medication: string;
  complications: string;
  result: string;
  observations: string;
}

export interface ClinicalPlan {
  id: string;
  appointmentId: string;
  treatmentItems: ClinicalPlanItem[];
  examOrders: ExamOrder[];
  examOrderGeneralIndication: string;
  examOrderGeneralGuidance: string;
  examOrderDiagnosisRef: string;
  procedureOrders: ProcedureOrder[];
  referrals: Referral[];
  patientGuidance: PatientGuidance[];
  followUp: FollowUpPlan | null;
  performedProcedures: PerformedProcedure[];
  additionalNotes: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

export interface ExamCatalogItem {
  id: string;
  name: string;
  category: ExamOrderCategory;
  type: ExamOrderItemType;
  abbreviation?: string;
  synonyms: string[];
}

export interface ExamOrderGuidance {
  id: string;
  text: string;
}

export interface ExamOrderPackage {
  id: string;
  name: string;
  description: string;
  itemIds: string[];
}

export interface ExamOrderDiagnosisLink {
  diagnosisId: string;
  code: string;
  description: string;
  classificationSystem: string;
}

export interface ExamOrderDocument {
  id: string;
  appointmentId: string;
  patientId: string;
  items: ExamOrder[];
  generalClinicalIndication: string;
  diagnosisLinks: ExamOrderDiagnosisLink[];
  generalGuidance: ExamOrderGuidance[];
  status: ExamOrderStatus;
  issuedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

export interface ExamOrderPreview {
  title: string;
  body: string;
  itemCount: number;
}

export interface ClinicalPlanRecordFields {
  plan: string;
  exam_requests: string;
  guidance: string;
  return_guidance: string;
}

export interface ClinicalPlanService {
  save(appointmentId: string, fields: ClinicalPlanRecordFields): Promise<void>;
}

export interface ExamCatalogService {
  search(query: string): Promise<ExamCatalogItem[]>;
}

export interface ExamCatalogProvider {
  search(query: string): Promise<ExamCatalogItem[]>;
}

export interface ExamOrderService {
  saveToEncounter(
    appointmentId: string,
    document: ExamOrderDocument,
  ): Promise<void>;
}

export interface ExamOrderDocumentService {
  create(document: ExamOrderDocument): Promise<string>;
}

export interface ExamOrderPdfService {
  generate(document: ExamOrderDocument): Promise<Blob>;
}

export interface ExamOrderPackageService {
  list(): Promise<ExamOrderPackage[]>;
}

export interface ExamOrderSuggestionService {
  suggest(context: ClinicalPlanSuggestionContext): Promise<
    Array<{
      item: ExamCatalogItem;
      reason: string;
      diagnosisRef: string;
      priority: OrderPriority;
      rationale: string;
      source?: string;
      confidence: "low" | "moderate" | "high";
    }>
  >;
}

export interface ReferralService {
  validate(referral: Referral): Promise<string[]>;
}

export type ClinicalPlanDocumentKind =
  | "exam_request"
  | "procedure_request"
  | "referral"
  | "therapeutic_plan"
  | "patient_guidance"
  | "conduct_summary"
  | "follow_up_declaration";

export interface ClinicalPlanDocumentService {
  create(kind: ClinicalPlanDocumentKind, plan: ClinicalPlan): Promise<string>;
}

export type ClinicalPlanTimelineEventKind =
  | "exam_requested"
  | "procedure_requested"
  | "referral_created"
  | "follow_up_defined"
  | "procedure_performed"
  | "guidance_recorded"
  | "treatment_plan_changed";

export interface ClinicalPlanSuggestionContext {
  chiefComplaint: string;
  hpi: string;
  history: string;
  allergies: string;
  medications: string;
  scores: string;
  physicalExam: string;
  diagnoses: ClinicalDiagnosis[];
  age: number | null;
  sex: string | null;
  weight: number | null;
  specialty: string | null;
  renalFunction: string;
  hepaticFunction: string;
}

export interface ClinicalPlanSuggestion {
  id: string;
  type: string;
  text: string;
  rationale: string;
  source?: string;
  confidence: "low" | "moderate" | "high";
  reviewState: "suggested" | "accepted" | "rejected";
}

export interface ClinicalPlanSuggestionService {
  suggest(
    context: ClinicalPlanSuggestionContext,
  ): Promise<ClinicalPlanSuggestion[]>;
}
