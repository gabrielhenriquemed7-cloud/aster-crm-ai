import type {
  MedicalRecord,
  MedicalRecordAppointment,
} from "@/lib/medical-records/types";

export type MedicalRecordDocumentKind =
  | "complete_record"
  | "appointment_summary"
  | "evolution"
  | "anamnesis"
  | "physical_exam"
  | "prescription"
  | "exam_request"
  | "referral"
  | "certificate"
  | "medical_report";

export interface ClinicalScoreRecord {
  id: string;
  score: string;
  result: number;
  calculated_at: string;
  score_version: string;
}

export interface MedicalRecordProfessional {
  name: string;
  council: string | null;
  councilNumber: string | null;
  councilState: string | null;
  specialty: string | null;
}

export interface MedicalRecordClinic {
  name: string;
  legalName: string | null;
  logoUrl: string | null;
  phone: string | null;
  email: string | null;
}

export interface MedicalRecordAttachment {
  id: string;
  kind: "exam" | "pdf" | "image" | "report" | "document";
  title: string;
  status: "available" | "pending";
}

export interface MedicalRecordAudit {
  createdAt: string | null;
  updatedAt: string | null;
  responsibleUser: string | null;
  amendments: Array<{ id: string; date: string; summary: string }>;
}

export interface MedicalRecordSignature {
  status: "unsigned" | "pending" | "signed";
  hash: string | null;
  certificate: string | null;
  qrCode: string | null;
  timestamp: string | null;
}

export interface MedicalRecordAccessPolicy {
  canView: boolean;
  canPrint: boolean;
  canExport: boolean;
  trackViews: boolean;
  trackDownloads: boolean;
}

export interface MedicalRecordCenterData {
  appointment: MedicalRecordAppointment;
  record: MedicalRecord | null;
  professional: MedicalRecordProfessional;
  clinic: MedicalRecordClinic;
  scores: ClinicalScoreRecord[];
  attachments: MedicalRecordAttachment[];
  audit: MedicalRecordAudit;
  signature: MedicalRecordSignature;
  access: MedicalRecordAccessPolicy;
}

export interface MedicalRecordTimelineItem {
  id: string;
  date: string;
  time: string;
  professional: string;
  specialty: string | null;
  type: string;
  status: string;
}
