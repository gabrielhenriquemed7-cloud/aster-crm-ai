"use client";

import { AlertTriangle, Bot, Loader2, Stethoscope } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { analyzeClinicalContextIncrement } from "@/app/(dashboard)/consultas/clinical-realtime-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClinicalChat } from "@/components/medical-records/clinical-chat";
import type { RealtimeClinicalAnalysis } from "@/lib/ai/clinical-realtime-schema";

const UPDATE_INTERVAL_MS = 20_000;
const SENTENCE_DEBOUNCE_MS = 900;

const emptyAnalysis: RealtimeClinicalAnalysis = {
  hypotheses: [],
  questions: [],
  physicalExam: [],
  alerts: [],
  importantData: [],
};

export function ClinicalRealtimeAssistant({
  appointmentId,
  text,
  enabled,
}: {
  appointmentId: string;
  text: string;
  enabled: boolean;
}) {
  const [analysis, setAnalysis] =
    useState<RealtimeClinicalAnalysis>(emptyAnalysis);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"assistance" | "chat">("assistance");
  const lastSentRef = useRef("");
  const pendingSinceRef = useRef<number | null>(null);

  const update = useCallback(async () => {
    const current = text.trim();
    const previousText = lastSentRef.current;
    if (!enabled || loading || current.length < 3 || current === previousText)
      return;
    const delta = current.startsWith(previousText)
      ? current.slice(previousText.length).trim()
      : current;
    if (delta.length < 3) return;
    lastSentRef.current = current;
    pendingSinceRef.current = null;
    setLoading(true);
    setError("");
    const result = await analyzeClinicalContextIncrement({
      appointmentId,
      delta,
      previous: analysis,
    });
    setLoading(false);
    if (result.error || !result.analysis) {
      setError(result.error || "Não foi possível atualizar o Copilot.");
      return;
    }
    setAnalysis(result.analysis);
  }, [analysis, appointmentId, enabled, loading, text]);

  useEffect(() => {
    const current = text.trim();
    if (
      !enabled ||
      loading ||
      current.length < 3 ||
      current === lastSentRef.current
    )
      return;
    const now = Date.now();
    pendingSinceRef.current ??= now;
    const hasNewSentence = /[.!?]\s*$/.test(current);
    const elapsed = now - pendingSinceRef.current;
    const delay = hasNewSentence
      ? SENTENCE_DEBOUNCE_MS
      : Math.max(250, UPDATE_INTERVAL_MS - elapsed);
    const timer = window.setTimeout(() => void update(), delay);
    return () => window.clearTimeout(timer);
  }, [enabled, loading, text, update]);

  if (!enabled) return null;

  const hasContent =
    analysis.hypotheses.length > 0 ||
    analysis.questions.length > 0 ||
    analysis.physicalExam.length > 0 ||
    analysis.alerts.length > 0 ||
    analysis.importantData.length > 0;

  return (
    <aside className="sticky top-4 space-y-4 rounded-xl border border-primary/25 bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 border-b pb-3">
        <Bot className="size-5 text-primary" />
        <h3 className="font-semibold">ASTER COPILOT</h3>
      </div>
      <div className="grid grid-cols-2 rounded-lg bg-muted p-1">
        <Button
          type="button"
          size="sm"
          variant={tab === "assistance" ? "secondary" : "ghost"}
          onClick={() => setTab("assistance")}
        >
          Assistência
        </Button>
        <Button
          type="button"
          size="sm"
          variant={tab === "chat" ? "secondary" : "ghost"}
          onClick={() => setTab("chat")}
        >
          Chat Clínico
        </Button>
      </div>
      {tab === "assistance" ? (
        <>
          {loading && (
            <p
              role="status"
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              <Loader2 className="size-4 animate-spin" /> Copilot analisando...
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {!hasContent && !loading && (
            <p className="text-sm text-muted-foreground">
              O acompanhamento começa quando houver contexto clínico suficiente.
            </p>
          )}

          {analysis.hypotheses.length > 0 && (
            <section className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide">
                Hipóteses clínicas
              </h4>
              <ul className="space-y-2">
                {analysis.hypotheses.map((hypothesis) => (
                  <li
                    key={hypothesis.name}
                    className="rounded-lg border p-2 text-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span>{hypothesis.name}</span>
                      <Badge variant="outline">
                        {hypothesis.compatibility}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Necessita correlação clínica.
              </p>
            </section>
          )}

          {analysis.questions.length > 0 && (
            <section className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide">
                Ainda investigar
              </h4>
              <ul className="space-y-1 text-sm">
                {analysis.questions.map((question) => (
                  <li key={question}>□ {question}</li>
                ))}
              </ul>
            </section>
          )}

          {analysis.physicalExam.length > 0 && (
            <section className="space-y-2">
              <h4 className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide">
                <Stethoscope className="size-3" /> Exame físico sugerido
              </h4>
              <ul className="space-y-1 text-sm">
                {analysis.physicalExam.map((item) => (
                  <li key={item}>□ {item}</li>
                ))}
              </ul>
            </section>
          )}

          {analysis.alerts.length > 0 && (
            <section className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <h4 className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-destructive">
                <AlertTriangle className="size-3" /> Sinais de alerta
              </h4>
              <ul className="space-y-1 text-sm text-destructive">
                {analysis.alerts.map((alert) => (
                  <li key={alert}>⚠ {alert}</li>
                ))}
              </ul>
            </section>
          )}

          {analysis.importantData.length > 0 && (
            <section className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide">
                Dados importantes
              </h4>
              <ul className="space-y-1 text-sm">
                {analysis.importantData.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          )}
          <p className="border-t pt-3 text-xs text-muted-foreground">
            Assistência em tempo real. Não altera nem salva o prontuário.
          </p>
        </>
      ) : (
        <ClinicalChat
          appointmentId={appointmentId}
          clinicalText={text}
          assistance={analysis}
        />
      )}
    </aside>
  );
}
