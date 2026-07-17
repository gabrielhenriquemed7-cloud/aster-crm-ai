import type {
  MedicalRecordAppointment,
  MedicalRecordHistoryItem,
} from "@/lib/medical-records/types";

export type PatientTimelineDocument = {
  id: string;
  title: string;
  document_type: string;
  status: string;
  issued_at: string | null;
  created_at: string;
};

export type PatientTimelineEvent = {
  id: string;
  kind:
    | "consultation"
    | "exam"
    | "prescription"
    | "referral"
    | "certificate"
    | "document";
  date: string;
  time: string | null;
  title: string;
  href: string | null;
  professional: string | null;
  status: string | null;
  details: Array<{ label: string; value: string }>;
  searchableText: string;
};

function present(label: string, value: string | null | undefined) {
  return value?.trim() ? [{ label, value: value.trim() }] : [];
}

function documentKind(type: string): PatientTimelineEvent["kind"] {
  if (type === "exam_request") return "exam";
  if (type === "prescription" || type === "special_prescription")
    return "prescription";
  if (type === "referral") return "referral";
  if (type === "medical_certificate" || type === "attendance_declaration")
    return "certificate";
  return "document";
}

export function buildPatientTimelineEvents(
  history: MedicalRecordHistoryItem[],
  documents: PatientTimelineDocument[],
): PatientTimelineEvent[] {
  const consultations = history.map<PatientTimelineEvent>((record) => {
    const details = [
      ...present("Queixa principal", record.chief_complaint),
      ...present("História da doença atual", record.hpi),
      ...present("Diagnóstico / hipóteses", record.assessment),
      ...present("CID", record.cid10),
      ...present("Conduta", record.plan),
      ...present("Exames solicitados", record.exam_requests),
      ...present("Prescrição", record.prescription),
      ...present("Atestado", record.certificate),
      ...present("Orientações", record.guidance),
    ];
    return {
      id: `consultation:${record.id}`,
      kind: "consultation",
      date: record.appointment_date,
      time: record.start_time,
      title: record.title || "Consulta clínica",
      href: `/consultas/${record.appointment_id}/prontuario`,
      professional: record.professional_name,
      status: record.status,
      details,
      searchableText: details
        .flatMap((item) => [item.label, item.value])
        .concat(record.title, record.professional_name)
        .join(" ")
        .toLocaleLowerCase("pt-BR"),
    };
  });

  const documentEvents = documents.map<PatientTimelineEvent>((document) => {
    const dateTime = document.issued_at || document.created_at;
    const details = [
      { label: "Documento", value: document.title },
      { label: "Status", value: document.status },
    ];
    return {
      id: `document:${document.id}`,
      kind: documentKind(document.document_type),
      date: dateTime.slice(0, 10),
      time: dateTime.includes("T") ? dateTime.slice(11, 16) : null,
      title: document.title,
      href: `/documentos/${document.id}`,
      professional: null,
      status: document.status,
      details,
      searchableText: `${document.title} ${document.document_type} ${document.status}`.toLocaleLowerCase(
        "pt-BR",
      ),
    };
  });

  return [...consultations, ...documentEvents].sort((left, right) =>
    `${right.date} ${right.time || ""}`.localeCompare(
      `${left.date} ${left.time || ""}`,
    ),
  );
}

export type PatientTimelineContext = {
  recentConsultations: Array<{
    date: string;
    chiefComplaint: string | null;
    assessment: string | null;
    cid10: string | null;
    medications: string | null;
    exams: string | null;
    conduct: string | null;
  }>;
  recurringDiagnoses: string[];
  allergies: string[];
  continuousMedications: string[];
  relevantEvents: PatientTimelineEvent[];
};

export function buildPatientTimelineContext(
  appointment: MedicalRecordAppointment,
  history: MedicalRecordHistoryItem[],
  events: PatientTimelineEvent[],
): PatientTimelineContext {
  const diagnosisCounts = new Map<string, number>();
  history.forEach((item) => {
    const diagnosis = item.assessment?.trim();
    if (diagnosis)
      diagnosisCounts.set(diagnosis, (diagnosisCounts.get(diagnosis) ?? 0) + 1);
  });
  return {
    recentConsultations: history.slice(0, 10).map((item) => ({
      date: item.appointment_date,
      chiefComplaint: item.chief_complaint,
      assessment: item.assessment,
      cid10: item.cid10,
      medications: item.prescription || item.medications,
      exams: item.exam_requests,
      conduct: item.plan,
    })),
    recurringDiagnoses: [...diagnosisCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([diagnosis]) => diagnosis),
    allergies: appointment.patient?.allergies
      ? [appointment.patient.allergies]
      : [],
    continuousMedications: appointment.patient?.continuous_medications
      ? [appointment.patient.continuous_medications]
      : [],
    relevantEvents: events.slice(0, 20),
  };
}
