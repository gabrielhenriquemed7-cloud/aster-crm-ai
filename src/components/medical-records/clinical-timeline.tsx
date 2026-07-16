"use client";

import {
  Eye,
  EyeOff,
  Loader2,
  Pause,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { extractClinicalTimeline } from "@/app/(dashboard)/consultas/clinical-timeline-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { RealtimeClinicalAnalysis } from "@/lib/ai/clinical-realtime-schema";
import {
  timelineEventTypes,
  type ClinicalTimelineEvent,
} from "@/lib/ai/clinical-timeline-schema";
import type { MedicalRecordFormValues } from "@/lib/medical-records/schema";

type TimelineItem = ClinicalTimelineEvent & {
  id: string;
  pinned: boolean;
  hidden: boolean;
  reviewed: boolean;
  manual: boolean;
};

const labels: Record<ClinicalTimelineEvent["type"], string> = {
  symptom: "Sintoma",
  relevant_denial: "Negação relevante",
  history: "Antecedente",
  allergy: "Alergia",
  medication: "Medicamento",
  vital_sign: "Sinal vital",
  physical_exam: "Exame físico",
  hypothesis_added: "Hipótese adicionada",
  hypothesis_changed: "Hipótese alterada",
  hypothesis_removed: "Hipótese removida",
  clinical_alert: "Alerta clínico",
  question_answered: "Pergunta respondida",
  professional_decision: "Decisão profissional",
};

function normalized(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function fingerprint(event: ClinicalTimelineEvent) {
  return `${event.type}:${normalized(event.content)}:${event.sourceType}`;
}

function clock(ms: number) {
  const total = Math.floor(ms / 1000);
  return [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

export function ClinicalTimeline({
  appointmentId,
  text,
  analysis,
  getFormValues,
  onInsert,
  onEventsChange,
}: {
  appointmentId: string;
  text: string;
  analysis: RealtimeClinicalAnalysis;
  getFormValues: () => MedicalRecordFormValues;
  onInsert: (field: keyof MedicalRecordFormValues, value: string) => void;
  onEventsChange: (events: ClinicalTimelineEvent[]) => void;
}) {
  const [startedAt] = useState(() => Date.now());
  const previousHypotheses = useRef(new Map<string, string>());
  const previousAlerts = useRef(new Set<string>());
  const lastHash = useRef("");
  const requestId = useRef(0);
  const [events, setEvents] = useState<TimelineItem[]>(() => {
    if (typeof window === "undefined") return [];
    const stored = window.localStorage.getItem(
      `aster:timeline:${appointmentId}`,
    );
    try {
      return stored ? (JSON.parse(stored) as TimelineItem[]) : [];
    } catch {
      return [];
    }
  });
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [onlyPinned, setOnlyPinned] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [manualContent, setManualContent] = useState("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const mergeEvents = useCallback((incoming: ClinicalTimelineEvent[]) => {
    setEvents((current) => {
      const known = new Set(current.map(fingerprint));
      const additions = incoming
        .filter((event) => !known.has(fingerprint(event)))
        .map((event) => ({
          ...event,
          id: crypto.randomUUID(),
          pinned: false,
          hidden: false,
          reviewed: false,
          manual: false,
        }));
      return [...current, ...additions].sort(
        (left, right) => left.relativeTimeMs - right.relativeTimeMs,
      );
    });
  }, []);

  const update = useCallback(async () => {
    if (paused || loading) return;
    const values = getFormValues();
    const context = text.trim() || JSON.stringify({ record: values });
    const hash = normalized(context);
    if (!hash || hash === lastHash.current) return;
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError("");
    const result = await extractClinicalTimeline({
      appointmentId,
      context,
      relativeTimeMs: Date.now() - startedAt,
      knownFingerprints: events.map(fingerprint),
    });
    if (currentRequest !== requestId.current) return;
    setLoading(false);
    if (result.error) return setError(result.error);
    lastHash.current = hash;
    mergeEvents(result.events ?? []);
    setLastUpdated(new Date().toISOString());
  }, [
    appointmentId,
    events,
    getFormValues,
    loading,
    mergeEvents,
    paused,
    startedAt,
    text,
  ]);

  useEffect(() => {
    if (paused) return;
    const timer = window.setTimeout(() => void update(), 20_000);
    return () => window.clearTimeout(timer);
  }, [paused, text, analysis.updatedAt, update]);

  useEffect(() => {
    const previous = previousHypotheses.current;
    const current = new Map(
      analysis.hypotheses.map((item) => [
        item.id || normalized(item.name),
        item.compatibility,
      ]),
    );
    const now = Date.now() - startedAt;
    const changes: ClinicalTimelineEvent[] = [];
    for (const item of analysis.hypotheses) {
      const key = item.id || normalized(item.name);
      const old = previous.get(key);
      if (!old)
        changes.push({
          type: "hypothesis_added",
          title: item.name,
          content: `Compatibilidade ${item.compatibility.toLowerCase()}.`,
          sourceType: "copilot",
          sourceStart: null,
          sourceEnd: null,
          relativeTimeMs: now,
          confidence: "moderate",
          clinicalRelevance: item.favorableArguments.join("; "),
          relatedHypothesis: item.name,
        });
      else if (old !== item.compatibility)
        changes.push({
          type: "hypothesis_changed",
          title: item.name,
          content: `${old} → ${item.compatibility}`,
          sourceType: "copilot",
          sourceStart: null,
          sourceEnd: null,
          relativeTimeMs: now,
          confidence: "moderate",
          clinicalRelevance:
            item.contraryArguments.join("; ") ||
            item.favorableArguments.join("; "),
          relatedHypothesis: item.name,
        });
    }
    for (const [key, compatibility] of previous)
      if (!current.has(key))
        changes.push({
          type: "hypothesis_removed",
          title: key,
          content: `Hipótese removida (antes ${compatibility}).`,
          sourceType: "copilot",
          sourceStart: null,
          sourceEnd: null,
          relativeTimeMs: now,
          confidence: "moderate",
          clinicalRelevance: "Mudança no painel de hipóteses.",
          relatedHypothesis: key,
        });
    previousHypotheses.current = current;
    if (changes.length) queueMicrotask(() => mergeEvents(changes));
  }, [analysis.hypotheses, mergeEvents, startedAt]);

  useEffect(() => {
    const current = new Set(analysis.alerts.map((item) => item.id));
    const now = Date.now() - startedAt;
    const additions = analysis.alerts
      .filter((item) => !previousAlerts.current.has(item.id))
      .map<ClinicalTimelineEvent>((item) => ({
        type: "clinical_alert",
        title: item.title,
        content: item.evidence,
        sourceType: "copilot",
        sourceStart: null,
        sourceEnd: null,
        relativeTimeMs: now,
        confidence: item.level === "crítico" ? "high" : "moderate",
        clinicalRelevance: item.suggestedAssessment,
        relatedHypothesis: "",
      }));
    previousAlerts.current = current;
    if (additions.length) queueMicrotask(() => mergeEvents(additions));
  }, [analysis.alerts, mergeEvents, startedAt]);

  useEffect(() => {
    const confirmed = events.filter(
      (event) => event.pinned || event.reviewed || event.manual,
    );
    window.localStorage.setItem(
      `aster:timeline:${appointmentId}`,
      JSON.stringify(confirmed),
    );
    onEventsChange(events.filter((event) => !event.hidden));
  }, [appointmentId, events, onEventsChange]);

  function patch(id: string, values: Partial<TimelineItem>) {
    setEvents((current) =>
      current.map((event) =>
        event.id === id ? { ...event, ...values, reviewed: true } : event,
      ),
    );
  }

  function addManual() {
    if (!manualTitle.trim() || !manualContent.trim()) return;
    mergeEvents([
      {
        type: "professional_decision",
        title: manualTitle,
        content: manualContent,
        sourceType: "professional_action",
        sourceStart: null,
        sourceEnd: null,
        relativeTimeMs: Date.now() - startedAt,
        confidence: "high",
        clinicalRelevance: "Evento adicionado pelo profissional.",
        relatedHypothesis: "",
      },
    ]);
    setEvents((current) =>
      current.map((event) =>
        event.title === manualTitle && event.content === manualContent
          ? { ...event, reviewed: true, manual: true }
          : event,
      ),
    );
    setManualTitle("");
    setManualContent("");
    setManualOpen(false);
  }

  const visible = useMemo(
    () =>
      events.filter(
        (event) =>
          !event.hidden &&
          (filter === "all" || event.type === filter) &&
          (!onlyPinned || event.pinned),
      ),
    [events, filter, onlyPinned],
  );

  const destinations: Array<[string, keyof MedicalRecordFormValues]> = [
    ["HDA", "hpi"],
    ["Antecedentes", "pmh"],
    ["Alergias", "allergies"],
    ["Medicamentos", "medications"],
    ["Exame físico", "physical_exam"],
    ["Avaliação", "assessment"],
    ["Plano", "plan"],
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="outline">{clock(now - startedAt)}</Badge>
        <Badge variant="secondary">{events.length} eventos</Badge>
        <span className="text-muted-foreground">
          {lastUpdated
            ? `Atualizada ${new Date(lastUpdated).toLocaleTimeString("pt-BR")}`
            : "Ainda não atualizada"}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={loading}
          onClick={() => void update()}
        >
          {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          Atualizar timeline
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setPaused((value) => !value)}
        >
          <Pause />
          {paused ? "Retomar atualização" : "Pausar atualização"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            setEvents((current) => current.filter((event) => event.pinned))
          }
        >
          <Trash2 />
          Limpar não fixados
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setManualOpen((value) => !value)}
        >
          <Plus />
          Evento manual
        </Button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        <Button
          type="button"
          size="xs"
          variant={filter === "all" ? "secondary" : "ghost"}
          onClick={() => setFilter("all")}
        >
          Todos
        </Button>
        {timelineEventTypes.map((type) => (
          <Button
            key={type}
            type="button"
            size="xs"
            className="shrink-0"
            variant={filter === type ? "secondary" : "ghost"}
            onClick={() => setFilter(type)}
          >
            {labels[type]}
          </Button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={onlyPinned}
          onChange={(event) => setOnlyPinned(event.target.checked)}
        />
        Somente fixados
      </label>
      {manualOpen && (
        <div className="space-y-2 rounded-lg border p-3">
          <input
            className="w-full rounded border bg-background px-2 py-1 text-sm"
            placeholder="Título"
            value={manualTitle}
            onChange={(event) => setManualTitle(event.target.value)}
          />
          <textarea
            className="w-full rounded border bg-background px-2 py-1 text-sm"
            placeholder="Conteúdo"
            value={manualContent}
            onChange={(event) => setManualContent(event.target.value)}
          />
          <Button type="button" size="sm" onClick={addManual}>
            Adicionar
          </Button>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!visible.length && (
        <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
          Nenhum evento clínico registrado nesta consulta.
        </p>
      )}
      <div className="max-h-[58vh] space-y-2 overflow-y-auto pr-1">
        {visible.map((event) => (
          <details
            key={event.id}
            className="rounded-lg border bg-background p-3"
            open
          >
            <summary className="cursor-pointer list-none">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-mono text-xs text-muted-foreground">
                    {clock(event.relativeTimeMs)}
                  </p>
                  <p className="text-xs font-semibold uppercase text-primary">
                    {labels[event.type]}
                  </p>
                  <p className="text-sm font-medium">{event.title}</p>
                </div>
                <div className="flex">
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    aria-label="Fixar"
                    onClick={(click) => {
                      click.preventDefault();
                      patch(event.id, { pinned: !event.pinned });
                    }}
                  >
                    {event.pinned ? <PinOff /> : <Pin />}
                  </Button>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    aria-label="Ocultar"
                    onClick={(click) => {
                      click.preventDefault();
                      patch(event.id, { hidden: true });
                    }}
                  >
                    <EyeOff />
                  </Button>
                </div>
              </div>
            </summary>
            <div className="mt-2 space-y-2 border-t pt-2">
              <textarea
                className="w-full resize-y rounded border bg-background px-2 py-1 text-sm"
                value={event.content}
                onChange={(change) =>
                  patch(event.id, { content: change.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">
                Origem: {event.sourceType} · confiança {event.confidence}
              </p>
              {event.reviewed && (
                <Badge variant="outline">Revisado pelo profissional</Badge>
              )}
              <p className="text-xs">
                {event.clinicalRelevance || "Incluído por relevância clínica."}
              </p>
              <div className="flex flex-wrap gap-1">
                {event.sourceStart !== null && (
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() =>
                      window.dispatchEvent(
                        new CustomEvent("aster:timeline-source", {
                          detail: event,
                        }),
                      )
                    }
                  >
                    <Eye />
                    Ver trecho
                  </Button>
                )}
                {event.sourceStart === null && (
                  <span className="text-xs text-muted-foreground">
                    Trecho de origem aproximado.
                  </span>
                )}
                {destinations.map(([label, field]) => (
                  <Button
                    key={field}
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() => onInsert(field, event.content)}
                  >
                    Levar para {label}
                  </Button>
                ))}
                {event.relatedHypothesis && (
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() =>
                      window.dispatchEvent(
                        new CustomEvent("aster:chat-question", {
                          detail: `Explique a mudança da hipótese ${event.relatedHypothesis} usando a timeline.`,
                        }),
                      )
                    }
                  >
                    Explicar no Chat
                  </Button>
                )}
              </div>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
