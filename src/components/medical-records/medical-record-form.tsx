"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertCircle,
  Activity,
  CalendarClock,
  Calculator,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileClock,
  FileText,
  Flag,
  Loader2,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  PanelRightOpen,
  Printer,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm, useWatch, type UseFormReturn } from "react-hook-form";
import { toast } from "sonner";

import {
  finalizeClinicalEncounter,
  issuePrescriptionFromMedicalRecord,
  saveMedicalRecord,
  savePrescriptionDraft,
} from "@/app/(dashboard)/consultas/actions";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { RecordDocuments } from "@/components/clinical-documents/record-documents";
import { ClinicalAIPanel } from "@/components/medical-records/clinical-ai-panel";
import { AdaptivePhysicalExam } from "@/components/medical-records/adaptive-physical-exam";
import { LongitudinalClinicalSummary } from "@/components/medical-records/longitudinal-clinical-summary";
import { MedicalRecordCopilotPortal } from "@/components/medical-records/medical-record-copilot-portal";
import { useMedicalRecordLayout } from "@/components/medical-records/medical-record-layout";
import { PatientClinicalTimeline } from "@/components/medical-records/patient-clinical-timeline";
import { ClinicalScores } from "@/components/medical-records/clinical-scores";
import { IntelligentPrescriptionEngine } from "@/components/prescriptions/intelligent-prescription-engine";
import { DiagnosisEngine } from "@/components/diagnoses/diagnosis-engine";
import { ClinicalPlanEngine } from "@/components/clinical-plan/clinical-plan-engine";
import { WorkspaceStepper } from "@/components/medical-records/consultation-stepper";
import { ContextualClinicalPanel } from "@/components/medical-records/contextual-clinical-panel";
import { useWorkspaceContext } from "@/components/clinical-workspace/workspace-provider";
import { workspaceSections } from "@/lib/clinical-workspace/section-registry";
import {
  ClinicalSection,
  WorkspaceNavigation,
  WorkspaceSidebar,
} from "@/components/clinical-workspace/workspace-primitives";
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
  { name: "family_history", label: "Antecedentes familiares" },
  {
    name: "social_history",
    label: "Hábitos de vida",
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
  const value = useWatch({ control: form.control, name }) ?? "";
  const [open, setOpen] = useState(name === "chief_complaint");
  const helperText =
    placeholder?.replaceAll("\n", " ") || `Preencha ${label.toLowerCase()}.`;
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
      <summary className="grid h-10 cursor-pointer list-none grid-cols-[18px_minmax(140px,auto)_minmax(0,1fr)_18px] items-center gap-2.5 px-3 text-left [&::-webkit-details-marker]:hidden">
        <FileText className="size-[18px] text-primary" aria-hidden="true" />
        <span className="truncate text-sm font-semibold leading-none">
          {label}
        </span>
        <span className="hidden truncate text-[13px] text-muted-foreground sm:block">
          {value.trim()
            ? `${value.trim().split(/\s+/).length} palavras · ${value.trim().slice(0, 90)}`
            : helperText}
        </span>
        {open ? (
          <ChevronDown
            className="size-[18px] text-muted-foreground"
            aria-hidden="true"
          />
        ) : (
          <ChevronRight
            className="size-[18px] text-muted-foreground"
            aria-hidden="true"
          />
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
            Preenchido pelo ASTER AI — pendente de revisão
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
  clinicIdentity,
  professionalProfile,
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
  clinicIdentity: {
    name: string | null;
    legal_name: string | null;
    logo_url: string | null;
    phone: string | null;
    email: string | null;
  } | null;
  professionalProfile: {
    professional_name: string | null;
    council: string | null;
    council_number: string | null;
    council_state: string | null;
    specialty: string | null;
  } | null;
}) {
  const router = useRouter();
  const {
    copilotCollapsed,
    focusMode,
    toggleCopilot,
    toggleFocusMode,
  } = useMedicalRecordLayout();
  const [, setSaving] = useState(false);
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
  const formElementRef = useRef<HTMLFormElement | null>(null);
  const aiReviewPending = useRef(false);
  const [aiPendingFields, setAiPendingFields] = useState<FieldName[]>([]);
  const [importSource, setImportSource] =
    useState<MedicalRecordHistoryItem | null>(null);
  const [selectedFields, setSelectedFields] = useState<FieldName[]>([]);
  const [copilotMobileOpen, setCopilotMobileOpen] = useState(false);
  const [allowMultipleSections, setAllowMultipleSections] = useState(false);
  const { timelineOpen, setTimelineOpen, updateClinicalState } =
    useWorkspaceContext();
  const form = useForm<MedicalRecordFormValues>({
    resolver: zodResolver(medicalRecordSchema),
    defaultValues: initialValues(record, appointment),
  });
  const prescriptionValue =
    useWatch({ control: form.control, name: "prescription" }) ?? "";
  const assessmentValue =
    useWatch({ control: form.control, name: "assessment" }) ?? "";
  const cidValue = useWatch({ control: form.control, name: "cid10" }) ?? "";
  const planValue = useWatch({ control: form.control, name: "plan" }) ?? "";
  const examRequestsValue =
    useWatch({ control: form.control, name: "exam_requests" }) ?? "";
  const guidanceValue =
    useWatch({ control: form.control, name: "guidance" }) ?? "";
  const returnGuidanceValue =
    useWatch({ control: form.control, name: "return_guidance" }) ?? "";
  const [chiefComplaintValue, hpiValue, physicalExamValue, vitalSignsValue] =
    useWatch({
      control: form.control,
      name: ["chief_complaint", "hpi", "physical_exam", "vital_signs"],
    });
  const patient = appointment.patient;
  const age = ageFromBirthDate(patient?.birth_date ?? null);

  useEffect(() => {
    const stored = window.localStorage.getItem(
      "aster:allow-multiple-clinical-sections",
    );
    if (stored === "true") {
      // Restore the clinician's accordion preference after hydration.
      setAllowMultipleSections(true);
    }
  }, []);

  useEffect(() => {
    const container = formElementRef.current;
    if (!container || allowMultipleSections) return;
    const handleToggle = (event: Event) => {
      const opened = event.target;
      if (
        !(opened instanceof HTMLDetailsElement) ||
        !opened.open ||
        !opened.dataset.section
      )
        return;
      container
        .querySelectorAll<HTMLDetailsElement>("details[data-section][open]")
        .forEach((section) => {
          if (section !== opened) section.open = false;
        });
    };
    container.addEventListener("toggle", handleToggle, true);
    return () => container.removeEventListener("toggle", handleToggle, true);
  }, [allowMultipleSections]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.altKey && !event.ctrlKey && !event.metaKey) {
        const index = Number(event.key) - 1;
        const section = workspaceSections[index];
        if (!section) return;
        event.preventDefault();
        const target = document.querySelector<HTMLDetailsElement>(
          section.selector,
        );
        if (!target) return;
        if (target.tagName === "DETAILS") target.open = true;
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void form.handleSubmit((values) => persist(values, true))();
        return;
      }
      if (event.ctrlKey && event.key === "Enter" && canEdit) {
        event.preventDefault();
        setFinalizeOpen(true);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
    // persist intentionally follows the current form instance and appointment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, form]);

  useEffect(() => {
    const timer = window.setTimeout(
      () =>
        updateClinicalState({
          anamnesis: [chiefComplaintValue, hpiValue]
            .filter(Boolean)
            .join("\n\n"),
          physicalExam: [vitalSignsValue, physicalExamValue]
            .filter(Boolean)
            .join("\n\n"),
          diagnoses: [assessmentValue, cidValue].filter(Boolean).join("\n"),
          conduct: [
            planValue,
            examRequestsValue,
            guidanceValue,
            returnGuidanceValue,
          ]
            .filter(Boolean)
            .join("\n\n"),
          prescription: prescriptionValue,
          documents: patientDocuments.length,
        }),
      120,
    );
    return () => window.clearTimeout(timer);
  }, [
    assessmentValue,
    chiefComplaintValue,
    cidValue,
    examRequestsValue,
    guidanceValue,
    hpiValue,
    patientDocuments.length,
    physicalExamValue,
    planValue,
    prescriptionValue,
    returnGuidanceValue,
    updateClinicalState,
    vitalSignsValue,
  ]);

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

  function insertScoreSummary(field: FieldName, value: string) {
    const current = form.getValues(field)?.trim();
    if (
      current &&
      !window.confirm(
        "Este campo já possui conteúdo. Deseja acrescentar o resultado ao final?",
      )
    )
      return;
    form.setValue(field, current ? `${current}\n\n${value}` : value, {
      shouldDirty: true,
      shouldValidate: true,
    });
    markAiFields([field]);
    toast.success(
      "Resultado levado ao formulário em memória. Revise antes de salvar.",
    );
  }

  return (
    <form
      ref={formElementRef}
      onSubmit={form.handleSubmit(submit)}
      className="min-w-0 space-y-2 pb-2"
    >
      <header
        className={`sticky z-40 flex min-h-11 flex-col gap-1.5 border-b bg-background/95 py-1 backdrop-blur lg:flex-row lg:items-center lg:justify-between ${
          focusMode ? "top-0" : "top-14"
        }`}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar size="sm" className="size-7 ring-1 ring-primary/30">
            <AvatarFallback>
              {(patient?.social_name || patient?.full_name || "P")
                .split(" ")
                .slice(0, 2)
                .map((item) => item[0])
                .join("")
                .toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <h1 className="max-w-48 truncate text-xs font-semibold tracking-wide uppercase">
            {patient?.social_name || patient?.full_name || "Paciente"}
          </h1>
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            <span>{age === null ? "Idade não informada" : `${age} anos`}</span>
            <span aria-hidden="true">·</span>
            <span>{patient?.gender || "Sexo não informado"}</span>
            <span aria-hidden="true">·</span>
            <span>{patient?.insurance || "Particular"}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">
              Atendimento #{appointment.id.slice(0, 6).toUpperCase()}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {new Intl.DateTimeFormat("pt-BR").format(
                new Date(`${appointment.appointment_date}T12:00:00`),
              )}
            </span>
            <span>{appointment.start_time.slice(0, 5)}</span>
            <Badge
              variant={
                record?.status === "finalized" || record?.status === "amended"
                  ? "default"
                  : record
                    ? "secondary"
                    : "outline"
              }
              className="h-5 px-1.5 text-[10px]"
            >
              {record?.status === "finalized"
                ? "Concluído"
                : record?.status === "amended"
                  ? "Com adendo"
                  : "Em andamento"}
            </Badge>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <span
            className={`inline-flex h-8 items-center gap-1.5 px-2 text-[11px] ${
              saveState === "error"
                ? "text-destructive"
                : "text-muted-foreground"
            }`}
            role="status"
          >
            {saveState === "saving" ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : saveState === "error" ? (
              <AlertCircle
                className="size-3.5 text-destructive"
                aria-hidden="true"
              />
            ) : (
              <Check className="size-3.5 text-emerald-600" aria-hidden="true" />
            )}
            {saveState === "saving"
              ? "Salvando..."
              : saveState === "error"
                ? "Erro ao salvar"
                : "Salvo agora"}
            {lastSavedAt && saveState !== "saving" && (
              <span className="sr-only">
                às{" "}
                {new Date(lastSavedAt).toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-expanded={timelineOpen}
            onClick={() => setTimelineOpen(true)}
          >
            <PanelRightOpen /> Histórico Clínico
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            render={
              <a
                href={`/api/medical-records/${appointment.id}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
              />
            }
            nativeButton={false}
          >
            <Printer /> PDF
          </Button>
          <details className="group relative">
            <summary className="flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              <MoreHorizontal className="size-4" aria-hidden="true" />
              Mais
            </summary>
            <div className="absolute top-full right-0 z-50 mt-1 w-64 rounded-lg border bg-popover p-1.5 text-popover-foreground shadow-lg">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="w-full justify-start"
                onClick={toggleFocusMode}
              >
                {focusMode ? <Minimize2 /> : <Maximize2 />}
                {focusMode ? "Sair do modo foco" : "Entrar no modo foco"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="w-full justify-start"
                render={
                  <Link
                    href={`/patients/${appointment.patient_id}/longitudinal`}
                  />
                }
                nativeButton={false}
              >
                <Activity /> Visão longitudinal
              </Button>
              <label className="flex min-h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-xs hover:bg-muted">
                <input
                  type="checkbox"
                  checked={allowMultipleSections}
                  onChange={(event) => {
                    const next = event.target.checked;
                    setAllowMultipleSections(next);
                    window.localStorage.setItem(
                      "aster:allow-multiple-clinical-sections",
                      String(next),
                    );
                  }}
                />
                Permitir múltiplos abertos
              </label>
              <div className="mt-1 border-t px-2 pt-1 text-[10px] leading-4 text-muted-foreground">
                Alt+1–7 navega · Ctrl+S salva · Ctrl+Enter finaliza
              </div>
            </div>
          </details>
          {canEdit && (
            <Dialog open={finalizeOpen} onOpenChange={setFinalizeOpen}>
              <DialogTrigger asChild>
                <Button type="button" size="sm">
                  <Flag /> Finalizar Atendimento
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Finalizar atendimento?</DialogTitle>
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

      <WorkspaceNavigation>
        <WorkspaceStepper
          focusMode={focusMode}
          completed={{
            anamnesis: Boolean(chiefComplaintValue?.trim() && hpiValue?.trim()),
            scores: false,
            physical_exam: Boolean(
              physicalExamValue?.trim() || vitalSignsValue?.trim(),
            ),
            assessment: Boolean(assessmentValue.trim()),
            plan: Boolean(planValue.trim()),
            prescription: Boolean(prescriptionValue.trim()),
            record: Boolean(record),
          }}
        />
      </WorkspaceNavigation>

      {!canEdit && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-800 dark:text-amber-200">
          {record?.status === "finalized" || record?.status === "amended"
            ? "Esta consulta já foi finalizada e não pode ser alterada diretamente. Para registrar novas informações, crie um adendo ou um novo atendimento."
            : "O prontuário só pode ser editado pelo profissional responsável durante o atendimento."}
        </div>
      )}
      {saveError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="size-4" />
          {saveError}
        </div>
      )}

      <Button
        type="button"
        className="fixed right-4 bottom-4 z-40 shadow-lg lg:hidden"
        onClick={() => setCopilotMobileOpen(true)}
      >
        <Sparkles /> Abrir ASTER AI
      </Button>

      <div className="w-full min-w-0">
        <main className="flex min-w-0 flex-col gap-2.5">
          <div className="hidden" aria-hidden="true">
            <details className="group overflow-hidden rounded-lg border bg-card">
              <summary className="flex h-10 cursor-pointer list-none items-center gap-2 px-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
                <Activity className="size-4 text-primary" />
                Resumo longitudinal
                <span className="ml-auto text-xs text-muted-foreground">
                  Abrir contexto clínico anterior
                </span>
                <ChevronRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90" />
              </summary>
              <div className="border-t p-2">
                <LongitudinalClinicalSummary
                  patientId={appointment.patient_id}
                  initialSummary={initialLongitudinalSummary}
                />
              </div>
            </details>
          </div>

          <div className="contents">
            <div className="hidden" aria-hidden="true">
              <details className="group overflow-hidden rounded-lg border bg-card">
                <summary className="flex h-10 cursor-pointer list-none items-center gap-2 px-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
                  <FileClock className="size-4 text-primary" />
                  Histórico longitudinal
                  <span className="ml-auto text-xs text-muted-foreground">
                    {history.length} consulta(s) anterior(es)
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90" />
                </summary>
                <div className="border-t p-2">
                  <Card className="border-0 shadow-none">
                    <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <FileClock className="size-5 text-primary" />{" "}
                          Histórico longitudinal
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
                              <DialogTitle>
                                Importar dados anteriores
                              </DialogTitle>
                              <DialogDescription>
                                Escolha a consulta de origem e apenas os campos
                                que deseja copiar. A evolução completa não será
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
                                    checked={selectedFields.includes(
                                      option.name,
                                    )}
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
                                      [
                                        "Queixa principal",
                                        item.chief_complaint,
                                      ],
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
              </details>
            </div>

            <div className="order-1 space-y-1.5">
              {sections.map((section, index) => (
                <ClinicalSection key={section.name}>
                  {section.name === "assessment" ? (
                    <DiagnosisEngine
                      disabled={!canEdit}
                      assessment={assessmentValue}
                      classifications={cidValue}
                      onCommit={(values) => {
                        form.setValue("assessment", values.assessment, {
                          shouldDirty: true,
                          shouldValidate: true,
                        });
                        form.setValue("cid10", values.cid10, {
                          shouldDirty: true,
                          shouldValidate: true,
                        });
                        markFieldReviewed("assessment");
                        markFieldReviewed("cid10");
                      }}
                    />
                  ) : section.name === "cid10" ? null : section.name ===
                    "plan" ? (
                    <ClinicalPlanEngine
                      appointmentId={appointment.id}
                      disabled={!canEdit}
                      legacyValues={{
                        plan: planValue,
                        exam_requests: examRequestsValue,
                        guidance: guidanceValue,
                        return_guidance: returnGuidanceValue,
                      }}
                      assessment={assessmentValue}
                      classifications={cidValue}
                      hasPrescription={Boolean(prescriptionValue.trim())}
                      examDocumentIdentity={{
                        clinicName:
                          clinicIdentity?.name ||
                          clinicIdentity?.legal_name ||
                          "ASTER CRM AI",
                        clinicLogoUrl: clinicIdentity?.logo_url,
                        patientName:
                          patient?.social_name ||
                          patient?.full_name ||
                          "Paciente",
                        patientBirthDate: patient?.birth_date,
                        patientCpf: patient?.cpf,
                        patientRecordNumber:
                          patient?.id.slice(0, 8).toUpperCase() || "—",
                        professionalName:
                          professionalProfile?.professional_name ||
                          appointment.professional?.full_name ||
                          "",
                        council: professionalProfile?.council,
                        councilNumber: professionalProfile?.council_number,
                        specialty: professionalProfile?.specialty,
                        dateTime: `${appointment.appointment_date}T${appointment.start_time}`,
                      }}
                      previousExamOrders={history
                        .filter((item) => item.exam_requests?.trim())
                        .map((item) => ({
                          date: item.appointment_date,
                          professional: item.professional_name,
                          text: item.exam_requests || "",
                        }))}
                      onCommit={(values) => {
                        (
                          [
                            "plan",
                            "exam_requests",
                            "guidance",
                            "return_guidance",
                          ] as const
                        ).forEach((field) => {
                          form.setValue(field, values[field], {
                            shouldDirty: true,
                            shouldValidate: true,
                          });
                          markFieldReviewed(field);
                        });
                      }}
                    />
                  ) : section.name === "exam_requests" ||
                    section.name === "guidance" ||
                    section.name === "return_guidance" ? null : section.name ===
                    "prescription" ? (
                    <IntelligentPrescriptionEngine
                      disabled={!canEdit}
                      currentValue={prescriptionValue}
                      initialDraft={record?.prescription_draft}
                      identity={{
                        clinic: {
                          name:
                            clinicIdentity?.name ||
                            clinicIdentity?.legal_name ||
                            "ASTER CRM AI",
                          logoUrl: clinicIdentity?.logo_url,
                          phone: clinicIdentity?.phone,
                          email: clinicIdentity?.email,
                        },
                        patient: {
                          name:
                            patient?.social_name ||
                            patient?.full_name ||
                            "Paciente não informado",
                          document: patient?.cpf,
                        },
                        prescriber: {
                          name:
                            professionalProfile?.professional_name ||
                            appointment.professional?.full_name ||
                            "Profissional não informado",
                          council: professionalProfile?.council,
                          document: professionalProfile?.council_number,
                          councilState: professionalProfile?.council_state,
                        },
                        issuedAt: appointment.appointment_date,
                        signaturePlaceholder:
                          "________________________________\nAssinatura do profissional",
                      }}
                      onCommitDraft={(value) => {
                        form.setValue("prescription", value, {
                          shouldDirty: true,
                          shouldValidate: true,
                        });
                        markFieldReviewed("prescription");
                      }}
                      onDraftChange={async (draft) => {
                        setSaveState("saving");
                        const result = await savePrescriptionDraft(
                          appointment.id,
                          draft,
                        );
                        if (result.error) {
                          setSaveState("error");
                          setSaveError(result.error);
                          return;
                        }
                        setSaveState("saved");
                        setSaveError(null);
                        setLastSavedAt(new Date().toISOString());
                      }}
                      onIssue={async (document, idempotencyKey) => {
                        form.setValue("prescription", document.medications
                          .map((item) => [
                            item.name,
                            item.concentration,
                            item.dose,
                            item.route,
                            item.frequency,
                            item.duration,
                            item.quantity,
                            item.notes,
                          ].filter(Boolean).join(" · "))
                          .join("\n"), {
                          shouldDirty: true,
                          shouldValidate: true,
                        });
                        const result = await issuePrescriptionFromMedicalRecord(
                          appointment.id,
                          form.getValues(),
                          document,
                          idempotencyKey,
                        );
                        if (!result.error) {
                          setSaveState("saved");
                          setSaveError(null);
                          setLastSavedAt(new Date().toISOString());
                          router.refresh();
                        }
                        return result;
                      }}
                    />
                  ) : (
                    <TextAreaField
                      form={form}
                      disabled={!canEdit}
                      aiPending={aiPendingFields.includes(section.name)}
                      onManualEdit={markFieldReviewed}
                      {...section}
                    />
                  )}
                  {index === 3 && (
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
                    <>
                      <details
                        data-section="clinical_scores"
                        className="group scroll-mt-6 overflow-hidden rounded-lg border bg-card"
                      >
                        <summary className="grid h-10 cursor-pointer list-none grid-cols-[18px_minmax(140px,auto)_minmax(0,1fr)_18px] items-center gap-2.5 px-3 text-left [&::-webkit-details-marker]:hidden">
                          <Calculator
                            className="size-[18px] text-primary"
                            aria-hidden="true"
                          />
                          <span className="truncate text-sm font-semibold leading-none">
                            Scores Clínicos
                          </span>
                          <span className="hidden truncate text-[13px] text-muted-foreground sm:block">
                            Selecione, calcule e registre escalas clínicas.
                          </span>
                          <ChevronRight
                            className="size-[18px] text-muted-foreground transition-transform group-open:rotate-90"
                            aria-hidden="true"
                          />
                        </summary>
                        <div className="border-t p-3">
                          <ClinicalScores
                            appointmentId={appointment.id}
                            text=""
                            age={age}
                            gender={patient?.gender ?? null}
                            getFormValues={() => form.getValues()}
                            onInsertConduct={(value) =>
                              insertScoreSummary("plan", value)
                            }
                            onInsertTimeline={insertScoreSummary}
                          />
                        </div>
                      </details>
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
                    </>
                  )}
                </ClinicalSection>
              ))}

              <details
                data-section="documents"
                className="group overflow-hidden rounded-lg border bg-card"
              >
                <summary className="grid h-10 cursor-pointer list-none grid-cols-[18px_minmax(140px,auto)_minmax(0,1fr)_18px] items-center gap-2.5 px-3 [&::-webkit-details-marker]:hidden">
                  <FileText
                    className="size-[18px] text-primary"
                    aria-hidden="true"
                  />
                  <span className="truncate text-sm font-semibold">
                    Central de Documentos
                  </span>
                  <span className="hidden truncate text-[13px] text-muted-foreground sm:block">
                    {patientDocuments.length
                      ? `${patientDocuments.length} documento(s) emitido(s)`
                      : "Nenhum documento emitido nesta consulta"}
                  </span>
                  <ChevronRight
                    className="size-[18px] text-muted-foreground transition-transform group-open:rotate-90"
                    aria-hidden="true"
                  />
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
                  aria-label="Expandir ASTER AI"
                  onClick={toggleCopilot}
                >
                  <ChevronLeft />
                </Button>
                <button
                  type="button"
                  onClick={toggleCopilot}
                  className="text-[10px] font-semibold tracking-wide text-primary [writing-mode:vertical-rl]"
                >
                  ASTER AI
                </button>
              </div>
            ) : (
              <WorkspaceSidebar>
                <div className="flex justify-end lg:hidden">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setCopilotMobileOpen(false)}
                  >
                    <X /> Fechar ASTER AI
                  </Button>
                </div>
                <ContextualClinicalPanel />
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
                    aria-label="Recolher ASTER AI"
                    onClick={toggleCopilot}
                  >
                    <ChevronRight /> Recolher painel
                  </Button>
                </div>
              </WorkspaceSidebar>
            )}
          </aside>
        </MedicalRecordCopilotPortal>
      </div>

      {timelineOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/35"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setTimelineOpen(false);
          }}
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Histórico Clínico"
            className="absolute inset-y-0 right-0 w-full max-w-xl overflow-y-auto border-l bg-background p-3 shadow-2xl"
          >
            <div className="mb-2 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">Histórico Clínico</h2>
                <p className="text-xs text-muted-foreground">
                  Histórico recolhível sem ocupar o fluxo vertical.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setTimelineOpen(false)}
              >
                <X /> Fechar
              </Button>
            </div>
            <PatientClinicalTimeline
              appointment={appointment}
              history={history}
              documents={patientDocuments}
            />
          </aside>
        </div>
      )}

    </form>
  );
}
