"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, ArrowLeft, CalendarClock, Copy, FileClock, Flag, Loader2, Save, Stethoscope } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { toast } from "sonner";

import { finalizeClinicalEncounter, saveMedicalRecord } from "@/app/(dashboard)/consultas/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { medicalRecordDefaultValues, medicalRecordSchema, type MedicalRecordFormValues } from "@/lib/medical-records/schema";
import type { MedicalRecord, MedicalRecordAppointment, MedicalRecordHistoryItem } from "@/lib/medical-records/types";
import { appointmentTypeLabels } from "@/lib/appointments/types";
import { RecordDocuments } from "@/components/clinical-documents/record-documents";

type FieldName = keyof MedicalRecordFormValues;

const sections: Array<{ name: FieldName; label: string; placeholder?: string; rows?: number }> = [
  { name: "chief_complaint", label: "Motivo da consulta", placeholder: "Queixa principal e motivo do atendimento." },
  { name: "hpi", label: "HDA", placeholder: "História da doença atual." },
  { name: "pmh", label: "Antecedentes pessoais", placeholder: "História patológica pregressa." },
  { name: "family_history", label: "Antecedentes familiares" },
  { name: "social_history", label: "Hábitos de vida", placeholder: "Tabagismo, etilismo, atividade física, alimentação e sono." },
  { name: "vital_signs", label: "Sinais vitais", placeholder: "PA:\nFC:\nFR:\nSat:\nPeso:\nAltura:\nIMC:" },
  { name: "physical_exam", label: "Exame físico", placeholder: "Achados do exame físico.", rows: 10 },
  { name: "assessment", label: "Diagnósticos / avaliação" },
  { name: "cid10", label: "CID-10", placeholder: "Códigos e descrições dos diagnósticos." },
  { name: "plan", label: "Conduta" },
  { name: "prescription", label: "Prescrição", placeholder: "Registro textual. Prescrição eletrônica não está habilitada nesta fase." },
  { name: "exam_requests", label: "Solicitação de exames" },
  { name: "certificate", label: "Atestados", placeholder: "Registro textual. Emissão eletrônica não está habilitada nesta fase." },
  { name: "guidance", label: "Orientações" },
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

export function MedicalRecordForm({ appointment, record, history, patientDocuments, canEdit }: {
  appointment: MedicalRecordAppointment;
  record: MedicalRecord | null;
  history: MedicalRecordHistoryItem[];
  patientDocuments: Array<{ id: string; title: string; document_type: string; status: string; issued_at: string | null; created_at: string }>;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">(record?.status === "draft" ? "saved" : "idle");
  const [lastSavedAt, setLastSavedAt] = useState(record?.last_saved_at ?? null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [returnMode, setReturnMode] = useState<"none" | "days" | "date">("none");
  const [returnDays, setReturnDays] = useState("30");
  const [returnDate, setReturnDate] = useState("");
  const autosaveReady = useRef(false);
  const [importSource, setImportSource] = useState<MedicalRecordHistoryItem | null>(null);
  const [selectedFields, setSelectedFields] = useState<FieldName[]>([]);
  const form = useForm<MedicalRecordFormValues>({
    resolver: zodResolver(medicalRecordSchema),
    defaultValues: initialValues(record, appointment),
  });
  const patient = appointment.patient;
  const age = ageFromBirthDate(patient?.birth_date ?? null);

  async function persist(values: MedicalRecordFormValues, notify = false) {
    setSaving(true);
    setSaveState("saving"); setSaveError(null);
    const result = await saveMedicalRecord(appointment.id, values);
    setSaving(false);
    if (result.error) { setSaveState("error"); setSaveError(result.error); if (notify) toast.error(result.error); return false; }
    setSaveState("saved"); setLastSavedAt(new Date().toISOString());
    if (notify) toast.success(result.success);
    router.refresh();
    return true;
  }
  async function submit(values: MedicalRecordFormValues) { await persist(values, true); }

  useEffect(() => {
    if (!canEdit) return;
    // React Hook Form exposes a subscription API used here only for debounced draft persistence.
    // eslint-disable-next-line react-hooks/incompatible-library
    const subscription = form.watch(() => {
      if (!autosaveReady.current) { autosaveReady.current = true; return; }
      setSaveState("idle");
      window.clearTimeout((window as Window & { __asterDraftTimer?: number }).__asterDraftTimer);
      (window as Window & { __asterDraftTimer?: number }).__asterDraftTimer = window.setTimeout(() => void form.handleSubmit((values) => persist(values))(), 1500);
    });
    return () => { subscription.unsubscribe(); window.clearTimeout((window as Window & { __asterDraftTimer?: number }).__asterDraftTimer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, appointment.id]);

  async function finalize() {
    const valid = await form.trigger(["chief_complaint", "assessment", "plan"]);
    const values = form.getValues();
    if (!valid || !values.chief_complaint?.trim() || !values.assessment?.trim() || !values.plan?.trim()) return toast.error("Preencha motivo da consulta, avaliação e conduta.");
    setFinalizing(true);
    const saved = await persist(values);
    if (!saved) { setFinalizing(false); return; }
    const result = await finalizeClinicalEncounter(appointment.id);
    setFinalizing(false);
    if (result.error) return toast.error(result.error);
    toast.success(result.success); setFinalizeOpen(false); router.refresh();
    let date = returnDate;
    if (returnMode === "days") { const next = new Date(); next.setDate(next.getDate() + Math.max(1, Number(returnDays) || 30)); date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(next); }
    if (returnMode !== "none" && date) router.push(`/appointments/new?patient=${appointment.patient_id}&professional=${appointment.professional_id}&type=return&date=${date}`);
  }

  const importOptions: Array<{ name: FieldName; label: string }> = [
    { name: "pmh", label: "Antecedentes" }, { name: "allergies", label: "Alergias" },
    { name: "medications", label: "Medicamentos" }, { name: "family_history", label: "História familiar" },
    { name: "social_history", label: "História social" }, { name: "assessment", label: "Diagnósticos" },
    { name: "plan", label: "Plano anterior" },
  ];
  function importPrevious() {
    if (!importSource) return;
    selectedFields.forEach((field) => form.setValue(field, importSource[field] ?? "", { shouldDirty: true, shouldValidate: true }));
    toast.success(`${selectedFields.length} campo(s) importado(s). Revise antes de salvar.`);
    setSelectedFields([]); setImportSource(null);
  }

  return <form onSubmit={form.handleSubmit(submit)} className="space-y-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <Button variant="ghost" size="sm" render={<Link href={`/consultas/${appointment.id}`} />} className="-ml-2 mb-2">
          <ArrowLeft /> Consulta
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">Prontuário eletrônico</h1>
          <Badge variant={record?.status === "finalized" || record?.status === "amended" ? "default" : record ? "secondary" : "outline"}>{record?.status === "finalized" ? "Finalizado" : record?.status === "amended" ? "Com adendo" : record ? "Rascunho" : "Novo"}</Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">Atendimento de {new Intl.DateTimeFormat("pt-BR").format(new Date(`${appointment.appointment_date}T12:00:00`))} às {appointment.start_time.slice(0, 5)}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2"><div className="text-right text-xs text-muted-foreground">{saveState === "saving" && "Salvando rascunho..."}{saveState === "saved" && <span className="text-emerald-600">Rascunho salvo</span>}{saveState === "error" && <span className="text-destructive">Erro de salvamento</span>}{lastSavedAt && <span className="block">Última gravação: {new Date(lastSavedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>}</div><Button type="submit" disabled={saving || !canEdit} variant="outline">{saving ? <Loader2 className="animate-spin" /> : <Save />} Salvar rascunho</Button>{canEdit && <Dialog open={finalizeOpen} onOpenChange={setFinalizeOpen}><DialogTrigger asChild><Button type="button"><Flag /> Finalizar consulta</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Finalizar consulta?</DialogTitle><DialogDescription>Esta ação torna o prontuário somente leitura. Confirme os dados clínicos antes de continuar.</DialogDescription></DialogHeader><div className="space-y-3"><label className="flex gap-2 text-sm"><input type="radio" checked={returnMode === "none"} onChange={() => setReturnMode("none")} /> Sem retorno</label><label className="flex items-center gap-2 text-sm"><input type="radio" checked={returnMode === "days"} onChange={() => setReturnMode("days")} /> Retorno em <input className="w-20 rounded border px-2 py-1" type="number" min="1" value={returnDays} onChange={(event) => setReturnDays(event.target.value)} /> dias</label><label className="flex items-center gap-2 text-sm"><input type="radio" checked={returnMode === "date"} onChange={() => setReturnMode("date")} /> Data específica <input className="rounded border px-2 py-1" type="date" value={returnDate} onChange={(event) => setReturnDate(event.target.value)} /></label></div><DialogFooter><DialogClose asChild><Button type="button" variant="outline">Revisar prontuário</Button></DialogClose><Button type="button" disabled={finalizing || (returnMode === "date" && !returnDate)} onClick={finalize}>{finalizing && <Loader2 className="animate-spin" />} Confirmar finalização</Button></DialogFooter></DialogContent></Dialog>}</div>
    </div>

    {!canEdit && <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-800 dark:text-amber-200">{record?.status === "finalized" || record?.status === "amended" ? "Prontuário finalizado — conteúdo disponível somente para leitura." : "O prontuário só pode ser editado pelo profissional responsável durante o atendimento."}</div>}
    {saveError && <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><AlertCircle className="size-4" />{saveError}</div>}

    <Card className="gap-4 shadow-none">
      <CardHeader><CardTitle className="flex items-center gap-2"><Stethoscope className="size-5 text-primary" /> {patient?.full_name ?? "Paciente"}</CardTitle></CardHeader>
      <CardContent className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div><p className="text-xs text-muted-foreground">Nome social</p><p className="mt-1 font-medium">{patient?.social_name || "Não informado"}</p></div>
        <div><p className="text-xs text-muted-foreground">Idade</p><p className="mt-1 font-medium">{age === null ? "Não informada" : `${age} anos`}</p></div>
        <div><p className="text-xs text-muted-foreground">CPF</p><p className="mt-1 font-medium">{maskedCpf(patient?.cpf ?? null)}</p></div>
        <div><p className="text-xs text-muted-foreground">Sexo/gênero</p><p className="mt-1 font-medium">{patient?.gender || "Não informado"}</p></div>
        <div><p className="text-xs text-muted-foreground">Telefone</p><p className="mt-1 font-medium">{patient?.phone || "Não informado"}</p></div>
        <div><p className="text-xs text-muted-foreground">Convênio</p><p className="mt-1 font-medium">{patient?.insurance || "Não informado"}</p></div>
        <div><p className="text-xs text-muted-foreground">Profissional</p><p className="mt-1 font-medium">{appointment.professional?.full_name || "Não informado"}</p></div>
        <div><p className="text-xs text-muted-foreground">Tipo</p><p className="mt-1 font-medium">{appointmentTypeLabels[appointment.appointment_type]} · {history.length ? "Paciente em acompanhamento" : "Primeira consulta registrada"}</p></div>
      </CardContent>
    </Card>

    {(patient?.allergies || patient?.continuous_medications) && <div className="grid gap-3 sm:grid-cols-2">{patient.allergies && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4"><p className="text-xs font-semibold uppercase text-destructive">Alergias</p><p className="mt-1 whitespace-pre-wrap text-sm">{patient.allergies}</p></div>}{patient.continuous_medications && <div className="rounded-xl border bg-muted/30 p-4"><p className="text-xs font-semibold uppercase text-muted-foreground">Medicamentos em uso</p><p className="mt-1 whitespace-pre-wrap text-sm">{patient.continuous_medications}</p></div>}</div>}

    <RecordDocuments appointmentId={appointment.id} canCreate={appointment.status === "in_progress" && appointment.professional_id === record?.professional_id} />

    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
    <aside className="xl:sticky xl:top-6"><Card className="shadow-none">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><CardTitle className="flex items-center gap-2"><FileClock className="size-5 text-primary" /> Histórico longitudinal</CardTitle><p className="mt-1 text-sm text-muted-foreground">Consultas anteriores deste paciente, em modo somente leitura.</p></div>{history[0] && canEdit && <Dialog open={Boolean(importSource)} onOpenChange={(open) => { if (!open) { setImportSource(null); setSelectedFields([]); } }}><DialogTrigger asChild><Button type="button" variant="outline" onClick={() => setImportSource(history[0])}><Copy /> Importar dados anteriores</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Importar dados anteriores</DialogTitle><DialogDescription>Escolha a consulta de origem e apenas os campos que deseja copiar. A evolução completa não será importada.</DialogDescription></DialogHeader><label className="text-sm font-medium">Consulta de origem<select className="mt-2 w-full rounded-lg border bg-background px-3 py-2" value={importSource?.id ?? ""} onChange={(event) => setImportSource(history.find((item) => item.id === event.target.value) ?? null)}>{history.map((item) => <option key={item.id} value={item.id}>{new Date(`${item.appointment_date}T12:00:00`).toLocaleDateString("pt-BR")} · {item.title}</option>)}</select></label><div className="grid gap-2 sm:grid-cols-2">{importOptions.map((option) => <label key={option.name} className="flex items-center gap-2 rounded-lg border p-3 text-sm"><input type="checkbox" checked={selectedFields.includes(option.name)} disabled={!importSource?.[option.name]} onChange={(event) => setSelectedFields((current) => event.target.checked ? [...current, option.name] : current.filter((field) => field !== option.name))} />{option.label}</label>)}</div><DialogFooter><DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose><Button type="button" disabled={!selectedFields.length} onClick={importPrevious}>Importar selecionados</Button></DialogFooter></DialogContent></Dialog>}</CardHeader>
      <CardContent>{history.length ? <div className="space-y-3"><div className="rounded-xl border bg-muted/20 p-4"><p className="text-sm"><span className="text-muted-foreground">Última consulta:</span> <strong>{new Date(`${history[0].appointment_date}T12:00:00`).toLocaleDateString("pt-BR")}</strong> com {history[0].professional_name}</p><p className="mt-2 text-sm"><strong>Diagnóstico/CID:</strong> {history[0].assessment || "Não informado"}{history[0].cid10 ? ` · ${history[0].cid10}` : ""}</p><p className="mt-1 text-sm"><strong>Conduta:</strong> {history[0].plan || "Não informada"}</p></div><div className="space-y-3 border-l-2 pl-4">{history.map((item) => <Dialog key={item.id}><DialogTrigger asChild><button type="button" className="w-full rounded-xl border p-4 text-left transition-colors hover:bg-muted/40"><span className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{item.title}</span><Badge variant="outline"><CalendarClock className="size-3" /> {new Date(`${item.appointment_date}T12:00:00`).toLocaleDateString("pt-BR")}</Badge></span><span className="mt-2 block text-sm text-muted-foreground">{item.chief_complaint || "Sem queixa principal registrada"} · {item.professional_name}</span></button></DialogTrigger><DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>{item.title}</DialogTitle><DialogDescription>{new Date(`${item.appointment_date}T12:00:00`).toLocaleDateString("pt-BR")} às {item.start_time.slice(0, 5)} · {item.professional_name} · somente leitura</DialogDescription></DialogHeader><div className="grid gap-4 sm:grid-cols-2">{[
              ["Queixa principal", item.chief_complaint], ["HDA", item.hpi], ["Avaliação", item.assessment], ["CID", item.cid10], ["Conduta", item.plan], ["Prescrições", item.prescription], ["Solicitações de exames", item.exam_requests], ["Alergias", item.allergies], ["Medicamentos em uso", item.medications],
            ].map(([label, value]) => <div key={label} className="rounded-lg border p-3"><p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p><p className="mt-2 whitespace-pre-wrap text-sm">{value || "Não informado"}</p></div>)}</div></DialogContent></Dialog>)}</div></div> : <div className="py-8 text-center"><FileClock className="mx-auto size-7 text-muted-foreground" /><p className="mt-2 text-sm text-muted-foreground">Nenhuma consulta anterior com prontuário.</p></div>}</CardContent>
    </Card>{patientDocuments.length > 0 && <Card className="mt-4 shadow-none"><CardHeader><CardTitle className="text-base">Documentos emitidos</CardTitle></CardHeader><CardContent className="space-y-2">{patientDocuments.map((document) => <Link key={document.id} href={`/documentos/${document.id}`} className="flex items-center justify-between rounded-lg border p-3 text-sm hover:bg-muted/30"><span>{document.title}</span><Badge variant={document.status === "cancelled" ? "destructive" : "outline"}>{document.issued_at ? new Date(document.issued_at).toLocaleDateString("pt-BR") : "Emitido"}</Badge></Link>)}</CardContent></Card>}</aside>

    <div className="space-y-6">
    <div className="grid gap-6 lg:grid-cols-2">
      <TextAreaField form={form} name="allergies" label="Alergias" disabled={!canEdit} />
      <TextAreaField form={form} name="medications" label="Medicamentos em uso" disabled={!canEdit} />
    </div>

    {sections.map((section) => <TextAreaField key={section.name} form={form} disabled={!canEdit} {...section} />)}
    </div>
    </div>
  </form>;
}
