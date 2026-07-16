"use client";

import { AlertTriangle, Calculator, ChevronDown, Send } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { saveClinicalScore } from "@/app/(dashboard)/consultas/clinical-score-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  calculateScore,
  extractKnownValues,
  relevantScores,
  scoreDefinitions,
  type ScoreValue,
} from "@/lib/clinical-scores/engine";
import type { MedicalRecordFormValues } from "@/lib/medical-records/schema";

export function ClinicalScores({
  appointmentId,
  text,
  age,
  gender,
  getFormValues,
  onInsertConduct,
  onInsertTimeline,
}: {
  appointmentId: string;
  text: string;
  age: number | null;
  gender: string | null;
  getFormValues: () => MedicalRecordFormValues;
  onInsertConduct: (value: string) => void;
  onInsertTimeline: (
    field: keyof MedicalRecordFormValues,
    value: string,
  ) => void;
}) {
  const [manual, setManual] = useState<Record<string, ScoreValue>>({});
  const [manualScoreIds, setManualScoreIds] = useState<string[]>([]);
  const [manualScoreId, setManualScoreId] = useState("");
  const [tick, setTick] = useState(0);
  const lastHash = useRef("");
  const context = useMemo(() => {
    void tick;
    const values = getFormValues();
    return [text, ...Object.values(values)].filter(Boolean).join("\n");
  }, [getFormValues, text, tick]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = JSON.stringify(getFormValues());
      if (next !== lastHash.current) {
        lastHash.current = next;
        setTick((x) => x + 1);
      }
    }, 1200);
    return () => window.clearInterval(timer);
  }, [appointmentId, getFormValues]);
  const known = useMemo(
    () => ({ ...extractKnownValues(context, age, gender), ...manual }),
    [age, context, gender, manual],
  );
  const definitions = useMemo(() => {
    const detected = relevantScores(context);
    const detectedIds = new Set(detected.map((score) => score.id));
    return [
      ...detected,
      ...scoreDefinitions.filter(
        (score) =>
          manualScoreIds.includes(score.id) && !detectedIds.has(score.id),
      ),
    ];
  }, [context, manualScoreIds]);
  const results = definitions.map((definition) =>
    calculateScore(definition, known),
  );
  const summary = (name: string, score: number, interpretation: string) =>
    `${name}: ${score}. ${interpretation}\nScore calculado automaticamente. Validar informações clínicas antes da tomada de decisão.`;
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
        <p className="flex gap-2 font-medium">
          <AlertTriangle className="size-4 shrink-0" />
          Score calculado automaticamente. Validar informações clínicas antes da
          tomada de decisão.
        </p>
        <p className="mt-1 text-muted-foreground">
          Apoio à decisão: não confirma diagnóstico, não inicia tratamento e não
          substitui julgamento médico.
        </p>
      </div>
      {!definitions.length && (
        <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
          <Calculator className="mb-2 size-5" />
          Nenhum score clínico identificado.
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
        <select
          aria-label="Selecionar score clínico"
          className="min-w-52 flex-1 rounded-md border bg-background px-3 py-2 text-sm"
          value={manualScoreId}
          onChange={(event) => setManualScoreId(event.target.value)}
        >
          <option value="">Selecione um score</option>
          {scoreDefinitions.map((score) => (
            <option key={score.id} value={score.id}>
              {score.name}
            </option>
          ))}
        </select>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!manualScoreId}
          onClick={() => {
            setManualScoreIds((current) => [
              ...new Set([...current, manualScoreId]),
            ]);
            setManualScoreId("");
          }}
        >
          Adicionar score manualmente
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setTick((current) => current + 1)}
        >
          <Calculator /> Calcular automaticamente
        </Button>
      </div>
      {results.map((result) => (
        <article
          key={result.definition.id}
          className="rounded-xl border p-4 text-sm"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h4 className="font-semibold">{result.definition.name}</h4>
              <p className="mt-1 text-2xl font-semibold">{result.score}</p>
            </div>
            <Badge variant={result.complete ? "default" : "outline"}>
              {result.complete ? "Completo" : "Incompleto"}
            </Badge>
          </div>
          <p className="mt-2">{result.interpretation}</p>
          {result.missing.length > 0 && (
            <div className="mt-3 rounded-lg bg-muted/40 p-3">
              <p className="font-medium">Somente os dados faltantes</p>
              <div className="mt-2 grid gap-2">
                {result.missing.map((criterion) => (
                  <label
                    key={criterion.key}
                    className="flex items-center justify-between gap-3"
                  >
                    <span>
                      {criterion.label}
                      {criterion.unit ? ` (${criterion.unit})` : ""}
                    </span>
                    {criterion.type === "boolean" ? (
                      <select
                        className="rounded border bg-background px-2 py-1"
                        defaultValue=""
                        onChange={(e) =>
                          setManual((current) => ({
                            ...current,
                            [criterion.key]:
                              e.target.value === ""
                                ? null
                                : e.target.value === "yes",
                          }))
                        }
                      >
                        <option value="">Informar</option>
                        <option value="yes">Sim</option>
                        <option value="no">Não</option>
                      </select>
                    ) : (
                      <input
                        aria-label={criterion.label}
                        type="number"
                        step="any"
                        className="w-24 rounded border bg-background px-2 py-1"
                        onChange={(e) =>
                          setManual((current) => ({
                            ...current,
                            [criterion.key]:
                              e.target.value === ""
                                ? null
                                : Number(e.target.value),
                          }))
                        }
                      />
                    )}
                  </label>
                ))}
              </div>
            </div>
          )}
          <details className="mt-3 rounded-lg border">
            <summary className="flex cursor-pointer list-none items-center justify-between p-3 font-medium">
              Como foi calculado?
              <ChevronDown className="size-4" />
            </summary>
            <div className="space-y-2 border-t p-3">
              <ul className="space-y-1">
                {result.used.map((item) => (
                  <li key={item.criterion.key}>
                    {item.criterion.label}:{" "}
                    {typeof item.value === "boolean"
                      ? item.value
                        ? "Sim"
                        : "Não"
                      : item.value}{" "}
                    → {item.points} ponto(s)
                  </li>
                ))}
              </ul>
              <p>
                <strong>Referência:</strong> {result.definition.reference}
              </p>
              <p>
                <strong>Limitações:</strong> {result.definition.limitations}
              </p>
            </div>
          </details>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={!result.complete}
              onClick={async () => {
                const response = await saveClinicalScore({
                  appointmentId,
                  score: result.definition.id,
                  result: result.score,
                  data: Object.fromEntries(
                    result.used.map((x) => [x.criterion.key, x.value]),
                  ),
                  version: "aster-scores-v1",
                });
                if (response.error) toast.error(response.error);
                else toast.success(response.success);
              }}
            >
              Registrar resultado
            </Button>
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() =>
                onInsertConduct(
                  summary(
                    result.definition.name,
                    result.score,
                    result.interpretation,
                  ),
                )
              }
            >
              <Send />
              Levar para conduta
            </Button>
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() =>
                onInsertTimeline(
                  "assessment",
                  summary(
                    result.definition.name,
                    result.score,
                    result.interpretation,
                  ),
                )
              }
            >
              Levar para Timeline
            </Button>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent("aster:chat-question", {
                    detail: `Explique a interpretação clínica e as limitações do ${result.definition.name} com resultado ${result.score}, sem confirmar diagnóstico.`,
                  }),
                )
              }
            >
              Levar para Chat
            </Button>
          </div>
        </article>
      ))}
    </div>
  );
}
