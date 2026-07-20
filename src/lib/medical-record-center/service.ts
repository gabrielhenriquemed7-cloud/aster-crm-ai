import { getMedicalRecordPageData } from "@/app/(dashboard)/consultas/actions";
import type { MedicalRecordCenterData } from "@/lib/medical-record-center/types";

export async function getMedicalRecordCenterData(appointmentId: string) {
  const data = await getMedicalRecordPageData(appointmentId);
  if (!data || data.error || !data.appointment)
    return { error: data?.error || "Prontuário não encontrado.", data: null };

  const centerData: MedicalRecordCenterData = {
    appointment: data.appointment,
    record: data.record,
    professional: {
      name:
        data.professionalProfile?.professional_name ||
        data.appointment.professional?.full_name ||
        "Profissional",
      council: data.professionalProfile?.council ?? null,
      councilNumber: data.professionalProfile?.council_number ?? null,
      councilState: data.professionalProfile?.council_state ?? null,
      specialty: data.professionalProfile?.specialty ?? null,
    },
    clinic: {
      name: data.clinicIdentity?.name || "ASTER CRM AI",
      legalName: data.clinicIdentity?.legal_name ?? null,
      logoUrl: data.clinicIdentity?.logo_url ?? null,
      phone: data.clinicIdentity?.phone ?? null,
      email: data.clinicIdentity?.email ?? null,
    },
    scores: data.scoreResults,
    attachments: [],
    audit: {
      createdAt: data.record?.created_at ?? null,
      updatedAt: data.record?.updated_at ?? null,
      responsibleUser: data.appointment.professional?.full_name ?? null,
      amendments: [],
    },
    signature: {
      status: "unsigned",
      hash: null,
      certificate: null,
      qrCode: null,
      timestamp: null,
    },
    access: {
      canView: true,
      canPrint: true,
      canExport: true,
      trackViews: false,
      trackDownloads: false,
    },
  };
  return { error: null, data: centerData, canEdit: data.canEdit };
}
