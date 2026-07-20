import type { ConsultationStep } from "@/components/medical-records/consultation-stepper";

export type WorkspaceMode =
  "standard" | "focus" | "fullscreen" | "comparison" | "second_window";

export interface WorkspaceSectionDefinition {
  id: ConsultationStep;
  label: string;
  shortLabel: string;
  selector: string;
  description: string;
  contextualTools: string[];
  futureModules?: string[];
}

export interface WorkspaceClinicalState {
  anamnesis: string;
  scores: string;
  physicalExam: string;
  diagnoses: string;
  conduct: string;
  prescription: string;
  documents: number;
}

export interface WorkspaceIdentity {
  appointmentId: string;
  patientId: string;
  patientName: string;
  appointmentStatus: string;
}

export interface WorkspaceContextValue {
  identity: WorkspaceIdentity;
  activeSection: ConsultationStep;
  scrollPosition: number;
  consultationState: string;
  clinicalState: WorkspaceClinicalState;
  timelineOpen: boolean;
  mode: WorkspaceMode;
  setActiveSection: (section: ConsultationStep) => void;
  setTimelineOpen: (open: boolean) => void;
  updateClinicalState: (state: Partial<WorkspaceClinicalState>) => void;
  setMode: (mode: WorkspaceMode) => void;
}
