import { CalendarDays } from "lucide-react";
import Link from "next/link";

import { listAppointments } from "@/app/(dashboard)/appointments/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function statusVariant(status: string) {
  return status === "confirmed" ? "secondary" : status === "cancelled" || status === "no_show" ? "destructive" : "default";
}

export async function AgendaHoje() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
  const appointments = await listAppointments({ from: start, to: end });
  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-xl font-semibold">
            <CalendarDays className="size-5 text-primary" aria-hidden="true" />
            Agenda de hoje
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Consultas agendadas e prioridades do dia.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{appointments.length} consultas</Badge>
          <Button render={<Link href="/appointments/new" />} variant="secondary" size="sm">
            Novo agendamento
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        {appointments.map((appointment) => (
          <div
            key={appointment.id}
            className="rounded-3xl border border-border bg-background/70 p-4 shadow-sm"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(appointment.starts_at))}</p>
                <p className="text-lg font-semibold text-foreground">{appointment.patient?.full_name || "Paciente"}</p>
              </div>
              <Badge variant={statusVariant(appointment.status)}>{appointment.status === "confirmed" ? "Confirmada" : appointment.status === "scheduled" ? "Agendada" : appointment.status}</Badge>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{appointment.appointment_type}</p>
          </div>
        ))}
        {!appointments.length && <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma consulta para hoje.</p>}
      </CardContent>
    </Card>
  );
}
