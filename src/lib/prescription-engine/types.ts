export type PrescriptionType =
  "simple" | "continuous" | "antimicrobial" | "special_control" | "digital";

export type PosologyMode =
  | "single_use"
  | "continuous"
  | "as_needed"
  | "alternate_days"
  | "custom_schedule";

export interface PrescriptionMedication {
  id: string;
  name: string;
  activeIngredient: string;
  concentration: string;
  pharmaceuticalForm: string;
  route: string;
  dose: string;
  frequency: string;
  interval: string;
  schedule: string;
  duration: string;
  quantity: string;
  notes: string;
  posologyMode: PosologyMode;
  catalogPresentationId?: string;
  regulatorySource?: "ANVISA_CMED" | "ANVISA_CATALOG" | "manual";
  registrationNumber?: string;
  manufacturer?: string;
  presentation?: string;
  packageDescription?: string;
  registrationHolder?: string;
  ean?: string;
  sourceKey?: string;
  sourceUpdatedAt?: string;
  frequencyCode?: string;
  durationCode?: string;
  manualEntry?: boolean;
  routeOverride?: boolean;
}

export interface PrescriptionTemplate {
  id: string;
  name: string;
  scope: "personal" | "institutional";
  type: PrescriptionType;
  medications: PrescriptionMedication[];
  orientations: string;
  observations: string;
}

export interface PrescriptionParty {
  name: string;
  document?: string | null;
}

export interface PrescriptionDocument {
  id: string;
  status: "draft" | "reviewed" | "issued" | "cancelled";
  type: PrescriptionType;
  clinic: PrescriptionParty & {
    logoUrl?: string | null;
    phone?: string | null;
    email?: string | null;
  };
  patient: PrescriptionParty;
  prescriber: PrescriptionParty & {
    council?: string | null;
    councilState?: string | null;
  };
  issuedAt: string;
  medications: PrescriptionMedication[];
  orientations: string;
  observations: string;
  signaturePlaceholder: string;
}

export type PrescriptionDraft = Pick<
  PrescriptionDocument,
  "id" | "type" | "medications" | "orientations" | "observations"
>;

export type PrescriptionAlertKind =
  | "allergy"
  | "interaction"
  | "therapeutic_duplication"
  | "maximum_dose"
  | "contraindication"
  | "pregnancy"
  | "lactation"
  | "renal_function"
  | "hepatic_function";

export interface PrescriptionAlert {
  id: string;
  kind: PrescriptionAlertKind;
  severity: "information" | "attention" | "critical";
  title: string;
  description: string;
  source?: string;
}

export interface PrescriptionSuggestionContext {
  diagnosis: string;
  cid: string;
  weight: number | null;
  age: number | null;
  sex: string | null;
  allergies: string;
  renalFunction: string;
  pregnancy: string;
}

export interface PrescriptionSuggestionService {
  suggest(
    context: PrescriptionSuggestionContext,
  ): Promise<PrescriptionTemplate[]>;
}

export interface PrescriptionAlertService {
  evaluate(
    document: PrescriptionDocument,
    context: PrescriptionSuggestionContext,
  ): Promise<PrescriptionAlert[]>;
}

export interface PrescriptionDigitalProof {
  documentHash: string;
  qrCodePayload?: string;
  timestamp?: string;
  signatureProvider?: string;
}

export interface PrescriptionDocumentService {
  print(document: PrescriptionDocument): Promise<void>;
  generatePdf(document: PrescriptionDocument): Promise<Blob>;
  send(document: PrescriptionDocument, destination: string): Promise<void>;
  signWithIcpBrasil(
    document: PrescriptionDocument,
  ): Promise<PrescriptionDigitalProof>;
}

export type MedicationSearchSource =
  "active_ingredient" | "commercial_name" | "favorites" | "history";
