import type {
  MedicalRecordAccessPolicy,
  MedicalRecordAudit,
  MedicalRecordCenterData,
  MedicalRecordSignature,
  MedicalRecordTimelineItem,
} from "@/lib/medical-record-center/types";

export interface MedicalRecordSignatureService {
  sign(data: MedicalRecordCenterData): Promise<MedicalRecordSignature>;
}

export interface MedicalRecordAuditService {
  history(recordId: string): Promise<MedicalRecordAudit>;
}

export interface MedicalRecordTimelineService {
  list(patientId: string): Promise<MedicalRecordTimelineItem[]>;
}

export interface MedicalRecordAccessService {
  policy(appointmentId: string): Promise<MedicalRecordAccessPolicy>;
  registerView(appointmentId: string): Promise<void>;
  registerDownload(appointmentId: string): Promise<void>;
}
