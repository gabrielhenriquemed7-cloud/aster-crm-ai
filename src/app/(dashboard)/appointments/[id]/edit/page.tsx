import { notFound } from "next/navigation";
import { getAppointment, getAppointmentFormData } from "@/app/(dashboard)/appointments/actions";
import { AppointmentForm } from "@/components/appointments/appointment-form";
export default async function EditAppointmentPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; const [appointment, data] = await Promise.all([getAppointment(id), getAppointmentFormData()]); if (!appointment) notFound(); return <AppointmentForm appointment={appointment} {...data} />; }
