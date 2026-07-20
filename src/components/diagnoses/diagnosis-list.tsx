"use client";

import { ArrowDown, ArrowUp, CircleStar, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { diagnosisStatusLabels } from "@/lib/diagnosis-engine/serialization";
import type {
  ClinicalDiagnosis,
  DiagnosisStatus,
} from "@/lib/diagnosis-engine/types";

export function DiagnosisList({
  diagnoses,
  disabled,
  onMakePrimary,
  onStatusChange,
  onObservationChange,
  onMove,
  onRemove,
}: {
  diagnoses: ClinicalDiagnosis[];
  disabled: boolean;
  onMakePrimary: (id: string) => void;
  onStatusChange: (id: string, status: DiagnosisStatus) => void;
  onObservationChange: (id: string, value: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onRemove: (diagnosis: ClinicalDiagnosis) => void;
}) {
  if (!diagnoses.length)
    return (
      <div className="rounded-lg border border-dashed bg-background p-6 text-center text-sm text-muted-foreground">
        Nenhum diagnóstico adicionado ao atendimento.
      </div>
    );

  const secondary = diagnoses.filter((item) => item.priority === "secondary");
  return (
    <section className="space-y-2" aria-label="Diagnósticos adicionados">
      {diagnoses.map((diagnosis) => {
        const secondaryIndex = secondary.findIndex(
          (item) => item.id === diagnosis.id,
        );
        return (
          <article
            key={diagnosis.id}
            className={`rounded-lg border bg-background p-3 ${
              diagnosis.priority === "primary"
                ? "border-primary/45 shadow-sm"
                : ""
            }`}
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-sm">
                    {diagnosis.code} — {diagnosis.description}
                  </strong>
                  <Badge
                    variant={
                      diagnosis.priority === "primary" ? "default" : "outline"
                    }
                  >
                    {diagnosis.priority === "primary"
                      ? "Principal"
                      : "Secundário"}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {diagnosis.classificationSystem}
                  {diagnosis.category ? ` · ${diagnosis.category}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-1">
                {diagnosis.priority === "secondary" && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={disabled}
                    onClick={() => onMakePrimary(diagnosis.id)}
                  >
                    <CircleStar />
                    Tornar principal
                  </Button>
                )}
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  disabled={disabled || secondaryIndex <= 0}
                  aria-label={`Mover ${diagnosis.description} para cima`}
                  onClick={() => onMove(diagnosis.id, -1)}
                >
                  <ArrowUp />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  disabled={
                    disabled ||
                    secondaryIndex < 0 ||
                    secondaryIndex === secondary.length - 1
                  }
                  aria-label={`Mover ${diagnosis.description} para baixo`}
                  onClick={() => onMove(diagnosis.id, 1)}
                >
                  <ArrowDown />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  disabled={disabled}
                  aria-label={`Remover ${diagnosis.description}`}
                  onClick={() => onRemove(diagnosis)}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium">
                Status clínico
                <Select
                  className="mt-1"
                  disabled={disabled}
                  value={diagnosis.status}
                  onChange={(event) =>
                    onStatusChange(
                      diagnosis.id,
                      event.target.value as DiagnosisStatus,
                    )
                  }
                >
                  {Object.entries(diagnosisStatusLabels).map(
                    ([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ),
                  )}
                </Select>
              </label>
              <label className="text-xs font-medium">
                Observação clínica
                <textarea
                  rows={2}
                  disabled={disabled}
                  value={diagnosis.observation?.text ?? ""}
                  placeholder="Opcional"
                  className="mt-1 w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-70"
                  onChange={(event) =>
                    onObservationChange(diagnosis.id, event.target.value)
                  }
                />
              </label>
            </div>
          </article>
        );
      })}
    </section>
  );
}
