import { AlertCircle, CalendarCheck, CalendarDays, ClipboardList, Clock3, FileWarning, Plus, RotateCcw, Stethoscope, UserPlus, UsersRound } from "lucide-react";
import Link from "next/link";

import { getDashboardData } from "@/app/(dashboard)/dashboard/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { appointmentStatusLabels, appointmentTypeLabels, type AppointmentStatus } from "@/lib/appointments/types";

const statusOrder: AppointmentStatus[] = ["confirmed", "scheduled", "waiting", "in_progress", "completed", "cancelled", "no_show"];
const statusNames: Record<AppointmentStatus, string> = { ...appointmentStatusLabels, scheduled: "Sem confirmação" };

export default async function DashboardPage() {
  const data = await getDashboardData();
  const pending = [
    { label: "Prontuários não finalizados", value: data.pending.unfinishedRecords, icon: ClipboardList },
    { label: "Pacientes aguardando retorno", value: data.pending.awaitingReturn, icon: RotateCcw },
    { label: "Consultas sem confirmação", value: data.pending.unconfirmed, icon: Clock3 },
    { label: "Documentos pendentes", value: data.pending.documents, icon: FileWarning },
  ];
  const indicators = [
    { label: "Novos pacientes no mês", value: String(data.indicators.newPatients), icon: UserPlus },
    { label: "Consultas no mês", value: String(data.indicators.monthlyAppointments), icon: CalendarDays },
    { label: "Taxa de comparecimento", value: `${data.indicators.attendanceRate}%`, icon: CalendarCheck },
    { label: "Retornos agendados", value: String(data.indicators.scheduledReturns), icon: RotateCcw },
  ];
  return <section className="space-y-6">
    <div className="flex flex-col gap-5 rounded-[2rem] border bg-background/95 p-6 shadow-sm lg:flex-row lg:items-end lg:justify-between">
      <div><p className="text-sm text-muted-foreground">Visão operacional da clínica ativa</p><h1 className="mt-1 text-3xl font-semibold tracking-[-0.03em]">Dashboard clínico</h1><p className="mt-2 text-sm text-muted-foreground">Agenda, pendências e indicadores atualizados com os dados da clínica.</p></div>
      <div className="flex flex-wrap gap-2"><Button render={<Link href="/patients/new" />}><Plus /> Novo paciente</Button><Button render={<Link href="/appointments/new" />} variant="secondary"><CalendarDays /> Nova consulta</Button><Button render={<Link href="/appointments?view=day" />} variant="outline">Abrir agenda</Button>{data.upcoming[0] && <Button render={<Link href={data.upcoming[0].status === "in_progress" ? `/consultas/${data.upcoming[0].id}/prontuario` : `/appointments/${data.upcoming[0].id}`} />} variant="outline"><Stethoscope /> {data.upcoming[0].status === "in_progress" ? "Continuar atendimento" : "Abrir atendimento"}</Button>}</div>
    </div>
    {data.error && <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"><AlertCircle className="size-4" /> {data.error}</div>}
    <Card className="shadow-none"><CardHeader><CardTitle>Consultas de hoje</CardTitle></CardHeader><CardContent><div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8"><div className="rounded-xl border bg-primary/5 p-4"><p className="text-xs text-muted-foreground">Total</p><p className="mt-1 text-2xl font-semibold">{data.today.total}</p></div>{statusOrder.map((status) => <div key={status} className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">{statusNames[status]}</p><p className="mt-1 text-2xl font-semibold">{data.today[status]}</p></div>)}</div></CardContent></Card>
    <div className="grid gap-6 xl:grid-cols-[1.45fr_1fr]">
      <Card className="shadow-none"><CardHeader className="flex flex-row items-center justify-between"><CardTitle>Próximos atendimentos</CardTitle><Badge variant="outline">Hoje</Badge></CardHeader><CardContent className="space-y-3">{data.upcoming.map((item) => <div key={item.id} className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-4"><span className="font-semibold tabular-nums">{item.start_time.slice(0, 5)}</span><div><p className="font-medium">{item.patient?.full_name ?? "Paciente"}</p><p className="text-xs text-muted-foreground">{item.professional?.full_name} · {appointmentTypeLabels[item.appointment_type]}</p></div></div><div className="flex items-center gap-2"><Badge variant="secondary">{appointmentStatusLabels[item.status]}</Badge><Button size="sm" render={<Link href={item.status === "in_progress" ? `/consultas/${item.id}/prontuario` : `/appointments/${item.id}`} />}>{item.status === "in_progress" ? "Continuar" : "Abrir"}</Button></div></div>)}{!data.upcoming.length && !data.error && <div className="py-10 text-center"><UsersRound className="mx-auto size-7 text-muted-foreground"/><p className="mt-2 text-sm text-muted-foreground">Nenhum atendimento pendente hoje.</p></div>}</CardContent></Card>
      <Card className="shadow-none"><CardHeader><CardTitle>Pendências</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">{pending.map(({ label, value, icon: Icon }) => <div key={label} className="flex items-center justify-between rounded-xl border p-4"><span className="flex items-center gap-3 text-sm"><Icon className="size-4 text-muted-foreground" />{label}</span><Badge variant={value ? "destructive" : "secondary"}>{value}</Badge></div>)}</CardContent></Card>
    </div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{indicators.map(({ label, value, icon: Icon }) => <Card key={label} className="gap-3 py-5 shadow-none"><CardHeader className="flex flex-row items-center justify-between px-5"><CardTitle className="text-sm text-muted-foreground">{label}</CardTitle><Icon className="size-4 text-primary" /></CardHeader><CardContent className="px-5"><p className="text-3xl font-semibold tracking-tight">{value}</p></CardContent></Card>)}</div>
  </section>;
}
