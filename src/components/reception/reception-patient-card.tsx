"use client";

import { Clock3 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ReceptionPatient } from "@/lib/reception/types";

const statusColors: Record<ReceptionPatient["status"], string> = {
  scheduled: "bg-sky-500", confirmed: "bg-emerald-500", waiting: "bg-amber-500",
  in_progress: "bg-violet-500", completed: "bg-slate-500", no_show: "bg-rose-500", cancelled: "bg-zinc-400",
};

function age(birthDate: string | null) {
  if (!birthDate) return "Idade não informada";
  const birth = new Date(`${birthDate}T12:00:00`); const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) years--;
  return `${years} anos`;
}

function timeToAppointment(startTime: string, status: ReceptionPatient["status"]) {
  if (["completed", "cancelled", "no_show"].includes(status)) return null;
  const [hours, minutes] = startTime.split(":").map(Number);
  const now = new Date(); const target = new Date(); target.setHours(hours, minutes, 0, 0);
  const diff = Math.round((target.getTime() - now.getTime()) / 60000);
  if (diff > 0) return `em ${diff} min`;
  if (diff === 0) return "agora";
  return `${Math.abs(diff)} min de atraso`;
}

export function ReceptionPatientCard({ item, selected, onSelect }: { item: ReceptionPatient; selected: boolean; onSelect: () => void }) {
  const timing = timeToAppointment(item.startTime, item.status);
  return <button type="button" onClick={onSelect} className={cn("w-full rounded-xl border bg-card p-3 text-left transition-colors hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50", selected && "border-primary bg-primary/5 ring-1 ring-primary/20")} aria-pressed={selected}>
    <div className="flex items-start gap-3"><span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", statusColors[item.status])} aria-hidden="true" /><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><p className="truncate text-sm font-semibold">{item.patient.fullName}</p><span className="shrink-0 text-sm font-semibold tabular-nums">{item.startTime.slice(0, 5)}</span></div><p className="mt-1 truncate text-xs text-muted-foreground">{item.professionalName} · {item.patient.insurance || "Particular"}</p><div className="mt-2 flex flex-wrap items-center gap-1.5"><Badge variant="outline" className="text-[10px]">{age(item.patient.birthDate)}</Badge>{timing && <Badge variant={timing.includes("atraso") ? "destructive" : "secondary"} className="text-[10px]"><Clock3 className="size-3" /> {timing}</Badge>}</div></div></div>
  </button>;
}
