"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Loader2, MapPin, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm, type UseFormReturn } from "react-hook-form";
import { toast } from "sonner";

import { createPatient, updatePatient } from "@/app/(dashboard)/patients/actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { maskCpf, maskPhone, maskZipCode } from "@/lib/patients/format";
import { patientDefaultValues, patientSchema, type PatientFormValues } from "@/lib/patients/schema";
import type { Patient } from "@/lib/patients/types";

type FieldSpec = { name: keyof PatientFormValues; label: string; type?: string; placeholder?: string; span?: string; mask?: (value: string) => string };

const identificationFields: FieldSpec[] = [
  { name: "full_name", label: "Nome completo *", placeholder: "Nome civil completo", span: "md:col-span-2" },
  { name: "social_name", label: "Nome social", placeholder: "Como prefere ser chamado" },
  { name: "cpf", label: "CPF", placeholder: "000.000.000-00", mask: maskCpf },
  { name: "rg", label: "RG / documento de identidade" },
  { name: "cns", label: "Cartão Nacional de Saúde", placeholder: "15 dígitos" },
  { name: "birth_date", label: "Data de nascimento", type: "date" },
  { name: "gender", label: "Sexo / gênero" },
  { name: "race_ethnicity", label: "Raça / cor" },
  { name: "marital_status", label: "Estado civil" },
  { name: "nationality", label: "Nacionalidade" },
  { name: "birthplace", label: "Naturalidade" },
  { name: "occupation", label: "Profissão / ocupação" },
  { name: "mother_name", label: "Nome da mãe", span: "md:col-span-2" },
  { name: "father_name", label: "Nome do pai", span: "md:col-span-2" },
];

const contactFields: FieldSpec[] = [
  { name: "phone", label: "Telefone", placeholder: "(00) 00000-0000", mask: maskPhone },
  { name: "whatsapp", label: "WhatsApp", placeholder: "(00) 00000-0000", mask: maskPhone },
  { name: "email", label: "E-mail", type: "email", placeholder: "paciente@email.com", span: "md:col-span-2" },
];

const addressFields: FieldSpec[] = [
  { name: "zip_code", label: "CEP", placeholder: "00000-000", mask: maskZipCode },
  { name: "address", label: "Logradouro", span: "md:col-span-2" },
  { name: "address_number", label: "Número" },
  { name: "address_complement", label: "Complemento" },
  { name: "neighborhood", label: "Bairro" },
  { name: "city", label: "Cidade", span: "md:col-span-2" },
  { name: "state", label: "UF", placeholder: "BA" },
];

const insuranceFields: FieldSpec[] = [
  { name: "insurance", label: "Convênio / plano" },
  { name: "insurance_card", label: "Número da carteirinha" },
];

const emergencyFields: FieldSpec[] = [
  { name: "emergency_contact_name", label: "Nome do contato" },
  { name: "emergency_contact_relationship", label: "Parentesco / relação" },
  { name: "emergency_contact_phone", label: "Telefone", placeholder: "(00) 00000-0000", mask: maskPhone },
];

function asFormValues(patient?: Patient): PatientFormValues {
  if (!patient) return patientDefaultValues;
  const values = Object.fromEntries(Object.entries(patientDefaultValues).map(([key, fallback]) => [key, patient[key as keyof Patient] ?? fallback])) as PatientFormValues;
  values.cpf = maskCpf(values.cpf);
  values.zip_code = maskZipCode(values.zip_code);
  values.phone = maskPhone(values.phone);
  values.whatsapp = maskPhone(values.whatsapp);
  values.emergency_contact_phone = maskPhone(values.emergency_contact_phone);
  return values;
}

function FormField({ spec, form, onBlur }: { spec: FieldSpec; form: UseFormReturn<PatientFormValues>; onBlur?: () => void }) {
  const error = form.formState.errors[spec.name]?.message;
  return <div className={spec.span ?? ""}>
    <label className="mb-1.5 block text-sm font-medium" htmlFor={spec.name}>{spec.label}</label>
    <Controller name={spec.name} control={form.control} render={({ field }) => <Input {...field} value={field.value ?? ""} id={spec.name} type={spec.type ?? "text"} placeholder={spec.placeholder} onChange={(event) => field.onChange(spec.mask ? spec.mask(event.target.value) : event.target.value)} onBlur={() => { field.onBlur(); onBlur?.(); }} aria-invalid={Boolean(error)} />} />
    <p className="mt-1 min-h-4 text-xs text-destructive">{error}</p>
  </div>;
}

function Fields({ specs, form }: { specs: FieldSpec[]; form: UseFormReturn<PatientFormValues> }) {
  return <>{specs.map((spec) => <FormField key={spec.name} spec={spec} form={form} />)}</>;
}

export function PatientForm({ patient }: { patient?: Patient }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingZip, setIsLoadingZip] = useState(false);
  const [photo, setPhoto] = useState<File>();
  const form = useForm<PatientFormValues>({ resolver: zodResolver(patientSchema), defaultValues: asFormValues(patient) });

  async function findAddress() {
    const zipCode = form.getValues("zip_code").replace(/\D/g, "");
    if (zipCode.length !== 8) return;
    setIsLoadingZip(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${zipCode}/json/`);
      if (!response.ok) throw new Error();
      const data = await response.json() as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
      if (data.erro) return toast.error("CEP não encontrado.");
      form.setValue("address", data.logradouro ?? "", { shouldValidate: true });
      form.setValue("neighborhood", data.bairro ?? "", { shouldValidate: true });
      form.setValue("city", data.localidade ?? "", { shouldValidate: true });
      form.setValue("state", data.uf ?? "", { shouldValidate: true });
      toast.success("Endereço preenchido pelo CEP.");
    } catch {
      toast.error("Não foi possível consultar o CEP. Preencha o endereço manualmente.");
    } finally {
      setIsLoadingZip(false);
    }
  }

  async function onSubmit(values: PatientFormValues) {
    setIsSubmitting(true);
    const result = patient ? await updatePatient(patient.id, values, photo) : await createPatient(values, photo);
    setIsSubmitting(false);
    if (result.error) return toast.error(result.error);
    toast.success(result.success);
    router.push(`/patients/${result.id}`);
    router.refresh();
  }

  return <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><Button variant="ghost" size="sm" render={<Link href={patient ? `/patients/${patient.id}` : "/patients"} />} className="mb-2 -ml-2"><ArrowLeft /> Voltar</Button><h1 className="text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">{patient ? "Editar paciente" : "Novo paciente"}</h1><p className="mt-1 text-sm text-muted-foreground">Cadastro profissional de identificação e informações clínicas.</p></div>
      <Button type="submit" disabled={isSubmitting}>{isSubmitting && <Loader2 className="animate-spin" />} {patient ? "Salvar alterações" : "Cadastrar paciente"}</Button>
    </div>

    <section className="rounded-xl border bg-card p-5"><h2 className="font-semibold">Identificação</h2><div className="mt-4 flex flex-wrap items-center gap-4 rounded-lg border border-dashed p-4"><Avatar size="lg" className="size-14"><AvatarImage src={patient?.photo_url ?? undefined} alt="Foto do paciente" /><AvatarFallback>{patient?.full_name.slice(0, 2).toUpperCase() || "PT"}</AvatarFallback></Avatar><label className="cursor-pointer text-sm font-medium text-primary"><span className="inline-flex items-center gap-2"><Upload className="size-4" /> {photo ? photo.name : "Enviar foto"}</span><input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => setPhoto(event.target.files?.[0])} /></label><p className="text-xs text-muted-foreground">JPG, PNG ou WebP de até 5 MB.</p></div><div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3"><Fields specs={identificationFields} form={form} /></div></section>

    <section className="rounded-xl border bg-card p-5"><h2 className="font-semibold">Contato</h2><div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3"><Fields specs={contactFields} form={form} /></div></section>

    <section className="rounded-xl border bg-card p-5"><div className="flex items-center justify-between"><div><h2 className="font-semibold">Endereço</h2><p className="text-xs text-muted-foreground">O endereço é preenchido automaticamente após informar o CEP.</p></div><Button type="button" variant="outline" size="sm" disabled={isLoadingZip} onClick={findAddress}>{isLoadingZip ? <Loader2 className="animate-spin" /> : <MapPin />} Buscar CEP</Button></div><div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">{addressFields.map((spec) => <FormField key={spec.name} spec={spec} form={form} onBlur={spec.name === "zip_code" ? findAddress : undefined} />)}</div></section>

    <section className="rounded-xl border bg-card p-5"><h2 className="font-semibold">Convênio e emergência</h2><div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3"><Fields specs={[...insuranceFields, ...emergencyFields]} form={form} /></div></section>

    <section className="rounded-xl border bg-card p-5"><h2 className="font-semibold">Dados clínicos</h2><div className="mt-4 grid gap-4 md:grid-cols-2"><FormField spec={{ name: "blood_type", label: "Tipo sanguíneo", placeholder: "Ex.: O+" }} form={form} />{([['allergies','Alergias'],['comorbidities','Comorbidades'],['continuous_medications','Medicamentos de uso contínuo'],['medical_history','Histórico médico / cirúrgico'],['notes','Observações gerais']] as const).map(([name, label]) => <div key={name} className={name === "notes" ? "md:col-span-2" : ""}><label className="mb-1.5 block text-sm font-medium" htmlFor={name}>{label}</label><textarea id={name} className="min-h-28 w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50" {...form.register(name)} /><p className="mt-1 min-h-4 text-xs text-destructive">{form.formState.errors[name]?.message}</p></div>)}</div></section>

    <div className="flex justify-end"><Button type="submit" size="lg" disabled={isSubmitting}>{isSubmitting && <Loader2 className="animate-spin" />} {patient ? "Salvar alterações" : "Cadastrar paciente"}</Button></div>
  </form>;
}
