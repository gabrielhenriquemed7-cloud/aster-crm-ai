"use client";

import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { AppointmentActions } from "@/components/appointments/appointment-actions";
import type { Appointment } from "@/lib/appointments/types";
import { cn } from "@/lib/utils";

type View = "month" | "week" | "day";
const statusClass: Record<string, string> = { scheduled: "bg-blue-500", confirmed: "bg-emerald-500", waiting: "bg-violet-500", in_progress: "bg-amber-500", completed: "bg-slate-500", cancelled: "bg-rose-500", no_show: "bg-orange-500" };
function dateKey(value: Date) { const year = value.getFullYear(); const month = String(value.getMonth() + 1).padStart(2, "0"); const day = String(value.getDate()).padStart(2, "0"); return `${year}-${month}-${day}`; }
function formatTime(value: string) { return value.slice(0, 5); }

export function AppointmentCalendar({ appointments, date, initialView = "month" }: { appointments: Appointment[]; date: string; initialView?: View }) {
  const [view, setView] = useState<View>(initialView); const active = useMemo(() => new Date(`${date}T12:00:00`), [date]);
  const byDay = useMemo(() => appointments.reduce<Record<string, Appointment[]>>((acc, item) => { (acc[item.appointment_date] ??= []).push(item); return acc; }, {}), [appointments]);
  const monthDays = useMemo(() => { const start = new Date(active.getFullYear(), active.getMonth(), 1); start.setDate(start.getDate() - start.getDay()); return Array.from({ length: 42 }, (_, index) => { const day = new Date(start); day.setDate(start.getDate() + index); return day; }); }, [active]);
  const shift = (amount: number) => { const next = new Date(active); if (view === "month") next.setMonth(next.getMonth() + amount); else next.setDate(next.getDate() + amount * (view === "week" ? 7 : 1)); return `/appointments?date=${dateKey(next)}&view=${view}`; };
  const visibleDays = view === "month" ? monthDays : Array.from({ length: view === "week" ? 7 : 1 }, (_, index) => { const day = new Date(active); if (view === "week") day.setDate(active.getDate() - active.getDay() + index); return day; });
  const heading = view === "day" ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(active) : new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(active);

  return <section className="overflow-hidden rounded-xl border bg-card"><div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><Button render={<Link href={shift(-1)} />} variant="outline" size="icon-sm" aria-label="Período anterior"><ChevronLeft /></Button><p className="min-w-44 text-center text-sm font-semibold capitalize">{heading}</p><Button render={<Link href={shift(1)} />} variant="outline" size="icon-sm" aria-label="Próximo período"><ChevronRight /></Button></div><div className="flex flex-wrap gap-1"><Button variant={view === "month" ? "secondary" : "ghost"} size="sm" onClick={() => setView("month")}>Mês</Button><Button variant={view === "week" ? "secondary" : "ghost"} size="sm" onClick={() => setView("week")}>Semana</Button><Button variant={view === "day" ? "secondary" : "ghost"} size="sm" onClick={() => setView("day")}>Dia</Button><Button render={<Link href={`/appointments/new?date=${date}`} />} size="sm"><Plus /> Consulta</Button></div></div>
    <div className={cn("grid min-w-[680px]", view === "day" ? "grid-cols-1 min-w-0" : "grid-cols-7")}>
      {view !== "day" && ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((name) => <p key={name} className="border-b p-2 text-center text-xs font-medium text-muted-foreground">{name}</p>)}
      {visibleDays.map((day) => { const key = dateKey(day); const entries = byDay[key] ?? []; return <div key={key} className={cn("min-h-32 border-b border-r p-2", day.getMonth() !== active.getMonth() && view === "month" && "bg-muted/30 text-muted-foreground", view !== "month" && "min-h-80")}><div className="mb-2 flex items-center justify-between"><Link href={`/appointments?date=${key}&view=day`} className="inline-flex size-7 items-center justify-center rounded-full text-xs font-medium hover:bg-muted">{day.getDate()}</Link><Link href={`/appointments/new?date=${key}`} className="text-xs text-primary hover:underline">Adicionar</Link></div><div className="space-y-1.5">{entries.map((item) => <div key={item.id} className="rounded-md border bg-background p-2"><Link href={`/appointments/${item.id}`} className="block text-xs hover:text-primary"><span className={cn("mr-1.5 inline-block size-1.5 rounded-full", statusClass[item.status])} /><span className="font-semibold">{formatTime(item.start_time)}</span> {item.patient?.full_name}<span className="mt-0.5 block truncate pl-3 text-muted-foreground">{item.professional?.full_name}</span></Link>{view === "day" && <div className="mt-3 border-t pt-2"><AppointmentActions id={item.id} status={item.status} patientId={item.patient_id} professionalId={item.professional_id} /></div>}</div>)}{!entries.length && view === "day" && <p className="py-16 text-center text-sm text-muted-foreground">Nenhuma consulta neste dia.</p>}</div></div>; })}
    </div>
  </section>;
}
