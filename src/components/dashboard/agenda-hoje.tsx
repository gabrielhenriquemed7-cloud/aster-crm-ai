import { CalendarDays } from "lucide-react";
import Link from "next/link";

import { listAppointments } from "@/app/(dashboard)/appointments/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { appointmentStatusLabels, appointmentTypeLabels } from "@/lib/appointments/types";

export async function AgendaHoje() {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date());
  const { appointments, error } = await listAppointments({ from: today, to: today });
  return <Card><CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><CardTitle className="flex items-center gap-2 text-xl"><CalendarDays className="size-5 text-primary" /> Agenda de hoje</CardTitle><p className="mt-1 text-sm text-muted-foreground">Consultas e prioridades do dia.</p></div><div className="flex items-center gap-2"><Badge variant="outline">{appointments.length} consultas</Badge><Button render={<Link href="/appointments/new" />} variant="secondary" size="sm">Novo agendamento</Button></div></CardHeader><CardContent className="grid gap-3">{appointments.map((appointment) => <Link href={`/appointments/${appointment.id}`} key={appointment.id} className="rounded-xl border p-4 hover:bg-muted/40"><div className="flex items-center justify-between gap-4"><div><p className="text-sm text-muted-foreground">{appointment.start_time.slice(0, 5)}</p><p className="font-semibold">{appointment.patient?.full_name || "Paciente"}</p></div><Badge variant={appointment.status === "cancelled" || appointment.status === "no_show" ? "destructive" : "secondary"}>{appointmentStatusLabels[appointment.status]}</Badge></div><p className="mt-2 text-sm text-muted-foreground">{appointmentTypeLabels[appointment.appointment_type]} · {appointment.professional?.full_name}</p></Link>)}{error && <p className="py-6 text-center text-sm text-destructive">{error}</p>}{!appointments.length && !error && <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma consulta para hoje.</p>}</CardContent></Card>;
}
