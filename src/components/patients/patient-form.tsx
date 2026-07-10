"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Loader2, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { createPatient, updatePatient } from "@/app/(dashboard)/patients/actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { patientDefaultValues, patientSchema, type PatientFormValues } from "@/lib/patients/schema";
import type { Patient } from "@/lib/patients/types";

const fields: Array<{ name: keyof PatientFormValues; label: string; type?: string; placeholder?: string }> = [
  { name: "full_name", label: "Nome completo *", placeholder: "Nome do paciente" },
  { name: "cpf", label: "CPF", placeholder: "000.000.000-00" },
  { name: "cns", label: "CNS", placeholder: "15 dígitos" },
  { name: "birth_date", label: "Nascimento", type: "date" },
  { name: "gender", label: "Sexo", placeholder: "Ex.: Feminino" },
  { name: "marital_status", label: "Estado civil" },
  { name: "occupation", label: "Profissão" },
  { name: "zip_code", label: "CEP", placeholder: "00000-000" },
  { name: "address", label: "Endereço" },
  { name: "city", label: "Cidade" },
  { name: "state", label: "Estado", placeholder: "UF" },
  { name: "phone", label: "Telefone", placeholder: "(00) 0000-0000" },
  { name: "whatsapp", label: "WhatsApp", placeholder: "(00) 00000-0000" },
  { name: "email", label: "E-mail", type: "email", placeholder: "paciente@email.com" },
  { name: "insurance", label: "Convênio" },
  { name: "insurance_card", label: "Carteirinha" },
  { name: "emergency_contact", label: "Contato de emergência" },
];

function asFormValues(patient?: Patient): PatientFormValues {
  if (!patient) return patientDefaultValues;
  return Object.fromEntries(Object.entries(patientDefaultValues).map(([key, fallback]) => [key, patient[key as keyof Patient] ?? fallback])) as PatientFormValues;
}

export function PatientForm({ patient }: { patient?: Patient }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [photo, setPhoto] = useState<File>();
  const form = useForm<PatientFormValues>({ resolver: zodResolver(patientSchema), defaultValues: asFormValues(patient) });

  async function onSubmit(values: PatientFormValues) {
    setIsSubmitting(true);
    const result = patient ? await updatePatient(patient.id, values, photo) : await createPatient(values, photo);
    setIsSubmitting(false);
    if (result.error) return toast.error(result.error);
    toast.success(result.success);
    router.push(`/patients/${result.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Button variant="ghost" size="sm" render={<Link href={patient ? `/patients/${patient.id}` : "/patients"} />} className="mb-2 -ml-2"><ArrowLeft /> Voltar</Button>
          <h1 className="text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">{patient ? "Editar paciente" : "Novo paciente"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{patient ? "Atualize as informações do cadastro." : "Preencha os dados para iniciar o cadastro."}</p>
        </div>
        <Button type="submit" disabled={isSubmitting}>{isSubmitting && <Loader2 className="animate-spin" />} {patient ? "Salvar alterações" : "Cadastrar paciente"}</Button>
      </div>

      <section className="rounded-xl border bg-card p-5 shadow-none">
        <h2 className="font-semibold">Identificação</h2>
        <div className="mt-4 flex items-center gap-4 rounded-lg border border-dashed p-4">
          <Avatar size="lg" className="size-14"><AvatarImage src={patient?.photo_url ?? undefined} alt="Foto do paciente" /><AvatarFallback className="bg-muted text-sm font-semibold text-muted-foreground">{patient?.full_name.slice(0, 2).toUpperCase() || "PT"}</AvatarFallback></Avatar>
          <label className="cursor-pointer text-sm font-medium text-primary"><span className="inline-flex items-center gap-2"><Upload className="size-4" /> {photo ? photo.name : "Enviar foto"}</span><input type="file" accept="image/*" className="sr-only" onChange={(event) => setPhoto(event.target.files?.[0])} /></label>
          <p className="text-xs text-muted-foreground">JPG, PNG ou WebP de até 5 MB.</p>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {fields.map((field) => <div key={field.name} className={field.name === "full_name" ? "md:col-span-2 xl:col-span-3" : ""}><label className="mb-1.5 block text-sm font-medium" htmlFor={field.name}>{field.label}</label><Input id={field.name} type={field.type ?? "text"} placeholder={field.placeholder} {...form.register(field.name)} /><p className="mt-1 min-h-4 text-xs text-destructive">{form.formState.errors[field.name]?.message}</p></div>)}
        </div>
      </section>

      <section className="rounded-xl border bg-card p-5 shadow-none">
        <h2 className="font-semibold">Informações clínicas</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {(["allergies", "comorbidities", "notes"] as const).map((name) => <div key={name} className={name === "notes" ? "md:col-span-2" : ""}><label className="mb-1.5 block text-sm font-medium" htmlFor={name}>{name === "allergies" ? "Alergias" : name === "comorbidities" ? "Comorbidades" : "Observações"}</label><textarea id={name} className="min-h-24 w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" {...form.register(name)} /><p className="mt-1 min-h-4 text-xs text-destructive">{form.formState.errors[name]?.message}</p></div>)}
        </div>
      </section>
    </form>
  );
}
