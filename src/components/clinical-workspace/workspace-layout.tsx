import { MedicalRecordLayout } from "@/components/medical-records/medical-record-layout";

export function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <MedicalRecordLayout>{children}</MedicalRecordLayout>;
}
