import type { Patient } from "@/lib/patients/types";
import type { PatientTimelineEvent } from "@/lib/medical-records/patient-timeline";

export type MeasurementType = "weight" | "bmi" | "blood_pressure" | "heart_rate" | "glucose" | "temperature" | "oxygen_saturation";

export interface ClinicalMeasurement {
  id: string;
  patientId: string;
  type: MeasurementType;
  value: number;
  secondaryValue: number | null;
  unit: string;
  measuredAt: string;
  sourceType: "medical_record" | "exam";
  sourceId: string;
  appointmentId: string | null;
  professionalId: string | null;
  professionalName: string | null;
  notes: string | null;
}

export interface LongitudinalVisit {
  id: string;
  appointmentId: string;
  date: string;
  time: string;
  title: string;
  status: string;
  professionalName: string | null;
  assessment: string | null;
  cid10: string | null;
  prescription: string | null;
  examRequests: string | null;
}

export interface LongitudinalDocument {
  id: string;
  appointmentId: string;
  type: string;
  title: string;
  status: string;
  date: string;
  content: Record<string, unknown>;
  items: Array<{ medication_name: string; dosage: string | null; frequency: string | null; duration: string | null }>;
}

export interface LongitudinalClinicalContext {
  latestMeasurements: ClinicalMeasurement[];
  measurementTrends: Array<{ type: MeasurementType; points: number }>;
  chronicConditions: string[];
  recurringDiagnoses: Array<{ label: string; count: number }>;
  activeMedications: string[];
  recentPrescriptions: string[];
  latestLabResults: ClinicalMeasurement[];
  relevantEvents: PatientTimelineEvent[];
  recentVisits: LongitudinalVisit[];
  dataGaps: string[];
}

export interface LongitudinalDashboardData {
  patient: Patient;
  visits: LongitudinalVisit[];
  measurements: ClinicalMeasurement[];
  documents: LongitudinalDocument[];
  timeline: PatientTimelineEvent[];
  context: LongitudinalClinicalContext;
  lastVisit: LongitudinalVisit | null;
  latestAppointmentId: string | null;
  responsibleProfessional: string | null;
  unavailableSources: string[];
}
