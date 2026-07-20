export type DiagnosticClassificationSystem = "CID-10" | "CID-11" | "CIAP-2";

export type DiagnosisStatus =
  | "hypothesis"
  | "probable"
  | "confirmed"
  | "discarded"
  | "preexisting"
  | "follow_up";

export type DiagnosisPriority = "primary" | "secondary";

export type DiagnosisOrigin =
  "professional" | "ai_suggested" | "ai_accepted" | "ai_rejected";

export interface DiagnosticSearchResult {
  code: string;
  description: string;
  classificationSystem: DiagnosticClassificationSystem;
  category?: string;
  synonyms?: string[];
}

export interface DiagnosisObservation {
  text: string;
  updatedAt: string;
}

export interface ClinicalDiagnosis extends DiagnosticSearchResult {
  id: string;
  priority: DiagnosisPriority;
  status: DiagnosisStatus;
  observation: DiagnosisObservation | null;
  origin: DiagnosisOrigin;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

export interface DiagnosisSearchFilters {
  systems: DiagnosticClassificationSystem[];
  limit?: number;
}

export interface DiagnosticClassificationProvider {
  readonly system: DiagnosticClassificationSystem;
  search(
    query: string,
    filters: DiagnosisSearchFilters,
  ): Promise<DiagnosticSearchResult[]>;
}

export interface DiagnosisSearchService {
  search(
    query: string,
    filters: DiagnosisSearchFilters,
  ): Promise<DiagnosticSearchResult[]>;
}

export interface ClinicalDiagnosisService {
  save(appointmentId: string, diagnoses: ClinicalDiagnosis[]): Promise<void>;
}

export interface ClinicalDiagnosisSuggestionContext {
  chiefComplaint: string;
  hpi: string;
  personalHistory: string;
  medications: string;
  allergies: string;
  reviewOfSystems: string;
  scores: string;
  physicalExam: string;
  age: number | null;
  sex: string | null;
  specialty: string | null;
}

export interface ClinicalDiagnosisSuggestion {
  diagnosis: DiagnosticSearchResult;
  confidence: "low" | "moderate" | "high";
  rationale: string;
  differentials: DiagnosticSearchResult[];
  alerts: string[];
  origin: "ai_suggested";
}

export interface ClinicalDiagnosisSuggestionService {
  suggest(
    context: ClinicalDiagnosisSuggestionContext,
  ): Promise<ClinicalDiagnosisSuggestion[]>;
}

export interface DiagnosisDownstreamContext {
  primary: ClinicalDiagnosis | null;
  secondary: ClinicalDiagnosis[];
  age: number | null;
  weight: number | null;
  allergies: string;
  renalFunction: string;
  pregnancy: string;
  comorbidities: string;
}
