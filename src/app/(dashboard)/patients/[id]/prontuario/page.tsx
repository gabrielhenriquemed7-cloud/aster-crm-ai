import { ArrowLeft, FileText } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  getPatient,
  listPatientRecordAppointments,
} from "@/app/(dashboard)/patients/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  appointmentStatusLabels,
  type AppointmentStatus,
} from "@/lib/appointments/types";

export default async function PatientMedicalRecordsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [patient, appointments] = await Promise.all([
    getPatient(id),
    listPatientRecordAppointments(id),
  ]);
  if (!patient) notFound();
  return (
    <section className="space-y-5">
      <header>
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2"
          render={<Link href={`/patients/${id}`} />}
        >
          <ArrowLeft /> Perfil
        </Button>
        <h1 className="mt-2 text-2xl font-semibold">Prontuário</h1>
        <p className="text-sm text-muted-foreground">
          Atendimentos clínicos de {patient.social_name || patient.full_name}.
        </p>
      </header>
      <div className="space-y-3">
        {appointments.map((appointment) => (
          <Link
            key={appointment.id}
            href={`/consultas/${appointment.id}/prontuario/visualizar`}
            className="flex flex-col gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/30 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-start gap-3">
              <FileText className="mt-0.5 size-5 text-primary" />
              <div>
                <p className="font-medium">{appointment.title}</p>
                <p className="text-sm text-muted-foreground">
                  {new Date(
                    `${appointment.appointment_date}T12:00:00`,
                  ).toLocaleDateString("pt-BR")}{" "}
                  · {appointment.start_time.slice(0, 5)} ·{" "}
                  {appointment.professional[0]?.full_name ||
                    "Profissional não informado"}
                </p>
              </div>
            </div>
            <Badge variant="outline">
              {appointmentStatusLabels[appointment.status as AppointmentStatus]}
            </Badge>
          </Link>
        ))}
        {!appointments.length && (
          <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            Nenhum atendimento clínico disponível.
          </div>
        )}
      </div>
    </section>
  );
}
