"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Loader2, Save, Stethoscope } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { toast } from "sonner";

import { saveMedicalRecord } from "@/app/(dashboard)/consultas/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { medicalRecordDefaultValues, medicalRecordSchema, type MedicalRecordFormValues } from "@/lib/medical-records/schema";
import type { MedicalRecord, MedicalRecordAppointment } from "@/lib/medical-records/types";

type FieldName = keyof MedicalRecordFormValues;

const sections: Array<{ name: FieldName; label: string; placeholder?: string; rows?: number }> = [
  { name: "chief_complaint", label: "Motivo da consulta", placeholder: "Queixa principal e motivo do atendimento." },
  { name: "hpi", label: "HDA", placeholder: "História da doença atual." },
  { name: "pmh", label: "HPP", placeholder: "História patológica pregressa." },
  { name: "family_history", label: "História familiar" },
  { name: "social_history", label: "Hábitos de vida", placeholder: "Tabagismo, etilismo, atividade física, alimentação e sono." },
  { name: "physical_exam", label: "Exame físico", placeholder: "PA:\nFC:\nFR:\nSat:\nPeso:\nAltura:\nIMC:\n\nAchados do exame físico.", rows: 10 },
  { name: "assessment", label: "Diagnósticos / avaliação" },
  { name: "cid10", label: "CID-10", placeholder: "Códigos e descrições dos diagnósticos." },
  { name: "plan", label: "Conduta" },
  { name: "prescription", label: "Prescrição", placeholder: "Registro textual. Prescrição eletrônica não está habilitada nesta fase." },
  { name: "exam_requests", label: "Solicitação de exames" },
  { name: "certificate", label: "Atestados", placeholder: "Registro textual. Emissão eletrônica não está habilitada nesta fase." },
  { name: "return_guidance", label: "Retorno", placeholder: "Data sugerida e observações para retorno." },
];

function ageFromBirthDate(birthDate: string | null) {
  if (!birthDate) return null;
  const birth = new Date(`${birthDate}T12:00:00`);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age -= 1;
  return age;
}

function maskedCpf(cpf: string | null) {
  if (!cpf) return "Não informado";
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) return cpf;
  return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
}

function initialValues(record: MedicalRecord | null, appointment: MedicalRecordAppointment): MedicalRecordFormValues {
  if (!record) {
    return {
      ...medicalRecordDefaultValues,
      allergies: appointment.patient?.allergies ?? "",
      medications: appointment.patient?.continuous_medications ?? "",
      pmh: appointment.patient?.medical_history ?? "",
    };
  }
  return Object.fromEntries(
    Object.keys(medicalRecordDefaultValues).map((key) => [key, record[key as FieldName] ?? ""]),
  ) as MedicalRecordFormValues;
}

function TextAreaField({ form, name, label, placeholder, rows = 5, disabled }: {
  form: UseFormReturn<MedicalRecordFormValues>;
  name: FieldName;
  label: string;
  placeholder?: string;
  rows?: number;
  disabled: boolean;
}) {
  const error = form.formState.errors[name]?.message;
  return <section className="rounded-xl border bg-card p-5">
    <label className="text-sm font-semibold uppercase tracking-wide" htmlFor={name}>{label}</label>
    <textarea
      id={name}
      rows={rows}
      disabled={disabled}
      placeholder={placeholder}
      className="mt-3 w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm leading-6 outline-none transition-shadow placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-70"
      {...form.register(name)}
    />
    {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
  </section>;
}

export function MedicalRecordForm({ appointment, record, canEdit }: {
  appointment: MedicalRecordAppointment;
  record: MedicalRecord | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const form = useForm<MedicalRecordFormValues>({
    resolver: zodResolver(medicalRecordSchema),
    defaultValues: initialValues(record, appointment),
  });
  const patient = appointment.patient;
  const age = ageFromBirthDate(patient?.birth_date ?? null);

  async function submit(values: MedicalRecordFormValues) {
    setSaving(true);
    const result = await saveMedicalRecord(appointment.id, values);
    setSaving(false);
    if (result.error) return toast.error(result.error);
    toast.success(result.success);
    router.refresh();
  }

  return <form onSubmit={form.handleSubmit(submit)} className="space-y-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <Button variant="ghost" size="sm" render={<Link href={`/consultas/${appointment.id}`} />} className="-ml-2 mb-2">
          <ArrowLeft /> Consulta
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">Prontuário eletrônico</h1>
          <Badge variant={record ? "secondary" : "outline"}>{record ? "Em acompanhamento" : "Novo"}</Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">Atendimento de {new Intl.DateTimeFormat("pt-BR").format(new Date(`${appointment.appointment_date}T12:00:00`))} às {appointment.start_time.slice(0, 5)}</p>
      </div>
      <Button type="submit" disabled={saving || !canEdit}>
        {saving ? <Loader2 className="animate-spin" /> : <Save />} Salvar prontuário
      </Button>
    </div>

    {!canEdit && <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-800 dark:text-amber-200">Somente o profissional atribuído à consulta pode editar este prontuário.</div>}

    <Card className="gap-4 shadow-none">
      <CardHeader><CardTitle className="flex items-center gap-2"><Stethoscope className="size-5 text-primary" /> {patient?.full_name ?? "Paciente"}</CardTitle></CardHeader>
      <CardContent className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-5">
        <div><p className="text-xs text-muted-foreground">Idade</p><p className="mt-1 font-medium">{age === null ? "Não informada" : `${age} anos`}</p></div>
        <div><p className="text-xs text-muted-foreground">CPF</p><p className="mt-1 font-medium">{maskedCpf(patient?.cpf ?? null)}</p></div>
        <div><p className="text-xs text-muted-foreground">Telefone</p><p className="mt-1 font-medium">{patient?.phone || "Não informado"}</p></div>
        <div><p className="text-xs text-muted-foreground">Convênio</p><p className="mt-1 font-medium">{patient?.insurance || "Não informado"}</p></div>
        <div><p className="text-xs text-muted-foreground">Profissional</p><p className="mt-1 font-medium">{appointment.professional?.full_name || "Não informado"}</p></div>
      </CardContent>
    </Card>

    <div className="grid gap-6 lg:grid-cols-2">
      <TextAreaField form={form} name="allergies" label="Alergias" disabled={!canEdit} />
      <TextAreaField form={form} name="medications" label="Medicamentos em uso" disabled={!canEdit} />
    </div>

    {sections.map((section) => <TextAreaField key={section.name} form={form} disabled={!canEdit} {...section} />)}
  </form>;
}
