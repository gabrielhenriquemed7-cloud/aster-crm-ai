"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { createAppointment, updateAppointment } from "@/app/(dashboard)/appointments/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { appointmentSchema, type AppointmentFormValues } from "@/lib/appointments/schema";
import { appointmentStatusLabels, appointmentTypeLabels, type Appointment, type Professional } from "@/lib/appointments/types";

function today() { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date()); }
function addMinutes(time: string, minutes: number) { const [hours, mins] = time.split(":").map(Number); const total = hours * 60 + mins + minutes; return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`; }

export function AppointmentForm({ appointment, patients, professionals, currentUserId, initialDate }: { appointment?: Appointment; patients: { id: string; full_name: string }[]; professionals: Professional[]; currentUserId: string; initialDate?: string }) {
  const router = useRouter(); const [saving, setSaving] = useState(false);
  const form = useForm<AppointmentFormValues>({ resolver: zodResolver(appointmentSchema), defaultValues: {
    patient_id: appointment?.patient_id ?? "", professional_id: appointment?.professional_id ?? (professionals.some((item) => item.id === currentUserId) ? currentUserId : ""),
    title: appointment?.title ?? "Consulta", appointment_date: appointment?.appointment_date ?? initialDate ?? today(), start_time: appointment?.start_time?.slice(0, 5) ?? "08:00",
    end_time: appointment?.end_time?.slice(0, 5) ?? "08:30", appointment_type: appointment?.appointment_type ?? "consultation", status: appointment?.status ?? "scheduled",
    notes: appointment?.notes ?? "", cancellation_reason: appointment?.cancellation_reason ?? "",
  } });
  const status = useWatch({ control: form.control, name: "status" });
  const startTime = useWatch({ control: form.control, name: "start_time" });
  function setDuration(minutes: number) { if (startTime) form.setValue("end_time", addMinutes(startTime, minutes), { shouldValidate: true }); }
  async function submit(values: AppointmentFormValues) { setSaving(true); const result = appointment ? await updateAppointment(appointment.id, values) : await createAppointment(values); setSaving(false); if (result.error) return toast.error(result.error); toast.success(result.success); router.push(`/appointments/${result.id}`); router.refresh(); }

  return <form onSubmit={form.handleSubmit(submit)} className="space-y-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><Button render={<Link href={appointment ? `/appointments/${appointment.id}` : "/appointments"} />} variant="ghost" size="sm" className="-ml-2 mb-2"><ArrowLeft /> Agenda</Button><h1 className="text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">{appointment ? "Editar ou reagendar" : "Nova consulta"}</h1><p className="mt-1 text-sm text-muted-foreground">Defina paciente, profissional, data e duração do atendimento.</p></div><Button type="submit" disabled={saving}>{saving && <Loader2 className="animate-spin" />}{appointment ? "Salvar alterações" : "Agendar consulta"}</Button></div>
    <section className="grid gap-5 rounded-xl border bg-card p-5 md:grid-cols-2">
      <div><label className="mb-1.5 block text-sm font-medium">Paciente *</label><select className="h-9 w-full rounded-md border bg-background px-3 text-sm" {...form.register("patient_id")}><option value="">Selecione</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.full_name}</option>)}</select><p className="mt-1 text-xs text-destructive">{form.formState.errors.patient_id?.message}</p></div>
      <div><label className="mb-1.5 block text-sm font-medium">Profissional *</label><select className="h-9 w-full rounded-md border bg-background px-3 text-sm" {...form.register("professional_id")}><option value="">Selecione</option>{professionals.map((professional) => <option key={professional.id} value={professional.id}>{professional.full_name || "Profissional"}</option>)}</select><p className="mt-1 text-xs text-destructive">{form.formState.errors.professional_id?.message}</p></div>
      <div className="md:col-span-2"><label className="mb-1.5 block text-sm font-medium">Título *</label><Input placeholder="Ex.: Consulta de rotina" {...form.register("title")} /><p className="mt-1 text-xs text-destructive">{form.formState.errors.title?.message}</p></div>
      <div><label className="mb-1.5 block text-sm font-medium">Data *</label><Input type="date" {...form.register("appointment_date")} /><p className="mt-1 text-xs text-destructive">{form.formState.errors.appointment_date?.message}</p></div>
      <div><label className="mb-1.5 block text-sm font-medium">Duração</label><div className="flex flex-wrap gap-2">{[15, 30, 45, 60].map((minutes) => <Button type="button" key={minutes} variant="outline" size="sm" onClick={() => setDuration(minutes)}>{minutes} min</Button>)}</div></div>
      <div><label className="mb-1.5 block text-sm font-medium">Início *</label><Input type="time" {...form.register("start_time")} /><p className="mt-1 text-xs text-destructive">{form.formState.errors.start_time?.message}</p></div>
      <div><label className="mb-1.5 block text-sm font-medium">Término *</label><Input type="time" {...form.register("end_time")} /><p className="mt-1 text-xs text-destructive">{form.formState.errors.end_time?.message}</p></div>
      <div><label className="mb-1.5 block text-sm font-medium">Tipo</label><select className="h-9 w-full rounded-md border bg-background px-3 text-sm" {...form.register("appointment_type")}>{Object.entries(appointmentTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <div><label className="mb-1.5 block text-sm font-medium">Status</label><select className="h-9 w-full rounded-md border bg-background px-3 text-sm" {...form.register("status")}>{Object.entries(appointmentStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      {status === "cancelled" && <div className="md:col-span-2"><label className="mb-1.5 block text-sm font-medium">Motivo do cancelamento *</label><textarea className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm" {...form.register("cancellation_reason")} /><p className="mt-1 text-xs text-destructive">{form.formState.errors.cancellation_reason?.message}</p></div>}
      <div className="md:col-span-2"><label className="mb-1.5 block text-sm font-medium">Observações</label><textarea className="min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm" {...form.register("notes")} /></div>
    </section>
  </form>;
}
