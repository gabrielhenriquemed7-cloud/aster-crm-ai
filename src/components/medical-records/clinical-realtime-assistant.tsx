"use client";

import {
  AlertTriangle,
  Activity,
  Bot,
  ChevronDown,
  ChevronUp,
  CirclePause,
  CirclePlay,
  Eraser,
  Files,
  Loader2,
  MessageCircle,
  Pin,
  PinOff,
  Pill,
  RefreshCw,
} from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { analyzeClinicalContextIncrement } from "@/app/(dashboard)/consultas/clinical-realtime-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClinicalChat } from "@/components/medical-records/clinical-chat";
import { ClinicalTimeline } from "@/components/medical-records/clinical-timeline";
import { IntelligentPrescription } from "@/components/medical-records/intelligent-prescription";
import type { ClinicalAiSuggestion } from "@/lib/ai/clinical-schema";
import type { RealtimeClinicalAnalysis } from "@/lib/ai/clinical-realtime-schema";
import type { ClinicalTimelineEvent } from "@/lib/ai/clinical-timeline-schema";
import {
  buildClinicalContext,
  getDocumentationPendingItems,
  hasSufficientClinicalContext,
} from "@/lib/ai/clinical-context";
import type { MedicalRecordFormValues } from "@/lib/medical-records/schema";

const UPDATE_INTERVAL_MS = 20_000;
const SENTENCE_DEBOUNCE_MS = 2_000;
const copilotTabs = [
  "assistance",
  "chat",
  "prescription",
  "timeline",
  "documents",
] as const;
type CopilotTab = (typeof copilotTabs)[number];

function copilotTabLabel(tab: CopilotTab) {
  return tab === "assistance"
    ? "Assistência"
    : tab === "chat"
      ? "Chat Clínico"
      : tab === "prescription"
        ? "Prescrição IA"
        : tab === "timeline"
          ? "Timeline"
          : "Documentos";
}

function copilotTabIcon(tab: CopilotTab) {
  return tab === "assistance" ? (
    <Activity />
  ) : tab === "chat" ? (
    <MessageCircle />
  ) : tab === "prescription" ? (
    <Pill />
  ) : tab === "timeline" ? (
    <RefreshCw />
  ) : (
    <Files />
  );
}

const emptyAnalysis: RealtimeClinicalAnalysis = {
  alerts: [],
  hypotheses: [],
  missingQuestions: [],
  physicalExamSuggestions: [],
  testSuggestions: [],
  importantPatientData: [],
  possibleProtocols: [],
  contradictions: [],
  summary: "",
  updatedAt: "",
};

type QuestionState = "pendente" | "perguntada" | "respondida" | "não aplicável";
type ExamState = "pendente" | "realizado" | "não realizado" | "não aplicável";
type HypothesisState = "visível" | "oculta" | "descartada";

function fingerprint(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function CardShell({
  id,
  title,
  critical,
  pinned,
  onPin,
  children,
}: {
  id: string;
  title: string;
  critical?: boolean;
  pinned: boolean;
  onPin: () => void;
  children: React.ReactNode;
}) {
  return (
    <details
      open={critical || pinned || undefined}
      className={
        critical
          ? "rounded-xl border border-destructive/40 bg-destructive/5"
          : "rounded-xl border bg-background"
      }
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-3 text-sm font-semibold">
        <span>{title}</span>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          aria-label={pinned ? `Desafixar ${title}` : `Fixar ${title}`}
          onClick={(event) => {
            event.preventDefault();
            onPin();
          }}
        >
          {pinned ? <PinOff /> : <Pin />}
        </Button>
      </summary>
      <div id={id} className="space-y-3 border-t p-3">
        {children}
      </div>
    </details>
  );
}

export function ClinicalRealtimeAssistant({
  appointmentId,
  text,
  enabled,
  getFormValues,
  clinicalSuggestion,
  onInsertPrescription,
  onInsertExamRequests,
  onRecordPhysicalFinding,
  documents,
  onInsertTimeline,
  patientAge,
  patientGender,
  onTabChange,
}: {
  appointmentId: string;
  text: string;
  enabled: boolean;
  getFormValues: () => MedicalRecordFormValues;
  clinicalSuggestion: ClinicalAiSuggestion | null;
  onInsertPrescription: (value: string) => void;
  onInsertExamRequests: (value: string) => void;
  onRecordPhysicalFinding: (value: string) => void;
  documents: ReactNode;
  onInsertTimeline: (
    field: keyof MedicalRecordFormValues,
    value: string,
  ) => void;
  patientAge: number | null;
  patientGender: string | null;
  onTabChange: (tab: CopilotTab) => void;
}) {
  const [analysis, setAnalysis] =
    useState<RealtimeClinicalAnalysis>(emptyAnalysis);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<CopilotTab>("assistance");
  const [timelineEvents, setTimelineEvents] = useState<ClinicalTimelineEvent[]>(
    [],
  );
  const [paused, setPaused] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [pinnedCards, setPinnedCards] = useState<string[]>([]);
  const [questionStates, setQuestionStates] = useState<
    Record<string, QuestionState>
  >({});
  const [examStates, setExamStates] = useState<Record<string, ExamState>>({});
  const [examFindings, setExamFindings] = useState<Record<string, string>>({});
  const [hypothesisStates, setHypothesisStates] = useState<
    Record<string, HypothesisState>
  >({});
  const [pinnedHypotheses, setPinnedHypotheses] = useState<string[]>([]);
  const [openProtocols, setOpenProtocols] = useState<string[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [analyzedFingerprint, setAnalyzedFingerprint] = useState("");
  const lastSentTextRef = useRef("");
  const lastFingerprintRef = useRef("");
  const latestFingerprintRef = useRef("");
  const pendingSinceRef = useRef<number | null>(null);
  const requestSequenceRef = useRef(0);
  const loadingRef = useRef(false);

  useEffect(() => {
    const openPrescriptionAi = () => {
      setCollapsed(false);
      setTab("prescription");
      onTabChange("prescription");
    };
    window.addEventListener(
      "aster:open-prescription-ai",
      openPrescriptionAi,
    );
    return () =>
      window.removeEventListener(
        "aster:open-prescription-ai",
        openPrescriptionAi,
      );
  }, [onTabChange]);

  const currentContext = useCallback(() => {
    const values = getFormValues();
    const clinicalContext = buildClinicalContext({
      values,
      transcription: text,
      patientAge,
      patientGender,
    });
    return {
      values,
      clinicalContext,
      serialized: JSON.stringify({
        ...clinicalContext,
        lastUpdatedAt: undefined,
      }),
    };
  }, [getFormValues, patientAge, patientGender, text]);

  const update = useCallback(
    async (force = false) => {
      if (!enabled || loadingRef.current) return;
      const context = currentContext();
      if (!hasSufficientClinicalContext(context.clinicalContext)) return;
      const contextFingerprint = fingerprint(context.serialized);
      latestFingerprintRef.current = contextFingerprint;
      if (!force && contextFingerprint === lastFingerprintRef.current) return;
      const currentText = text.trim();
      if (!currentText && !context.serialized.replace(/[{}"\s:]/g, "")) return;
      const delta = currentText.startsWith(lastSentTextRef.current)
        ? currentText.slice(lastSentTextRef.current.length).trim()
        : currentText;
      const sequence = requestSequenceRef.current + 1;
      requestSequenceRef.current = sequence;
      loadingRef.current = true;
      setLoading(true);
      setError("");
      lastFingerprintRef.current = contextFingerprint;
      lastSentTextRef.current = currentText;
      pendingSinceRef.current = null;
      const result = await analyzeClinicalContextIncrement({
        appointmentId,
        delta: delta || "Atualização dos dados do prontuário atual.",
        previous: analysis,
        currentRecord: {
          chiefComplaint: context.values.chief_complaint || "",
          hpi: context.values.hpi || "",
          history: [
            context.values.pmh,
            context.values.family_history,
            context.values.social_history,
          ]
            .filter(Boolean)
            .join("\n"),
          allergies: context.values.allergies || "",
          medications: context.values.medications || "",
          vitalSigns: context.values.vital_signs || "",
          physicalExam: context.values.physical_exam || "",
        },
        professionalContext: {
          answeredQuestions: Object.entries(questionStates)
            .filter(([, state]) => state === "respondida")
            .map(([id]) => id),
          discardedHypotheses: Object.entries(hypothesisStates)
            .filter(([, state]) => state === "descartada")
            .map(([id]) => id),
        },
      });
      loadingRef.current = false;
      setLoading(false);
      const latest = fingerprint(currentContext().serialized);
      latestFingerprintRef.current = latest;
      if (
        sequence !== requestSequenceRef.current ||
        latest !== contextFingerprint
      )
        return;
      if (result.error || !result.analysis) {
        setError(result.error || "Não foi possível atualizar o Copilot.");
        return;
      }
      setAnalysis(result.analysis);
      setLastUpdated(new Date().toISOString());
      setAnalyzedFingerprint(contextFingerprint);
    },
    [
      analysis,
      appointmentId,
      currentContext,
      enabled,
      hypothesisStates,
      questionStates,
      text,
    ],
  );

  useEffect(() => {
    if (!enabled || paused || loading) return;
    const context = currentContext();
    const nextFingerprint = fingerprint(context.serialized);
    latestFingerprintRef.current = nextFingerprint;
    if (nextFingerprint === lastFingerprintRef.current) return;
    if (!hasSufficientClinicalContext(context.clinicalContext)) return;
    const now = Date.now();
    pendingSinceRef.current ??= now;
    const hasNewSentence = /[.!?]\s*$/.test(text.trim());
    const delay = hasNewSentence
      ? SENTENCE_DEBOUNCE_MS
      : Math.max(250, UPDATE_INTERVAL_MS - (now - pendingSinceRef.current));
    const timer = window.setTimeout(() => void update(), delay);
    return () => window.clearTimeout(timer);
  }, [currentContext, enabled, loading, paused, text, update]);

  const pinCard = (id: string) =>
    setPinnedCards((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  const isPinned = (id: string) => pinnedCards.includes(id);
  const visibleHypotheses = analysis.hypotheses.filter(
    (item) => hypothesisStates[item.id] !== "oculta",
  );
  const hasContent =
    analysis.alerts.length ||
    visibleHypotheses.length ||
    analysis.missingQuestions.length ||
    analysis.physicalExamSuggestions.length ||
    analysis.testSuggestions.length ||
    analysis.importantPatientData.length ||
    analysis.possibleProtocols.length ||
    analysis.contradictions.length;
  const context = currentContext();
  const hasSufficientContext = hasSufficientClinicalContext(
    context.clinicalContext,
  );
  const stale = Boolean(
    lastUpdated && fingerprint(context.serialized) !== analyzedFingerprint,
  );
  const documentationPendingItems = getDocumentationPendingItems(
    context.values,
  );

  return (
    <aside className="w-full min-w-0 max-w-full space-y-4 overflow-x-hidden rounded-xl border border-primary/25 bg-card p-3 shadow-sm sm:p-4">
      <div className="flex items-center justify-between gap-2 border-b pb-3">
        <div className="flex items-center gap-2">
          <Bot className="size-5 text-primary" />
          <h3 className="font-semibold">ASTER COPILOT</h3>
        </div>
        <div className="flex gap-1">
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label={collapsed ? "Expandir conteúdo" : "Recolher painel"}
            onClick={() => setCollapsed((value) => !value)}
          >
            {collapsed ? <ChevronDown /> : <ChevronUp />}
          </Button>
        </div>
      </div>
      {!collapsed && (
        <>
          <div
            className="grid w-full grid-cols-3 gap-1 overflow-hidden rounded-lg bg-muted p-1"
            role="tablist"
            aria-label="Recursos do ASTER Copilot"
          >
            {copilotTabs.map((item) => (
              <Button
                key={item}
                type="button"
                size="xs"
                className="min-h-8 min-w-0 justify-start overflow-hidden px-1.5 text-[11px] whitespace-nowrap [&_svg]:size-3.5"
                role="tab"
                aria-selected={tab === item}
                data-copilot-tab={item}
                variant={tab === item ? "secondary" : "ghost"}
                onClick={() => {
                  setTab(item);
                  onTabChange(item);
                }}
              >
                {copilotTabIcon(item)}
                {copilotTabLabel(item)}
              </Button>
            ))}
          </div>
          {tab === "assistance" ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={loading}
                  onClick={() => setPaused((value) => !value)}
                >
                  {paused ? <CirclePlay /> : <CirclePause />}{" "}
                  {paused
                    ? "Retomar assistência"
                    : "Pausar assistência automática"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={loading || !hasSufficientContext}
                  onClick={() => void update(true)}
                >
                  <RefreshCw /> Atualizar agora
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!hasContent}
                  onClick={() => {
                    setAnalysis(emptyAnalysis);
                    setError("");
                    setAnalyzedFingerprint("");
                  }}
                >
                  <Eraser /> Limpar sugestões
                </Button>
              </div>
              {paused && (
                <p className="text-sm text-amber-700">
                  Assistência automática pausada. A gravação continua
                  normalmente.
                </p>
              )}
              {stale && (
                <p className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-sm text-amber-700">
                  Pode estar desatualizado. Atualize agora ou mantenha as
                  sugestões atuais.
                </p>
              )}
              {loading && (
                <p
                  role="status"
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <Loader2 className="size-4 animate-spin" /> Analisando novas
                  informações...
                </p>
              )}
              {lastUpdated && (
                <p className="text-xs text-muted-foreground">
                  Última atualização:{" "}
                  {new Date(lastUpdated).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </p>
              )}
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              {!hasSufficientContext && !loading && (
                <p className="text-sm text-muted-foreground">
                  O acompanhamento começará quando houver contexto clínico
                  suficiente.
                </p>
              )}
              {hasSufficientContext && !hasContent && !loading && !error && (
                <p className="text-sm text-muted-foreground">
                  Sem novas sugestões para o contexto atual.
                </p>
              )}

              {analysis.alerts.length > 0 && (
                <CardShell
                  id="realtime-alerts"
                  title="Alertas e sinais de gravidade"
                  critical
                  pinned={isPinned("alerts")}
                  onPin={() => pinCard("alerts")}
                >
                  {analysis.alerts.map((item) => (
                    <article
                      key={item.id}
                      className="rounded-lg border border-destructive/30 p-3 text-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <strong className="text-destructive">
                          {item.title}
                        </strong>
                        <Badge variant="destructive">{item.level}</Badge>
                      </div>
                      <p className="mt-2">
                        <strong>Evidência:</strong> {item.evidence}
                      </p>
                      <p className="mt-1">
                        <strong>Confirmar:</strong>{" "}
                        {item.confirmationNeeded.join("; ")}
                      </p>
                      <p className="mt-1">
                        <strong>Avaliação sugerida:</strong>{" "}
                        {item.suggestedAssessment}
                      </p>
                    </article>
                  ))}
                  <p className="text-xs font-medium text-destructive">
                    Alerta de apoio. Avalie imediatamente conforme o contexto
                    clínico.
                  </p>
                </CardShell>
              )}

              {visibleHypotheses.length > 0 && (
                <CardShell
                  id="realtime-hypotheses"
                  title="Hipóteses clínicas"
                  pinned={isPinned("hypotheses")}
                  onPin={() => pinCard("hypotheses")}
                >
                  {visibleHypotheses.map((item) => (
                    <article
                      key={item.id}
                      className={
                        hypothesisStates[item.id] === "descartada"
                          ? "rounded-lg border p-3 text-sm opacity-50"
                          : "rounded-lg border p-3 text-sm"
                      }
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <strong>{item.name}</strong>
                        <div className="flex gap-1">
                          <Badge variant="outline">{item.compatibility}</Badge>
                          <Badge variant="secondary">{item.situation}</Badge>
                        </div>
                      </div>
                      <p className="mt-2">
                        <strong>Favoráveis:</strong>{" "}
                        {item.favorableArguments.join("; ") || "Não informados"}
                      </p>
                      <p>
                        <strong>Contrários:</strong>{" "}
                        {item.contraryArguments.join("; ") || "Não informados"}
                      </p>
                      <p>
                        <strong>Faltantes:</strong>{" "}
                        {item.missingData.join("; ") || "Nenhum listado"}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          onClick={() =>
                            setPinnedHypotheses((current) =>
                              current.includes(item.id)
                                ? current.filter((id) => id !== item.id)
                                : [...current, item.id],
                            )
                          }
                        >
                          {pinnedHypotheses.includes(item.id) ? (
                            <PinOff />
                          ) : (
                            <Pin />
                          )}{" "}
                          {pinnedHypotheses.includes(item.id)
                            ? "Desafixar"
                            : "Fixar"}
                        </Button>
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          onClick={() =>
                            setHypothesisStates((current) => ({
                              ...current,
                              [item.id]: "oculta",
                            }))
                          }
                        >
                          Ocultar
                        </Button>
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          onClick={() =>
                            setHypothesisStates((current) => ({
                              ...current,
                              [item.id]: "descartada",
                            }))
                          }
                        >
                          Marcar descartada
                        </Button>
                        <Button
                          type="button"
                          size="xs"
                          variant="ghost"
                          onClick={() => {
                            setTab("chat");
                            onTabChange("chat");
                            window.setTimeout(
                              () =>
                                window.dispatchEvent(
                                  new CustomEvent("aster:chat-question", {
                                    detail: `Explique por que ${item.name} permanece como hipótese e quais dados podem confirmá-la ou afastá-la.`,
                                  }),
                                ),
                              0,
                            );
                          }}
                        >
                          <MessageCircle /> Abrir explicação no Chat
                        </Button>
                      </div>
                    </article>
                  ))}
                  <p className="text-xs text-amber-700">
                    Necessita correlação clínica.
                  </p>
                </CardShell>
              )}

              {analysis.missingQuestions.length > 0 && (
                <CardShell
                  id="realtime-questions"
                  title="Perguntas ainda necessárias"
                  pinned={isPinned("questions")}
                  onPin={() => pinCard("questions")}
                >
                  {analysis.missingQuestions.map((item) => (
                    <article
                      key={item.id}
                      className="rounded-lg border p-3 text-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <strong>{item.question}</strong>
                        <Badge variant="outline">{item.priority}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {item.category} · {item.reason}
                      </p>
                      <select
                        className="mt-2 rounded-md border bg-background px-2 py-1 text-xs"
                        value={questionStates[item.id] || "pendente"}
                        onChange={(event) =>
                          setQuestionStates((current) => ({
                            ...current,
                            [item.id]: event.target.value as QuestionState,
                          }))
                        }
                      >
                        <option>pendente</option>
                        <option>perguntada</option>
                        <option>respondida</option>
                        <option>não aplicável</option>
                      </select>
                    </article>
                  ))}
                </CardShell>
              )}

              {analysis.physicalExamSuggestions.length > 0 && (
                <CardShell
                  id="realtime-physical"
                  title="Exame físico sugerido"
                  pinned={isPinned("physical")}
                  onPin={() => pinCard("physical")}
                >
                  {analysis.physicalExamSuggestions.map((item) => (
                    <article
                      key={item.id}
                      className="rounded-lg border p-3 text-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <strong>{item.systemOrManeuver}</strong>
                        <Badge variant="outline">{item.priority}</Badge>
                      </div>
                      <p>{item.purpose}</p>
                      <p className="text-xs text-muted-foreground">
                        Relacionada a:{" "}
                        {item.relatedHypothesis || "contexto geral"}
                      </p>
                      <select
                        className="mt-2 rounded-md border bg-background px-2 py-1 text-xs"
                        value={examStates[item.id] || "pendente"}
                        onChange={(event) =>
                          setExamStates((current) => ({
                            ...current,
                            [item.id]: event.target.value as ExamState,
                          }))
                        }
                      >
                        <option>pendente</option>
                        <option>realizado</option>
                        <option>não realizado</option>
                        <option>não aplicável</option>
                      </select>
                      {examStates[item.id] === "realizado" && (
                        <div className="mt-2 space-y-2">
                          <textarea
                            rows={2}
                            value={examFindings[item.id] || ""}
                            onChange={(event) =>
                              setExamFindings((current) => ({
                                ...current,
                                [item.id]: event.target.value,
                              }))
                            }
                            placeholder="Registre brevemente o achado observado"
                            className="w-full rounded-md border bg-background p-2 text-sm"
                          />
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            disabled={!examFindings[item.id]?.trim()}
                            onClick={() =>
                              onRecordPhysicalFinding(
                                `${item.systemOrManeuver}: ${examFindings[item.id]}`,
                              )
                            }
                          >
                            Levar achado ao exame físico
                          </Button>
                        </div>
                      )}
                    </article>
                  ))}
                </CardShell>
              )}

              {analysis.testSuggestions.length > 0 && (
                <CardShell
                  id="realtime-tests"
                  title="Exames complementares a considerar"
                  pinned={isPinned("tests")}
                  onPin={() => pinCard("tests")}
                >
                  {analysis.testSuggestions.map((item) => (
                    <article
                      key={item.id}
                      className="rounded-lg border p-3 text-sm"
                    >
                      <div className="flex justify-between gap-2">
                        <strong>{item.name}</strong>
                        <Badge variant="outline">{item.priority}</Badge>
                      </div>
                      <p>{item.purpose}</p>
                      <p>
                        <strong>Condição:</strong> {item.indicationCondition}
                      </p>
                      {item.reasonNotToRequest && (
                        <p>
                          <strong>Não solicitar se:</strong>{" "}
                          {item.reasonNotToRequest}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Hipótese: {item.relatedHypothesis}
                      </p>
                    </article>
                  ))}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      onInsertExamRequests(
                        analysis.testSuggestions
                          .map(
                            (item) =>
                              `${item.name} — ${item.purpose} (${item.priority})`,
                          )
                          .join("\n"),
                      )
                    }
                  >
                    Levar para solicitação de exames
                  </Button>
                </CardShell>
              )}

              {analysis.importantPatientData.length > 0 && (
                <CardShell
                  id="realtime-data"
                  title="Dados importantes do paciente"
                  pinned={isPinned("data")}
                  onPin={() => pinCard("data")}
                >
                  {analysis.importantPatientData.map((item) => (
                    <article
                      key={item.id}
                      className={
                        item.divergence
                          ? "rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm"
                          : "rounded-lg border p-3 text-sm"
                      }
                    >
                      <strong>{item.label}:</strong> {item.value}
                      <p className="text-xs text-muted-foreground">
                        Fonte: {item.source}
                      </p>
                      {item.divergence && (
                        <p className="mt-1 text-amber-700">
                          <AlertTriangle className="mr-1 inline size-3" />
                          {item.divergence}
                        </p>
                      )}
                    </article>
                  ))}
                </CardShell>
              )}

              {analysis.possibleProtocols.length > 0 && (
                <CardShell
                  id="realtime-protocols"
                  title="Protocolos potencialmente aplicáveis"
                  pinned={isPinned("protocols")}
                  onPin={() => pinCard("protocols")}
                >
                  {analysis.possibleProtocols.map((item) => (
                    <article
                      key={item.id}
                      className="rounded-lg border p-3 text-sm"
                    >
                      <strong>{item.name}</strong>
                      <p>{item.relevance}</p>
                      <p>
                        <strong>Presentes:</strong>{" "}
                        {item.presentCriteria.join("; ")}
                      </p>
                      <p>
                        <strong>Verificar:</strong>{" "}
                        {item.criteriaToVerify.join("; ")}
                      </p>
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        className="mt-2"
                        onClick={() =>
                          setOpenProtocols((current) =>
                            current.includes(item.id)
                              ? current.filter((id) => id !== item.id)
                              : [...current, item.id],
                          )
                        }
                      >
                        Abrir checklist
                      </Button>
                      {openProtocols.includes(item.id) && (
                        <ul className="mt-2 space-y-1">
                          {item.checklist.map((entry) => (
                            <li key={entry}>□ {entry}</li>
                          ))}
                        </ul>
                      )}
                    </article>
                  ))}
                  <p className="text-xs text-muted-foreground">
                    Checklist assistencial. Não substitui a avaliação
                    profissional.
                  </p>
                </CardShell>
              )}

              {analysis.contradictions.length > 0 && (
                <CardShell
                  id="realtime-contradictions"
                  title="Informações contraditórias ou ausentes"
                  pinned={isPinned("contradictions")}
                  onPin={() => pinCard("contradictions")}
                >
                  {analysis.contradictions.map((item) => (
                    <article
                      key={item.id}
                      className="rounded-lg border border-amber-500/30 p-3 text-sm"
                    >
                      <p>{item.description}</p>
                      <p className="text-xs text-muted-foreground">
                        Fontes: {item.sources.join("; ")}
                      </p>
                    </article>
                  ))}
                </CardShell>
              )}
              {documentationPendingItems.length > 0 && (
                <CardShell
                  id="realtime-documentation-pending"
                  title="Pendências do prontuário"
                  pinned={isPinned("documentation-pending")}
                  onPin={() => pinCard("documentation-pending")}
                >
                  <ul className="space-y-2 text-sm">
                    {documentationPendingItems.map((item) => (
                      <li key={item}>• {item}</li>
                    ))}
                  </ul>
                </CardShell>
              )}
              {analysis.summary && (
                <p className="rounded-lg bg-muted/50 p-3 text-sm">
                  {analysis.summary}
                </p>
              )}
              <p className="border-t pt-3 text-xs font-medium text-muted-foreground">
                Assistência gerada por IA. Requer avaliação e validação
                profissional.
              </p>
            </div>
          ) : tab === "chat" ? (
            <ClinicalChat
              appointmentId={appointmentId}
              clinicalText={text}
              assistance={analysis}
              timelineEvents={timelineEvents}
            />
          ) : tab === "prescription" ? (
            <IntelligentPrescription
              appointmentId={appointmentId}
              getFormValues={getFormValues}
              assistance={analysis}
              clinicalSuggestion={clinicalSuggestion}
              onInsert={onInsertPrescription}
              patientAge={patientAge}
            />
          ) : tab === "timeline" ? (
            <ClinicalTimeline
              appointmentId={appointmentId}
              text={text}
              analysis={analysis}
              getFormValues={getFormValues}
              onInsert={onInsertTimeline}
              onEventsChange={setTimelineEvents}
            />
          ) : (
            documents
          )}
        </>
      )}
      <p className="border-t pt-3 text-xs font-medium text-muted-foreground">
        Conteúdo gerado por IA. Requer avaliação e validação profissional.
      </p>
    </aside>
  );
}
