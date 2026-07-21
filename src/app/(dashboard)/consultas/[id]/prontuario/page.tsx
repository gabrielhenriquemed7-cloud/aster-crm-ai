import { AlertCircle } from "lucide-react";
import { notFound } from "next/navigation";

import { getMedicalRecordPageData } from "@/app/(dashboard)/consultas/actions";
import { MedicalRecordForm } from "@/components/medical-records/medical-record-form";
import { WorkspaceLayout } from "@/components/clinical-workspace/workspace-layout";
import { WorkspaceProvider } from "@/components/clinical-workspace/workspace-provider";
import { ConsultationRecoveryGate } from "@/components/medical-records/consultation-recovery-gate";

export default async function MedicalRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ session?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
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
  const sessionToken = /^[0-9a-f-]{36}$/i.test(query.session ?? "") ? query.session! : null;
  if (data.appointment.status === "in_progress" && data.canEdit && !sessionToken)
    return <ConsultationRecoveryGate appointmentId={id} patientId={data.appointment.patient_id} professionalId={data.appointment.professional_id} />;
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
          addenda={data.addenda}
          canEdit={data.canEdit}
          aiEnabled={data.aiEnabled}
          canManageAi={data.canManageAi}
          initialLongitudinalSummary={data.longitudinalSummary}
          clinicIdentity={data.clinicIdentity}
          professionalProfile={data.professionalProfile}
          sessionToken={sessionToken}
        />
      </WorkspaceLayout>
    </WorkspaceProvider>
  );
}
