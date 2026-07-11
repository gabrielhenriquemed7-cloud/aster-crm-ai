import { AlertCircle, CalendarDays, Plus } from "lucide-react";
import Link from "next/link";

import { getAppointmentFormData, listAppointments } from "@/app/(dashboard)/appointments/actions";
import { AppointmentCalendar } from "@/components/appointments/calendar";
import { AppointmentFilters } from "@/components/appointments/appointment-filters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { appointmentStatusLabels, appointmentTypeLabels } from "@/lib/appointments/types";

function localDate() { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date()); }
export default async function AppointmentsPage({ searchParams }: { searchParams: Promise<{ date?: string; q?: string; professional?: string; status?: string; view?: "day" | "week" | "month" }> }) {
  const params = await searchParams; const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? "") ? params.date! : localDate(); const anchor = new Date(`${date}T12:00:00`);
  const from = `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, "0")}-01`; const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0); const to = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
  const [result, formData] = await Promise.all([listAppointments({ from, to, search: params.q, professionalId: params.professional, status: params.status }), getAppointmentFormData()]);
  const appointments = result.appointments;
  return <section><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm text-muted-foreground">Agenda da clínica ativa</p><h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">Agenda médica</h1></div><Button render={<Link href={`/appointments/new?date=${date}`} />}><Plus /> Nova consulta</Button></div>
    <div className="mt-6"><AppointmentFilters professionals={formData.professionals} /></div>
    {(result.error || formData.error) && <div className="mt-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"><AlertCircle className="size-4" />{result.error || formData.error}</div>}
    <div className="mt-4 grid gap-6 2xl:grid-cols-[1fr_360px]"><div className="overflow-x-auto"><AppointmentCalendar appointments={appointments} date={date} initialView={params.view ?? "month"} /></div><Card className="h-fit shadow-none"><CardHeader><CardTitle className="flex items-center gap-2"><CalendarDays className="size-4 text-primary" /> Consultas do período</CardTitle></CardHeader><CardContent className="max-h-[720px] space-y-3 overflow-y-auto">{appointments.map((item) => <Link key={item.id} href={`/appointments/${item.id}`} className="block rounded-lg border p-3 transition-colors hover:bg-muted/40"><div className="flex items-start justify-between gap-2"><div><p className="text-sm font-medium">{item.patient?.full_name || "Paciente"}</p><p className="mt-1 text-xs text-muted-foreground">{new Intl.DateTimeFormat("pt-BR").format(new Date(`${item.appointment_date}T12:00:00`))} · {item.start_time.slice(0, 5)}–{item.end_time.slice(0, 5)}</p></div><Badge variant={item.status === "cancelled" || item.status === "no_show" ? "destructive" : item.status === "confirmed" ? "secondary" : "outline"}>{appointmentStatusLabels[item.status]}</Badge></div><p className="mt-2 text-xs text-muted-foreground">{appointmentTypeLabels[item.appointment_type]} · {item.professional?.full_name}</p></Link>)}{!appointments.length && !result.error && <div className="py-12 text-center"><CalendarDays className="mx-auto size-8 text-muted-foreground" /><p className="mt-3 font-medium">Agenda vazia</p><p className="mt-1 text-sm text-muted-foreground">Não há consultas neste período e filtros.</p></div>}</CardContent></Card></div>
  </section>;
}
