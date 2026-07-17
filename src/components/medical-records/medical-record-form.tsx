"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertCircle,
  Activity,
  CalendarClock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileClock,
  FileText,
  Flag,
  Loader2,
  Save,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { toast } from "sonner";

import {
  finalizeClinicalEncounter,
  saveMedicalRecord,
} from "@/app/(dashboard)/consultas/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  medicalRecordDefaultValues,
  medicalRecordSchema,
  type MedicalRecordFormValues,
} from "@/lib/medical-records/schema";
import type {
  MedicalRecord,
  MedicalRecordAppointment,
  MedicalRecordHistoryItem,
} from "@/lib/medical-records/types";
import { appointmentTypeLabels } from "@/lib/appointments/types";
import { RecordDocuments } from "@/components/clinical-documents/record-documents";
import { ClinicalAIPanel } from "@/components/medical-records/clinical-ai-panel";
import { AdaptivePhysicalExam } from "@/components/medical-records/adaptive-physical-exam";
import { LongitudinalClinicalSummary } from "@/components/medical-records/longitudinal-clinical-summary";
import { MedicalRecordCopilotPortal } from "@/components/medical-records/medical-record-copilot-portal";
import { useMedicalRecordLayout } from "@/components/medical-records/medical-record-layout";
import { PatientClinicalTimeline } from "@/components/medical-records/patient-clinical-timeline";
import type { StoredLongitudinalSummary } from "@/lib/ai/longitudinal-schema";

type FieldName = keyof MedicalRecordFormValues;

const sections: Array<{
  name: FieldName;
  label: string;
  placeholder?: string;
  rows?: number;
}> = [
  {
    name: "chief_complaint",
    label: "Queixa principal",
    placeholder: "Queixa principal e motivo do atendimento.",
  },
  {
    name: "hpi",
    label: "História da doença atual",
    placeholder: "Descreva a história da doença atual.",
  },
  {
    name: "pmh",
    label: "Antecedentes pessoais",
    placeholder: "História patológica pregressa.",
  },
  { name: "family_history", label: "História familiar" },
  {
    name: "social_history",
    label: "História social e hábitos de vida",
    placeholder: "Tabagismo, etilismo, atividade física, alimentação e sono.",
  },
  { name: "assessment", label: "Hipóteses diagnósticas" },
  {
    name: "cid10",
    label: "CID-10",
    placeholder: "Códigos e descrições dos diagnósticos.",
  },
  { name: "plan", label: "Plano e conduta" },
  {
    name: "prescription",
    label: "Prescrição",
    placeholder:
      "Resumo da prescrição e observações clínicas. Use Documentos clínicos para emitir a receita.",
  },
  { name: "exam_requests", label: "Solicitação de exames" },
  {
    name: "certificate",
    label: "Atestados",
    placeholder:
      "Resumo do afastamento e observações clínicas. Use Documentos clínicos para emitir o atestado.",
  },
  { name: "guidance", label: "Orientações" },
  {
    name: "return_guidance",
    label: "Retorno",
    placeholder: "Data sugerida e observações para retorno.",
  },
];

function ageFromBirthDate(birthDate: string | null) {
  if (!birthDate) return null;
  const birth = new Date(`${birthDate}T12:00:00`);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  if (
    today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())
  )
    age -= 1;
  return age;
}

function maskedCpf(cpf: string | null) {
  if (!cpf) return "Não informado";
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) return cpf;
  return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
}

function initialValues(
  record: MedicalRecord | null,
  appointment: MedicalRecordAppointment,
): MedicalRecordFormValues {
  if (!record) {
    return {
      ...medicalRecordDefaultValues,
      allergies: appointment.patient?.allergies ?? "",
      medications: appointment.patient?.continuous_medications ?? "",
      pmh: appointment.patient?.medical_history ?? "",
    };
  }
  return Object.fromEntries(
    Object.keys(medicalRecordDefaultValues).map((key) => [
      key,
      record[key as FieldName] ?? "",
    ]),
  ) as MedicalRecordFormValues;
}

function TextAreaField({
  form,
  name,
  label,
  placeholder,
  rows = 5,
  disabled,
  aiPending,
  onManualEdit,
}: {
  form: UseFormReturn<MedicalRecordFormValues>;
  name: FieldName;
  label: string;
  placeholder?: string;
  rows?: number;
  disabled: boolean;
  aiPending: boolean;
  onManualEdit: (field: FieldName) => void;
}) {
  const error = form.formState.errors[name]?.message;
  const registration = form.register(name);
  const [open, setOpen] = useState(name === "chief_complaint");
  const helperText = placeholder?.replaceAll("\n", " ") || `Preencha ${label.toLowerCase()}.`;
  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      data-section={name}
      className={`group scroll-mt-6 overflow-hidden rounded-lg border bg-card transition-[background-color,box-shadow] duration-500 ${
        aiPending
          ? "bg-primary/5 ring-2 ring-primary/35 animate-[ai-field-highlight_2s_ease-out]"
          : ""
      }`}
    >
      <summary className="grid h-12 cursor-pointer list-none grid-cols-[20px_minmax(150px,auto)_minmax(0,1fr)_20px] items-center gap-3 px-4 text-left [&::-webkit-details-marker]:hidden">
        <FileText className="size-[18px] text-primary" aria-hidden="true" />
        <span className="truncate text-sm font-semibold leading-none">
          {label}
        </span>
        <span className="hidden truncate text-[13px] text-muted-foreground sm:block">
          {helperText}
        </span>
        {open ? (
          <ChevronDown className="size-[18px] text-muted-foreground" aria-hidden="true" />
        ) : (
          <ChevronRight className="size-[18px] text-muted-foreground" aria-hidden="true" />
        )}
      </summary>
      <div className="border-t p-3 pt-2">
        <label className="sr-only" htmlFor={name}>
          {label}
        </label>
        <textarea
          id={name}
          rows={rows}
          disabled={disabled}
          placeholder={placeholder}
          className="w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm leading-6 outline-none transition-shadow placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-70"
          {...registration}
          onChange={(event) => {
            void registration.onChange(event);
            onManualEdit(name);
          }}
        />
        {aiPending && (
          <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">
            Preenchido pelo ASTER Copilot — pendente de revisão
          </p>
        )}
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </div>
    </details>
  );
}

export function MedicalRecordForm({
  appointment,
  record,
  history,
  patientDocuments,
  canEdit,
  aiEnabled,
  canManageAi,
  initialLongitudinalSummary,
}: {
  appointment: MedicalRecordAppointment;
  record: MedicalRecord | null;
  history: MedicalRecordHistoryItem[];
  patientDocuments: Array<{
    id: string;
    title: string;
    document_type: string;
    status: string;
    issued_at: string | null;
    created_at: string;
  }>;
  canEdit: boolean;
  aiEnabled: boolean;
  canManageAi: boolean;
  initialLongitudinalSummary: StoredLongitudinalSummary | null;
}) {
  const router = useRouter();
  const { copilotCollapsed, toggleCopilot } = useMedicalRecordLayout();
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >(record?.status === "draft" ? "saved" : "idle");
  const [lastSavedAt, setLastSavedAt] = useState(record?.last_saved_at ?? null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [returnMode, setReturnMode] = useState<"none" | "days" | "date">(
    "none",
  );
  const [returnDays, setReturnDays] = useState("30");
  const [returnDate, setReturnDate] = useState("");
  const autosaveReady = useRef(false);
  const aiReviewPending = useRef(false);
  const [aiPendingFields, setAiPendingFields] = useState<FieldName[]>([]);
  const [importSource, setImportSource] =
    useState<MedicalRecordHistoryItem | null>(null);
  const [selectedFields, setSelectedFields] = useState<FieldName[]>([]);
  const [copilotMobileOpen, setCopilotMobileOpen] = useState(false);
  const form = useForm<MedicalRecordFormValues>({
    resolver: zodResolver(medicalRecordSchema),
    defaultValues: initialValues(record, appointment),
  });
  const patient = appointment.patient;
  const age = ageFromBirthDate(patient?.birth_date ?? null);

  async function persist(values: MedicalRecordFormValues, notify = false) {
    setSaving(true);
    setSaveState("saving");
    setSaveError(null);
    const result = await saveMedicalRecord(appointment.id, values);
    setSaving(false);
    if (result.error) {
      setSaveState("error");
      setSaveError(result.error);
      if (notify) toast.error(result.error);
      return false;
    }
    setSaveState("saved");
    aiReviewPending.current = false;
    setAiPendingFields([]);
    setLastSavedAt(new Date().toISOString());
    if (notify) toast.success(result.success);
    router.refresh();
    return true;
  }
  async function submit(values: MedicalRecordFormValues) {
    await persist(values, true);
  }

  useEffect(() => {
    if (!canEdit) return;
    // React Hook Form exposes a subscription API used here only for debounced draft persistence.
    // eslint-disable-next-line react-hooks/incompatible-library
    const subscription = form.watch(() => {
      if (aiReviewPending.current) {
        setSaveState("idle");
        return;
      }
      if (!autosaveReady.current) {
        autosaveReady.current = true;
        return;
      }
      setSaveState("idle");
      window.clearTimeout(
        (window as Window & { __asterDraftTimer?: number }).__asterDraftTimer,
      );
      (window as Window & { __asterDraftTimer?: number }).__asterDraftTimer =
        window.setTimeout(
          () => void form.handleSubmit((values) => persist(values))(),
          1500,
        );
    });
    return () => {
      subscription.unsubscribe();
      window.clearTimeout(
        (window as Window & { __asterDraftTimer?: number }).__asterDraftTimer,
      );
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, appointment.id]);

  async function finalize() {
    const valid = await form.trigger(["chief_complaint", "assessment", "plan"]);
    const values = form.getValues();
    if (
      !valid ||
      !values.chief_complaint?.trim() ||
      !values.assessment?.trim() ||
      !values.plan?.trim()
    )
      return toast.error("Preencha motivo da consulta, avaliação e conduta.");
    setFinalizing(true);
    const saved = await persist(values);
    if (!saved) {
      setFinalizing(false);
      return;
    }
    const result = await finalizeClinicalEncounter(appointment.id);
    setFinalizing(false);
    if (result.error) return toast.error(result.error);
    toast.success(result.success);
    setFinalizeOpen(false);
    router.refresh();
    let date = returnDate;
    if (returnMode === "days") {
      const next = new Date();
      next.setDate(next.getDate() + Math.max(1, Number(returnDays) || 30));
      date = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Bahia",
      }).format(next);
    }
    if (returnMode !== "none" && date)
      router.push(
        `/appointments/new?patient=${appointment.patient_id}&professional=${appointment.professional_id}&type=return&date=${date}`,
      );
  }

  const importOptions: Array<{ name: FieldName; label: string }> = [
    { name: "pmh", label: "Antecedentes" },
    { name: "allergies", label: "Alergias" },
    { name: "medications", label: "Medicamentos" },
    { name: "family_history", label: "História familiar" },
    { name: "social_history", label: "História social" },
    { name: "assessment", label: "Diagnósticos" },
    { name: "plan", label: "Plano anterior" },
  ];
  function importPrevious() {
    if (!importSource) return;
    selectedFields.forEach((field) =>
      form.setValue(field, importSource[field] ?? "", {
        shouldDirty: true,
        shouldValidate: true,
      }),
    );
    toast.success(
      `${selectedFields.length} campo(s) importado(s). Revise antes de salvar.`,
    );
    setSelectedFields([]);
    setImportSource(null);
  }

  function markAiFields(fields: FieldName[]) {
    aiReviewPending.current = true;
    setAiPendingFields((current) => [...new Set([...current, ...fields])]);
    window.clearTimeout(
      (window as Window & { __asterDraftTimer?: number }).__asterDraftTimer,
    );
    setSaveState("idle");
  }

  function markFieldReviewed(field: FieldName) {
    setAiPendingFields((current) => {
      const next = current.filter((item) => item !== field);
      aiReviewPending.current = next.length > 0;
      return next;
    });
  }

  return (
    <form onSubmit={form.handleSubmit(submit)} className="min-w-0 space-y-4">
      <header className="flex min-h-16 flex-col gap-3 border-b bg-background pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="truncate text-lg font-semibold tracking-tight">
              {patient?.social_name || patient?.full_name || "Paciente"}
            </h1>
            <Badge
              variant={
                record?.status === "finalized" || record?.status === "amended"
                  ? "default"
                  : record
                    ? "secondary"
                    : "outline"
              }
            >
              {record?.status === "finalized"
                ? "Finalizado"
                : record?.status === "amended"
                  ? "Com adendo"
                  : record
                    ? "Rascunho"
                    : "Novo"}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {age === null ? "Idade não informada" : `${age} anos`}
            </span>
            <span className="text-xs text-muted-foreground">
              {patient?.gender || "Sexo não informado"}
            </span>
            <span className="text-xs text-muted-foreground">
              {maskedCpf(patient?.cpf ?? null)}
            </span>
            <span className="text-xs text-muted-foreground">
              {patient?.insurance || "Sem convênio"}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {new Intl.DateTimeFormat("pt-BR").format(
              new Date(`${appointment.appointment_date}T12:00:00`),
            )}{" "}
            • {appointment.start_time.slice(0, 5)} •{" "}
            {appointmentTypeLabels[appointment.appointment_type]}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" render={<Link href={`/patients/${appointment.patient_id}/longitudinal`} />} nativeButton={false}>
            <Activity /> Visão longitudinal
          </Button>
          <div className="text-right text-xs text-muted-foreground">
            {saveState === "saving" && "Salvando rascunho..."}
            {saveState === "saved" && (
              <span className="text-emerald-600">Rascunho salvo</span>
            )}
            {saveState === "error" && (
              <span className="text-destructive">Erro de salvamento</span>
            )}
            {lastSavedAt && (
              <span className="block">
                Última gravação:{" "}
                {new Date(lastSavedAt).toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
          </div>
          <Button type="submit" disabled={saving || !canEdit} variant="outline">
            {saving ? <Loader2 className="animate-spin" /> : <Save />} Salvar
            rascunho
          </Button>
          {canEdit && (
            <Dialog open={finalizeOpen} onOpenChange={setFinalizeOpen}>
              <DialogTrigger asChild>
                <Button type="button">
                  <Flag /> Finalizar consulta
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Finalizar consulta?</DialogTitle>
                  <DialogDescription>
                    Esta ação torna o prontuário somente leitura. Confirme os
                    dados clínicos antes de continuar.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <label className="flex gap-2 text-sm">
                    <input
                      type="radio"
                      checked={returnMode === "none"}
                      onChange={() => setReturnMode("none")}
                    />{" "}
                    Sem retorno
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      checked={returnMode === "days"}
                      onChange={() => setReturnMode("days")}
                    />{" "}
                    Retorno em{" "}
                    <input
                      className="w-20 rounded border px-2 py-1"
                      type="number"
                      min="1"
                      value={returnDays}
                      onChange={(event) => setReturnDays(event.target.value)}
                    />{" "}
                    dias
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      checked={returnMode === "date"}
                      onChange={() => setReturnMode("date")}
                    />{" "}
                    Data específica{" "}
                    <input
                      className="rounded border px-2 py-1"
                      type="date"
                      value={returnDate}
                      onChange={(event) => setReturnDate(event.target.value)}
                    />
                  </label>
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="outline">
                      Revisar prontuário
                    </Button>
                  </DialogClose>
                  <Button
                    type="button"
                    disabled={
                      finalizing || (returnMode === "date" && !returnDate)
                    }
                    onClick={finalize}
                  >
                    {finalizing && <Loader2 className="animate-spin" />}{" "}
                    Confirmar finalização
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </header>

      {!canEdit && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-800 dark:text-amber-200">
          {record?.status === "finalized" || record?.status === "amended"
            ? "Prontuário finalizado — conteúdo disponível somente para leitura."
            : "O prontuário só pode ser editado pelo profissional responsável durante o atendimento."}
        </div>
      )}
      {saveError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="size-4" />
          {saveError}
        </div>
      )}

      <PatientClinicalTimeline
        appointment={appointment}
        history={history}
        documents={patientDocuments}
      />

      <Button
        type="button"
        className="fixed right-4 bottom-4 z-40 shadow-lg lg:hidden"
        onClick={() => setCopilotMobileOpen(true)}
      >
        <Sparkles /> Abrir Copilot
      </Button>

      <div className="w-full min-w-0">
        <main className="flex min-w-0 flex-col gap-4">
          <div className="order-2">
            <LongitudinalClinicalSummary
              patientId={appointment.patient_id}
              initialSummary={initialLongitudinalSummary}
            />
          </div>

          <div className="contents">
            <div className="order-3">
              <Card className="shadow-none">
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <FileClock className="size-5 text-primary" /> Histórico
                      longitudinal
                    </CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Consultas anteriores deste paciente, em modo somente
                      leitura.
                    </p>
                  </div>
                  {history[0] && canEdit && (
                    <Dialog
                      open={Boolean(importSource)}
                      onOpenChange={(open) => {
                        if (!open) {
                          setImportSource(null);
                          setSelectedFields([]);
                        }
                      }}
                    >
                      <DialogTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setImportSource(history[0])}
                        >
                          <Copy /> Importar dados anteriores
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Importar dados anteriores</DialogTitle>
                          <DialogDescription>
                            Escolha a consulta de origem e apenas os campos que
                            deseja copiar. A evolução completa não será
                            importada.
                          </DialogDescription>
                        </DialogHeader>
                        <label className="text-sm font-medium">
                          Consulta de origem
                          <select
                            className="mt-2 w-full rounded-lg border bg-background px-3 py-2"
                            value={importSource?.id ?? ""}
                            onChange={(event) =>
                              setImportSource(
                                history.find(
                                  (item) => item.id === event.target.value,
                                ) ?? null,
                              )
                            }
                          >
                            {history.map((item) => (
                              <option key={item.id} value={item.id}>
                                {new Date(
                                  `${item.appointment_date}T12:00:00`,
                                ).toLocaleDateString("pt-BR")}{" "}
                                · {item.title}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {importOptions.map((option) => (
                            <label
                              key={option.name}
                              className="flex items-center gap-2 rounded-lg border p-3 text-sm"
                            >
                              <input
                                type="checkbox"
                                checked={selectedFields.includes(option.name)}
                                disabled={!importSource?.[option.name]}
                                onChange={(event) =>
                                  setSelectedFields((current) =>
                                    event.target.checked
                                      ? [...current, option.name]
                                      : current.filter(
                                          (field) => field !== option.name,
                                        ),
                                  )
                                }
                              />
                              {option.label}
                            </label>
                          ))}
                        </div>
                        <DialogFooter>
                          <DialogClose asChild>
                            <Button type="button" variant="outline">
                              Cancelar
                            </Button>
                          </DialogClose>
                          <Button
                            type="button"
                            disabled={!selectedFields.length}
                            onClick={importPrevious}
                          >
                            Importar selecionados
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  )}
                </CardHeader>
                <CardContent>
                  {history.length ? (
                    <div className="space-y-3">
                      <div className="rounded-xl border bg-muted/20 p-4">
                        <p className="text-sm">
                          <span className="text-muted-foreground">
                            Última consulta:
                          </span>{" "}
                          <strong>
                            {new Date(
                              `${history[0].appointment_date}T12:00:00`,
                            ).toLocaleDateString("pt-BR")}
                          </strong>{" "}
                          com {history[0].professional_name}
                        </p>
                        <p className="mt-2 text-sm">
                          <strong>Diagnóstico/CID:</strong>{" "}
                          {history[0].assessment || "Não informado"}
                          {history[0].cid10 ? ` · ${history[0].cid10}` : ""}
                        </p>
                        <p className="mt-1 text-sm">
                          <strong>Conduta:</strong>{" "}
                          {history[0].plan || "Não informada"}
                        </p>
                      </div>
                      <div className="space-y-3 border-l-2 pl-4">
                        {history.map((item) => (
                          <Dialog key={item.id}>
                            <DialogTrigger asChild>
                              <button
                                type="button"
                                className="w-full rounded-xl border p-4 text-left transition-colors hover:bg-muted/40"
                              >
                                <span className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="font-medium">
                                    {item.title}
                                  </span>
                                  <Badge variant="outline">
                                    <CalendarClock className="size-3" />{" "}
                                    {new Date(
                                      `${item.appointment_date}T12:00:00`,
                                    ).toLocaleDateString("pt-BR")}
                                  </Badge>
                                </span>
                                <span className="mt-2 block text-sm text-muted-foreground">
                                  {item.chief_complaint ||
                                    "Sem queixa principal registrada"}{" "}
                                  · {item.professional_name}
                                </span>
                              </button>
                            </DialogTrigger>
                            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
                              <DialogHeader>
                                <DialogTitle>{item.title}</DialogTitle>
                                <DialogDescription>
                                  {new Date(
                                    `${item.appointment_date}T12:00:00`,
                                  ).toLocaleDateString("pt-BR")}{" "}
                                  às {item.start_time.slice(0, 5)} ·{" "}
                                  {item.professional_name} · somente leitura
                                </DialogDescription>
                              </DialogHeader>
                              <div className="grid gap-4 sm:grid-cols-2">
                                {[
                                  ["Queixa principal", item.chief_complaint],
                                  ["HDA", item.hpi],
                                  ["Avaliação", item.assessment],
                                  ["CID", item.cid10],
                                  ["Conduta", item.plan],
                                  ["Prescrições", item.prescription],
                                  [
                                    "Solicitações de exames",
                                    item.exam_requests,
                                  ],
                                  ["Alergias", item.allergies],
                                  ["Medicamentos em uso", item.medications],
                                ].map(([label, value]) => (
                                  <div
                                    key={label}
                                    className="rounded-lg border p-3"
                                  >
                                    <p className="text-xs font-semibold uppercase text-muted-foreground">
                                      {label}
                                    </p>
                                    <p className="mt-2 whitespace-pre-wrap text-sm">
                                      {value || "Não informado"}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </DialogContent>
                          </Dialog>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="py-8 text-center">
                      <FileClock className="mx-auto size-7 text-muted-foreground" />
                      <p className="mt-2 text-sm text-muted-foreground">
                        Nenhuma consulta anterior com prontuário.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="order-1 space-y-1.5">
              {sections.map((section, index) => (
                <div key={section.name} className="contents">
                  <TextAreaField
                    form={form}
                    disabled={!canEdit}
                    aiPending={aiPendingFields.includes(section.name)}
                    onManualEdit={markFieldReviewed}
                    {...section}
                  />
                  {index === 2 && (
                    <div className="space-y-1.5">
                      <TextAreaField
                        form={form}
                        name="medications"
                        label="Medicações em uso"
                        disabled={!canEdit}
                        aiPending={aiPendingFields.includes("medications")}
                        onManualEdit={markFieldReviewed}
                      />
                      <TextAreaField
                        form={form}
                        name="allergies"
                        label="Alergias"
                        disabled={!canEdit}
                        aiPending={aiPendingFields.includes("allergies")}
                        onManualEdit={markFieldReviewed}
                      />
                    </div>
                  )}
                  {section.name === "social_history" && (
                    <AdaptivePhysicalExam
                      form={form}
                      disabled={!canEdit}
                      patientAge={age}
                      aiPending={
                        aiPendingFields.includes("physical_exam") ||
                        aiPendingFields.includes("vital_signs")
                      }
                      onManualEdit={markFieldReviewed}
                    />
                  )}
                </div>
              ))}

              <details
                data-section="documents"
                className="group overflow-hidden rounded-lg border bg-card"
              >
                <summary className="grid h-12 cursor-pointer list-none grid-cols-[20px_minmax(150px,auto)_minmax(0,1fr)_20px] items-center gap-3 px-4 [&::-webkit-details-marker]:hidden">
                  <FileText className="size-[18px] text-primary" aria-hidden="true" />
                  <span className="truncate text-sm font-semibold">Documentos</span>
                  <span className="hidden truncate text-[13px] text-muted-foreground sm:block">
                    Consulte os documentos emitidos nesta consulta.
                  </span>
                  <ChevronRight className="size-[18px] text-muted-foreground transition-transform group-open:rotate-90" aria-hidden="true" />
                </summary>
                <div className="space-y-2 border-t p-3">
                  {patientDocuments.length ? (
                    patientDocuments.map((document) => (
                      <Link
                        key={document.id}
                        href={`/documentos/${document.id}`}
                        className="flex items-center justify-between rounded-lg border p-3 text-sm hover:bg-muted/30"
                      >
                        <span>{document.title}</span>
                        <Badge
                          variant={
                            document.status === "cancelled"
                              ? "destructive"
                              : "outline"
                          }
                        >
                          {document.issued_at
                            ? new Date(document.issued_at).toLocaleDateString(
                                "pt-BR",
                              )
                            : "Emitido"}
                        </Badge>
                      </Link>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Nenhum documento clínico emitido nesta consulta.
                    </p>
                  )}
                </div>
              </details>
            </div>
          </div>
        </main>

        <MedicalRecordCopilotPortal>
          <aside
            className={`${copilotMobileOpen ? "fixed inset-0 z-50 block overflow-y-auto bg-background p-4" : "hidden"} min-w-0 max-w-full overflow-x-hidden lg:inset-auto lg:z-auto lg:block lg:h-full lg:min-h-full lg:bg-transparent lg:p-0`}
          >
            {copilotCollapsed && !copilotMobileOpen ? (
              <div className="flex min-h-full flex-col items-center gap-3 rounded-xl border border-primary/25 bg-card p-2 shadow-sm">
                <Sparkles className="mt-2 size-5 text-primary" />
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Expandir ASTER Copilot"
                  onClick={toggleCopilot}
                >
                  <ChevronLeft />
                </Button>
              </div>
            ) : (
              <div className="flex h-full min-h-full flex-col gap-3 rounded-xl border border-primary/25 bg-card p-2 shadow-sm">
                <div className="flex justify-end lg:hidden">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setCopilotMobileOpen(false)}
                  >
                    <X /> Fechar Copilot
                  </Button>
                </div>
                <ClinicalAIPanel
                  appointmentId={appointment.id}
                  form={form}
                  enabled={aiEnabled}
                  canEdit={canEdit}
                  canManageAi={canManageAi}
                  onFieldsInserted={markAiFields}
                  documents={
                    <RecordDocuments
                      appointmentId={appointment.id}
                      canCreate={canEdit}
                      documents={patientDocuments}
                      getFormValues={() => form.getValues()}
                    />
                  }
                  patientAge={age}
                  patientGender={patient?.gender ?? null}
                />
                <div className="mt-auto hidden justify-end border-t pt-2 lg:flex">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label="Recolher ASTER Copilot"
                    onClick={toggleCopilot}
                  >
                    <ChevronRight /> Recolher painel
                  </Button>
                </div>
              </div>
            )}
          </aside>
        </MedicalRecordCopilotPortal>
      </div>
    </form>
  );
}
