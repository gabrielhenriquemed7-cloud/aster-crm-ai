import "server-only";

import type { MedicalRecordHistoryItem } from "@/lib/medical-records/types";
import { buildPatientTimelineEvents } from "@/lib/medical-records/patient-timeline";
import type { Patient } from "@/lib/patients/types";
import { createClient } from "@/lib/supabase/server";
import type { ClinicalMeasurement, LongitudinalDashboardData, LongitudinalDocument, LongitudinalVisit, MeasurementType } from "@/lib/longitudinal/types";

type RecordRow = MedicalRecordHistoryItem & { vital_signs: string | null };

function numberValue(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function extract(text: string, pattern: RegExp) {
  const match = text.match(pattern)?.[1];
  return match ? numberValue(match) : null;
}

function parseMeasurements(record: RecordRow): ClinicalMeasurement[] {
  const text = record.vital_signs || "";
  const measuredAt = `${record.appointment_date}T${record.start_time || "00:00"}`;
  const common = {
    patientId: record.patient_id,
    measuredAt,
    sourceType: "medical_record" as const,
    sourceId: record.id,
    appointmentId: record.appointment_id,
    professionalId: record.professional_id,
    professionalName: record.professional_name,
    notes: null,
  };
  const definitions: Array<[MeasurementType, RegExp, string]> = [
    ["weight", /(?:^|\n)Peso:\s*([\d.,]+)/i, "kg"],
    ["bmi", /(?:^|\n)IMC:\s*([\d.,]+)/i, "kg/m²"],
    ["heart_rate", /(?:^|\n)FC:\s*([\d.,]+)/i, "bpm"],
    ["temperature", /(?:^|\n)(?:Temperatura|Temp):\s*([\d.,]+)/i, "°C"],
    ["oxygen_saturation", /(?:^|\n)(?:SpO2|SpO₂|Sat):\s*([\d.,]+)/i, "%"],
    ["glucose", /(?:^|\n)(?:Glicemia|Glicose):\s*([\d.,]+)/i, "mg/dL"],
  ];
  const result: ClinicalMeasurement[] = definitions.flatMap(([type, pattern, unit]) => {
    const value = extract(text, pattern);
    return value === null ? [] : [{ ...common, id: `${record.id}:${type}`, type, value, secondaryValue: null, unit }];
  });
  const pressure = text.match(/(?:^|\n)PA:\s*(\d{2,3})\s*[x/]\s*(\d{2,3})/i);
  if (pressure) result.push({ ...common, id: `${record.id}:blood_pressure`, type: "blood_pressure", value: Number(pressure[1]), secondaryValue: Number(pressure[2]), unit: "mmHg" });
  return result;
}

function exactList(text: string | null) {
  return text?.split(/[;\n]/).map((item) => item.trim()).filter(Boolean) ?? [];
}

export async function getLongitudinalDashboardData(patientId: string): Promise<LongitudinalDashboardData | null> {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data: profile } = await supabase.from("profiles").select("active_clinic_id").eq("id", auth.user.id).maybeSingle();
  if (!profile?.active_clinic_id) return null;
  const clinicId = profile.active_clinic_id;
  const { data: patient } = await supabase.from("patients").select("*").eq("id", patientId).eq("clinic_id", clinicId).is("deleted_at", null).maybeSingle();
  if (!patient) return null;

  const [{ data: records }, { data: appointments }, { data: documents }] = await Promise.all([
    supabase.from("medical_records").select("*").eq("clinic_id", clinicId).eq("patient_id", patientId).is("deleted_at", null).order("created_at", { ascending: false }).limit(500),
    supabase.from("appointments").select("id,appointment_date,start_time,title,status,professional_id").eq("clinic_id", clinicId).eq("patient_id", patientId).order("appointment_date", { ascending: false }).order("start_time", { ascending: false }).limit(500),
    supabase.from("clinical_documents").select("id,appointment_id,document_type,title,status,issued_at,created_at,content,prescription_items(medication_name,dosage,frequency,duration)").eq("clinic_id", clinicId).eq("patient_id", patientId).is("deleted_at", null).order("created_at", { ascending: false }).limit(500),
  ]);
  const professionalIds = [...new Set((appointments ?? []).map((item) => item.professional_id))];
  const { data: professionals } = professionalIds.length ? await supabase.from("profiles").select("id,full_name").in("id", professionalIds) : { data: [] };
  const professionalMap = new Map((professionals ?? []).map((item) => [item.id, item.full_name]));
  const appointmentMap = new Map((appointments ?? []).map((item) => [item.id, item]));
  const history = (records ?? []).flatMap((record) => {
    const appointment = appointmentMap.get(record.appointment_id);
    if (!appointment) return [];
    return [{ ...record, appointment_date: appointment.appointment_date, start_time: appointment.start_time, title: appointment.title, professional_name: professionalMap.get(appointment.professional_id) || "Profissional" } as RecordRow];
  }).sort((a, b) => `${b.appointment_date} ${b.start_time}`.localeCompare(`${a.appointment_date} ${a.start_time}`));
  const visits: LongitudinalVisit[] = history.map((record) => ({ id: record.id, appointmentId: record.appointment_id, date: record.appointment_date, time: record.start_time, title: record.title, status: record.status, professionalName: record.professional_name, assessment: record.assessment, cid10: record.cid10, prescription: record.prescription, examRequests: record.exam_requests }));
  const normalizedDocuments: LongitudinalDocument[] = (documents ?? []).map((document) => ({ id: document.id, appointmentId: document.appointment_id, type: document.document_type, title: document.title, status: document.status, date: document.issued_at || document.created_at, content: (document.content || {}) as Record<string, unknown>, items: Array.isArray(document.prescription_items) ? document.prescription_items : [] }));
  const timeline = buildPatientTimelineEvents(history, normalizedDocuments.map((document) => ({ id: document.id, title: document.title, document_type: document.type, status: document.status, issued_at: document.date, created_at: document.date })));
  const measurements = history.flatMap(parseMeasurements).sort((a, b) => b.measuredAt.localeCompare(a.measuredAt));
  const diagnosisCounts = new Map<string, number>();
  visits.forEach((visit) => exactList(visit.cid10 || visit.assessment).forEach((label) => diagnosisCounts.set(label, (diagnosisCounts.get(label) ?? 0) + 1)));
  const latestMeasurements = [...new Map(measurements.map((measurement) => [measurement.type, measurement])).values()];
  const prescriptions = visits.flatMap((visit) => exactList(visit.prescription));
  const documentMedications = normalizedDocuments.flatMap((document) => document.items.map((item) => item.medication_name).filter(Boolean));
  const unavailableSources = ["Resultados laboratoriais estruturados", "Internações e cirurgias estruturadas", "Status longitudinal de suspensão de medicamentos"];
  return {
    patient: patient as Patient,
    visits,
    measurements,
    documents: normalizedDocuments,
    timeline,
    lastVisit: visits[0] ?? null,
    latestAppointmentId: appointments?.[0]?.id ?? null,
    responsibleProfessional: appointments?.[0] ? professionalMap.get(appointments[0].professional_id) || null : null,
    unavailableSources,
    context: {
      latestMeasurements,
      measurementTrends: [...new Set(measurements.map((item) => item.type))].map((type) => ({ type, points: measurements.filter((item) => item.type === type).length })),
      chronicConditions: exactList(patient.comorbidities),
      recurringDiagnoses: [...diagnosisCounts.entries()].filter(([, count]) => count > 1).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
      activeMedications: exactList(patient.continuous_medications),
      recentPrescriptions: [...documentMedications, ...prescriptions].slice(0, 20),
      latestLabResults: measurements.filter((item) => item.sourceType === "exam").slice(0, 20),
      relevantEvents: timeline.slice(0, 30),
      recentVisits: visits.slice(0, 20),
      dataGaps: unavailableSources,
    },
  };
}
