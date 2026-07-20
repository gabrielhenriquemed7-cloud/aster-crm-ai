import { AlertCircle } from "lucide-react";
import { notFound } from "next/navigation";

import { getMedicalRecordPageData } from "@/app/(dashboard)/consultas/actions";
import { MedicalRecordForm } from "@/components/medical-records/medical-record-form";
import { WorkspaceLayout } from "@/components/clinical-workspace/workspace-layout";
import { WorkspaceProvider } from "@/components/clinical-workspace/workspace-provider";

export default async function MedicalRecordPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getMedicalRecordPageData(id);
  if (!data) notFound();
  if (data.error || !data.appointment) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center">
        <AlertCircle className="mx-auto size-8 text-destructive" />
        <h1 className="mt-3 font-semibold">
          Não foi possível carregar o prontuário
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{data.error}</p>
      </div>
    );
  }
  return (
    <WorkspaceProvider
      identity={{
        appointmentId: data.appointment.id,
        patientId: data.appointment.patient_id,
        patientName:
          data.appointment.patient?.social_name ||
          data.appointment.patient?.full_name ||
          "Paciente",
        appointmentStatus: data.record?.status || data.appointment.status,
      }}
    >
      <WorkspaceLayout>
        <MedicalRecordForm
          appointment={data.appointment}
          record={data.record}
          history={data.history}
          patientDocuments={data.patientDocuments}
          canEdit={data.canEdit}
          aiEnabled={data.aiEnabled}
          canManageAi={data.canManageAi}
          initialLongitudinalSummary={data.longitudinalSummary}
          clinicIdentity={data.clinicIdentity}
          professionalProfile={data.professionalProfile}
        />
      </WorkspaceLayout>
    </WorkspaceProvider>
  );
}
