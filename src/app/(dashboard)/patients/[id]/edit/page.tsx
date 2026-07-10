import { notFound } from "next/navigation";
import { getPatient } from "@/app/(dashboard)/patients/actions";
import { PatientForm } from "@/components/patients/patient-form";

export default async function EditPatientPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; const patient = await getPatient(id); if (!patient) notFound(); return <PatientForm patient={patient} />; }
