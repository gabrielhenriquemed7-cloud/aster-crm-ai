import { getAppointmentFormData } from "@/app/(dashboard)/appointments/actions";
import { AppointmentForm } from "@/components/appointments/appointment-form";
export default async function NewAppointmentPage() { const data = await getAppointmentFormData(); return <AppointmentForm {...data} />; }
