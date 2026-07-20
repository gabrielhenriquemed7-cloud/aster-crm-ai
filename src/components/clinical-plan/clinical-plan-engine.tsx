"use client";

import {
  Check,
  ChevronRight,
  ClipboardList,
  FilePlus2,
  FileText,
  FlaskConical,
  HeartPulse,
  ListChecks,
  Pencil,
  Pill,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
  TriangleAlert,
  UserRoundSearch,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { ClinicalPlanSection } from "@/components/clinical-plan/clinical-plan-section";
import {
  ExamOrderSection,
  type PreviousExamOrder,
} from "@/components/exam-orders/exam-order-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useClinicalPlan } from "@/hooks/use-clinical-plan";
import type { ExamOrderDocumentIdentity } from "@/lib/clinical-plan/exam-order-generator";
import type {
  ClinicalPlanItem,
  ClinicalPlanRecordFields,
  ClinicalPlanStatus,
  FollowUpPlan,
  FollowUpType,
  OrderPriority,
  Referral,
} from "@/lib/clinical-plan/types";
import { diagnosesFromRecordFields } from "@/lib/diagnosis-engine/serialization";

const priorities: Array<[OrderPriority, string]> = [
  ["routine", "Eletivo"],
  ["priority", "Prioritário"],
  ["urgent", "Urgente"],
];
const treatmentCategories: Array<
  [ClinicalPlanItem["category"], string]
> = [
  ["lifestyle", "Mudança de estilo de vida"],
  ["non_pharmacological", "Medida não farmacológica"],
  ["other", "Observação clínica"],
  ["monitoring", "Acompanhamento"],
  ["therapeutic_target", "Retorno"],
  ["non_pharmacological", "Cuidados gerais"],
  ["non_pharmacological", "Reabilitação"],
  ["non_pharmacological", "Fisioterapia"],
  ["lifestyle", "Nutrição"],
  ["lifestyle", "Atividade física"],
  ["other", "Restrição temporária"],
  ["monitoring", "Monitoramento"],
  ["other", "Outra medida"],
];
const treatmentStatuses: Array<[ClinicalPlanStatus, string]> = [
  ["planned", "Planejado"],
  ["active", "Em andamento"],
  ["completed", "Concluído"],
  ["suspended", "Suspenso"],
];
const guidanceSuggestions = [
  "Hidratação",
  "Repouso",
  "Retorno em 7 dias",
  "Procurar emergência se piorar",
];
const warningSigns = [
  "Febre persistente",
  "Falta de ar",
  "Dor intensa",
  "Sangramento",
  "Alteração da consciência",
  "Convulsões",
];
function newTreatment(): ClinicalPlanItem {
  return {
    id: crypto.randomUUID(),
    title: "",
    details: "",
    category: "proposed_treatment",
    status: "planned",
  };
}

function newReferral(): Referral {
  return {
    id: crypto.randomUUID(),
    destinationType: "Especialidade médica",
    destination: "",
    reason: "",
    clinicalSummary: "",
    priority: "routine",
    diagnosisRef: "",
    observations: "",
    status: "planned",
  };
}

export function ClinicalPlanEngine({
  appointmentId,
  disabled,
  legacyValues,
  assessment,
  classifications,
  hasPrescription,
  examDocumentIdentity,
  previousExamOrders,
  onCommit,
}: {
  appointmentId: string;
  disabled: boolean;
  legacyValues: ClinicalPlanRecordFields;
  assessment: string;
  classifications: string;
  hasPrescription: boolean;
  examDocumentIdentity: ExamOrderDocumentIdentity;
  previousExamOrders: PreviousExamOrder[];
  onCommit: (fields: ClinicalPlanRecordFields) => void;
}) {
  const engine = useClinicalPlan(appointmentId, hasPrescription);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [treatmentEditorOpen, setTreatmentEditorOpen] = useState(false);
  const [treatment, setTreatment] = useState(newTreatment);
  const [editingTreatment, setEditingTreatment] = useState(false);
  const [referralEditorOpen, setReferralEditorOpen] = useState(false);
  const [referral, setReferral] = useState(newReferral);
  const [guidanceQuery, setGuidanceQuery] = useState("");
  const [guidanceNotes, setGuidanceNotes] = useState("");
  const [warningPanelOpen, setWarningPanelOpen] = useState(false);
  const [examSuggestionOpen, setExamSuggestionOpen] = useState(false);
  const [followUp, setFollowUp] = useState<FollowUpPlan>({
    type: "as_needed",
    interval: null,
    expectedDate: "",
    reason: "",
    observations: "",
    responsible: "",
  });
  const diagnoses = useMemo(
    () => diagnosesFromRecordFields(assessment, classifications),
    [assessment, classifications],
  );
  const diagnosisOptions = diagnoses.map(
    (item) => `${item.classificationSystem} ${item.code} — ${item.description}`,
  );
  const hasLegacyContent = Object.values(legacyValues).some((value) =>
    value.trim(),
  );
  const guidanceResults = guidanceSuggestions.filter((item) =>
    item.toLocaleLowerCase("pt-BR").includes(
      guidanceQuery.trim().toLocaleLowerCase("pt-BR"),
    ),
  );

  function addGuidance(text: string, warningSign = false) {
    const value = text.trim();
    if (!value) return;
    if (
      engine.plan.patientGuidance.some(
        (item) =>
          item.text.toLocaleLowerCase("pt-BR") ===
          value.toLocaleLowerCase("pt-BR"),
      )
    )
      return toast.info("Esta orientação já foi adicionada.");
    engine.addGuidance({
      id: crypto.randomUUID(),
      category: warningSign ? "Sinal de alerta" : "Recomendação geral",
      text: value,
      warningSign,
    });
    setGuidanceQuery("");
  }

  function saveTreatment() {
    if (!treatment.title.trim())
      return toast.error("Descreva a medida terapêutica.");
    if (editingTreatment) engine.updateTreatment(treatment);
    else engine.addTreatment(treatment);
    setTreatment(newTreatment());
    setEditingTreatment(false);
  }

  function addReferral() {
    if (!referral.destination.trim())
      return toast.error("Informe a especialidade ou serviço.");
    if (!engine.addReferral(referral))
      return toast.info("Este encaminhamento já foi adicionado.");
    setReferral(newReferral());
    setReferralEditorOpen(false);
  }

  function commit() {
    if (
      hasLegacyContent &&
      !window.confirm(
        "A conduta textual atual será substituída pela versão estruturada. Deseja continuar?",
      )
    )
      return;
    onCommit(engine.recordFields());
    engine.markSaved();
    toast.success("Conduta inserida no prontuário.");
  }

  function openSection(selector: string) {
    const section = document.querySelector<HTMLDetailsElement>(selector);
    if (!section) return;
    section.open = true;
    section.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const totalItems =
    engine.plan.treatmentItems.length +
    engine.plan.examOrders.length +
    engine.plan.referrals.length +
    engine.plan.patientGuidance.length +
    engine.plan.performedProcedures.length;

  return (
    <details
      data-section="plan"
      className="group scroll-mt-28 overflow-hidden rounded-lg border bg-card"
    >
      <summary className="grid h-10 cursor-pointer list-none grid-cols-[18px_minmax(140px,auto)_minmax(0,1fr)_18px] items-center gap-2.5 px-3 [&::-webkit-details-marker]:hidden">
        <ClipboardList className="size-[18px] text-primary" />
        <span className="truncate text-sm font-semibold">Conduta</span>
        <span className="hidden truncate text-[13px] text-muted-foreground sm:block">
          {totalItems
            ? `${totalItems} decisão(ões) registrada(s)`
            : "Hub de decisões clínicas"}
        </span>
        <ChevronRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90" />
      </summary>

      <div className="space-y-2 border-t p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">Hub Clínico</h3>
            <p className="text-xs text-muted-foreground">
              Abra somente a decisão que deseja registrar.
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={allowMultiple}
              onChange={(event) => setAllowMultiple(event.target.checked)}
            />
            Permitir múltiplos módulos abertos
          </label>
        </div>

        {hasLegacyContent && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs">
            A conduta textual existente permanece preservada até a confirmação
            final.
          </div>
        )}

        <ClinicalPlanSection
          title="Plano Terapêutico"
          description="Medidas não medicamentosas e acompanhamento."
          summary={
            engine.plan.treatmentItems.length
              ? `${engine.plan.treatmentItems.length} medida(s) adicionada(s)`
              : undefined
          }
          count={engine.plan.treatmentItems.length}
          icon={HeartPulse}
          allowMultiple={allowMultiple}
        >
          {!treatmentEditorOpen && (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setTreatment(newTreatment());
                setEditingTreatment(false);
                setTreatmentEditorOpen(true);
              }}
            >
              <Plus /> Adicionar medida
            </Button>
          )}

          {treatmentEditorOpen && (
            <div className="rounded-md border p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-xs font-medium">
                  Tipo de medida
                  <Select
                    className="mt-1"
                    disabled={disabled}
                    value={treatment.category}
                    onChange={(event) =>
                      setTreatment((current) => ({
                        ...current,
                        category: event.target
                          .value as ClinicalPlanItem["category"],
                      }))
                    }
                  >
                    {treatmentCategories.map(([value, label], index) => (
                      <option key={`${value}-${index}`} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="text-xs font-medium">
                  Status
                  <Select
                    className="mt-1"
                    disabled={disabled}
                    value={treatment.status}
                    onChange={(event) =>
                      setTreatment((current) => ({
                        ...current,
                        status: event.target.value as ClinicalPlanStatus,
                      }))
                    }
                  >
                    {treatmentStatuses.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="text-xs font-medium">
                  Descrição
                  <Input
                    className="mt-1"
                    placeholder="Descreva a medida"
                    disabled={disabled}
                    value={treatment.title}
                    onChange={(event) =>
                      setTreatment((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="text-xs font-medium">
                  Prazo ou meta <span className="font-normal">(opcional)</span>
                  <Input
                    className="mt-1"
                    placeholder="Prazo, objetivo ou meta"
                    disabled={disabled}
                    value={treatment.details}
                    onChange={(event) =>
                      setTreatment((current) => ({
                        ...current,
                        details: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              <div className="mt-2 flex justify-end gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setTreatment(newTreatment());
                    setEditingTreatment(false);
                    setTreatmentEditorOpen(false);
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={disabled}
                  onClick={() => {
                    saveTreatment();
                    if (treatment.title.trim()) setTreatmentEditorOpen(false);
                  }}
                >
                  <Check /> {editingTreatment ? "Salvar" : "Adicionar"}
                </Button>
              </div>
            </div>
          )}

          <div className="mt-3 divide-y rounded-md border">
            {engine.plan.treatmentItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
              >
                <div className="min-w-0">
                  <strong className="block truncate">{item.title}</strong>
                  <span className="text-muted-foreground">
                    {treatmentCategories.find(
                      ([value]) => value === item.category,
                    )?.[1] || "Medida terapêutica"}{" "}
                    ·{" "}
                    {treatmentStatuses.find(
                      ([value]) => value === item.status,
                    )?.[1]}
                    {item.details ? ` · ${item.details}` : ""}
                  </span>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    aria-label={`Editar ${item.title}`}
                    onClick={() => {
                      setTreatment(item);
                      setEditingTreatment(true);
                      setTreatmentEditorOpen(true);
                    }}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    aria-label={`Remover ${item.title}`}
                    onClick={() => {
                      if (window.confirm(`Remover “${item.title}”?`))
                        engine.removeTreatment(item.id);
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </ClinicalPlanSection>

        <ClinicalPlanSection
          title="Exames e Procedimentos"
          description="Pesquisa rápida, favoritos, protocolos e recentes."
          summary={
            engine.plan.examOrders.length
              ? `${engine.plan.examOrders.filter((item) => item.type === "exam").length} exame(s) e ${
                  engine.plan.examOrders.filter(
                    (item) => item.type === "diagnostic_procedure",
                  ).length
                } procedimento(s)`
              : undefined
          }
          count={engine.plan.examOrders.length}
          icon={FlaskConical}
          allowMultiple={allowMultiple}
        >
          <div className="mb-2 flex flex-wrap gap-1">
            <Badge variant="outline">⭐ Favoritos</Badge>
            <Badge variant="outline">Protocolos</Badge>
            <Badge variant="outline">Solicitados recentemente</Badge>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setExamSuggestionOpen((current) => !current)}
            >
              <Sparkles /> Sugerir exames com ASTER AI
            </Button>
          </div>
          {examSuggestionOpen && (
            <div className="mb-2 rounded-md border border-primary/25 bg-primary/[0.035] p-3 text-xs">
              <strong>Revisão assistida</strong>
              <p className="mt-1 text-muted-foreground">
                As sugestões clínicas são apresentadas no painel ASTER AI com
                justificativa. Selecione individualmente o que deseja incluir;
                nenhum item será adicionado automaticamente.
              </p>
            </div>
          )}
          <ExamOrderSection
            appointmentId={appointmentId}
            disabled={disabled}
            items={engine.plan.examOrders}
            onItemsChange={engine.setExamOrders}
            onMetadataChange={engine.setExamOrderMetadata}
            diagnoses={diagnosisOptions}
            identity={examDocumentIdentity}
            previousOrders={previousExamOrders}
            onSaveToEncounter={commit}
          />
        </ClinicalPlanSection>

        <ClinicalPlanSection
          title="Encaminhamentos"
          description="Especialidade, motivo e prioridade."
          summary={engine.plan.referrals[0]?.destination}
          count={engine.plan.referrals.length}
          icon={UserRoundSearch}
          allowMultiple={allowMultiple}
        >
          {!referralEditorOpen && (
            <div className="flex flex-wrap gap-1">
              <Button
                type="button"
                size="sm"
                onClick={() => setReferralEditorOpen(true)}
              >
                <Plus /> Novo encaminhamento
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() =>
                  toast.info(
                    "O ASTER AI apresentará especialidade, motivo, prioridade e justificativa para confirmação.",
                  )
                }
              >
                <Sparkles /> Sugerir encaminhamento
              </Button>
            </div>
          )}
          {referralEditorOpen && (
            <div className="rounded-md border p-3">
              <div className="grid gap-2 sm:grid-cols-2">
            <Input
              aria-label="Especialidade"
              placeholder="Especialidade"
              disabled={disabled}
              value={referral.destination}
              onChange={(event) =>
                setReferral((current) => ({
                  ...current,
                  destination: event.target.value,
                }))
              }
            />
            <Select
              aria-label="Hipótese ou diagnóstico vinculado"
              disabled={disabled}
              value={referral.diagnosisRef}
              onChange={(event) =>
                setReferral((current) => ({
                  ...current,
                  diagnosisRef: event.target.value,
                }))
              }
            >
              <option value="">Hipótese ou diagnóstico opcional</option>
              {diagnosisOptions.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </Select>
            <Input
              aria-label="Motivo do encaminhamento"
              placeholder="Motivo"
              disabled={disabled}
              value={referral.reason}
              onChange={(event) =>
                setReferral((current) => ({
                  ...current,
                  reason: event.target.value,
                }))
              }
            />
            <Select
              aria-label="Prioridade"
              disabled={disabled}
              value={referral.priority}
              onChange={(event) =>
                setReferral((current) => ({
                  ...current,
                  priority: event.target.value as OrderPriority,
                }))
              }
            >
              {priorities.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
              </div>
              <details className="mt-2 rounded-md border">
                <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium">
                  Mais detalhes
                </summary>
                <div className="grid gap-2 border-t p-3 sm:grid-cols-2">
                  <Input
                    placeholder="Profissional ou instituição"
                    value={referral.clinicalSummary}
                    onChange={(event) =>
                      setReferral((current) => ({
                        ...current,
                        clinicalSummary: event.target.value,
                      }))
                    }
                  />
                  <Input
                    placeholder="Prazo ou observações"
                    value={referral.observations}
                    onChange={(event) =>
                      setReferral((current) => ({
                        ...current,
                        observations: event.target.value,
                      }))
                    }
                  />
                </div>
              </details>
              <div className="mt-2 flex justify-end gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setReferral(newReferral());
                    setReferralEditorOpen(false);
                  }}
                >
                  <X /> Cancelar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={disabled}
                  onClick={addReferral}
                >
                  Adicionar encaminhamento
                </Button>
              </div>
            </div>
          )}
          <div className="mt-2 divide-y rounded-md border">
            {engine.plan.referrals.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
              >
                <div className="min-w-0">
                  <strong className="block truncate">{item.destination}</strong>
                  <span className="text-muted-foreground">
                    {item.reason || "Sem motivo informado"} ·{" "}
                    {priorities.find(([value]) => value === item.priority)?.[1]}
                  </span>
                </div>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`Remover encaminhamento ${item.destination}`}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Remover encaminhamento para “${item.destination}”?`,
                      )
                    )
                      engine.removeReferral(item.id);
                  }}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
        </ClinicalPlanSection>

        <ClinicalPlanSection
          title="Orientações"
          description="Favoritas, recentes, sugestões e texto livre."
          summary={
            engine.plan.patientGuidance.length
              ? `${engine.plan.patientGuidance.length} orientação(ões)`
              : undefined
          }
          count={engine.plan.patientGuidance.length}
          icon={ListChecks}
          allowMultiple={allowMultiple}
        >
          <div className="relative">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Pesquisar orientação..."
              disabled={disabled}
              value={guidanceQuery}
              onChange={(event) => setGuidanceQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addGuidance(guidanceQuery);
                }
              }}
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {guidanceResults.map((item) => (
              <Button
                key={item}
                type="button"
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={() => addGuidance(item)}
              >
                <Check /> {item}
              </Button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-muted-foreground">
            <span>⭐ Favoritas</span>
            <span>· 🕒 Recentes</span>
            <span>· 🤖 IA sugeridas</span>
            <span>· ✍ Texto livre</span>
          </div>

          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="mt-2"
            onClick={() => setWarningPanelOpen((current) => !current)}
          >
            <TriangleAlert /> Adicionar sinais de alerta
          </Button>
          {warningPanelOpen && (
            <div className="mt-2 flex flex-wrap gap-1 rounded-md border p-2">
              {warningSigns.map((item) => (
                <Button
                  key={item}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => addGuidance(item, true)}
                >
                  {item}
                </Button>
              ))}
            </div>
          )}

          <textarea
            rows={2}
            value={guidanceNotes}
            onChange={(event) => setGuidanceNotes(event.target.value)}
            placeholder="Texto complementar opcional"
            className="mt-2 w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {guidanceNotes.trim() && (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                addGuidance(guidanceNotes);
                setGuidanceNotes("");
              }}
            >
              <Plus /> Adicionar texto
            </Button>
          )}

          <div className="mt-2 flex flex-wrap gap-1">
            {engine.plan.patientGuidance.map((item) => (
              <Badge key={item.id} variant="outline" className="gap-1">
                {item.warningSign && <TriangleAlert className="size-3" />}
                {item.text}
                <button
                  type="button"
                  aria-label={`Remover orientação ${item.text}`}
                  onClick={() => engine.removeGuidance(item.id)}
                >
                  <Trash2 className="size-3" />
                </button>
              </Badge>
            ))}
          </div>

          <details className="mt-3 rounded-md border">
            <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium">
              Retorno e seguimento
            </summary>
            <div className="grid gap-2 border-t p-3 sm:grid-cols-3">
              <Select
                aria-label="Tipo de retorno"
                value={followUp.type}
                onChange={(event) =>
                  setFollowUp((current) => ({
                    ...current,
                    type: event.target.value as FollowUpType,
                  }))
                }
              >
                <option value="as_needed">Conforme necessidade</option>
                <option value="days">Em dias</option>
                <option value="weeks">Em semanas</option>
                <option value="specific_date">Data específica</option>
                <option value="after_results">Após exames</option>
              </Select>
              <Input
                type="number"
                min={1}
                placeholder="Prazo"
                value={followUp.interval ?? ""}
                onChange={(event) =>
                  setFollowUp((current) => ({
                    ...current,
                    interval: event.target.value
                      ? Number(event.target.value)
                      : null,
                  }))
                }
              />
              <Button
                type="button"
                onClick={() => engine.setFollowUp(followUp)}
              >
                <Check /> Definir retorno
              </Button>
            </div>
          </details>
        </ClinicalPlanSection>

        <ClinicalPlanSection
          title="Documentos"
          description="Receitas, atestados, declarações, solicitações e relatórios."
          summary={hasPrescription ? "Prescrição vinculada" : undefined}
          count={hasPrescription ? 1 : 0}
          icon={FileText}
          allowMultiple={allowMultiple}
        >
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {[
              ["Receitas", Pill],
              ["Atestados", FileText],
              ["Declarações", FileText],
              ["Solicitações", FlaskConical],
              ["Relatórios", ClipboardList],
            ].map(([label, Icon]) => (
              <Button
                key={label as string}
                type="button"
                variant="outline"
                className="justify-start"
                onClick={() =>
                  label === "Receitas"
                    ? openSection('[data-section="prescription"]')
                    : openSection('[data-section="documents"]')
                }
              >
                <Icon /> {label as string}
              </Button>
            ))}
          </div>
        </ClinicalPlanSection>

        <details className="group rounded-lg border bg-background">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-medium [&::-webkit-details-marker]:hidden">
            <FilePlus2 className="size-4 text-primary" />
            Pré-visualização da Conduta
            <ChevronRight className="ml-auto size-4 transition-transform group-open:rotate-90" />
          </summary>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap border-t p-3 font-sans text-xs leading-5">
            {engine.preview || "Nenhuma decisão registrada."}
          </pre>
        </details>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-2">
          <span className="mr-auto text-xs text-muted-foreground">
            {engine.dirty
              ? "Alterações aguardando confirmação."
              : "Conduta sincronizada."}
          </span>
          <Button
            type="button"
            disabled={disabled || !engine.dirty || !engine.preview}
            onClick={commit}
          >
            <Save /> Inserir conduta no prontuário
          </Button>
        </div>
      </div>
    </details>
  );
}
