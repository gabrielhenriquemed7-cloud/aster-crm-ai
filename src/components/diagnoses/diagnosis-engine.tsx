"use client";

import { AlertTriangle, ChevronRight, Save, Stethoscope } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { DiagnosisList } from "@/components/diagnoses/diagnosis-list";
import { DiagnosisPreview } from "@/components/diagnoses/diagnosis-preview";
import { DiagnosisSearch } from "@/components/diagnoses/diagnosis-search";
import { Button } from "@/components/ui/button";
import { useClinicalDiagnoses } from "@/hooks/use-clinical-diagnoses";
import {
  diagnosesFromRecordFields,
  diagnosesToRecordFields,
} from "@/lib/diagnosis-engine/serialization";
import type {
  ClinicalDiagnosis,
  DiagnosticClassificationSystem,
} from "@/lib/diagnosis-engine/types";

export function DiagnosisEngine({
  disabled,
  assessment,
  classifications,
  onCommit,
}: {
  disabled: boolean;
  assessment: string;
  classifications: string;
  onCommit: (values: { assessment: string; cid10: string }) => void;
}) {
  const [initial] = useState(() =>
    diagnosesFromRecordFields(assessment, classifications),
  );
  const engine = useClinicalDiagnoses(initial);
  const [query, setQuery] = useState("");
  const [systems, setSystems] = useState<DiagnosticClassificationSystem[]>([
    "CID-10",
    "CID-11",
    "CIAP-2",
  ]);
  const [dirty, setDirty] = useState(false);
  const hasLegacyContent =
    Boolean(assessment.trim() || classifications.trim()) && !initial.length;

  function changed(action: () => void) {
    action();
    setDirty(true);
  }

  function remove(diagnosis: ClinicalDiagnosis) {
    const needsConfirmation =
      diagnosis.priority === "primary" ||
      Boolean(diagnosis.observation?.text.trim());
    if (
      needsConfirmation &&
      !window.confirm(
        diagnosis.priority === "primary"
          ? "Remover o diagnóstico principal? Se houver outro diagnóstico, ele será promovido para principal."
          : "Este diagnóstico possui observação clínica. Deseja removê-lo?",
      )
    )
      return;
    changed(() => engine.remove(diagnosis.id));
  }

  function commit() {
    if (
      !engine.diagnoses.every(
        (item) => item.code.trim() && item.description.trim(),
      )
    )
      return toast.error(
        "Todos os diagnósticos precisam possuir código e descrição.",
      );
    const fields = diagnosesToRecordFields(engine.diagnoses);
    if (
      hasLegacyContent &&
      !window.confirm(
        "O registro atual usa texto livre. Deseja substituí-lo pelo formato estruturado?",
      )
    )
      return;
    onCommit(fields);
    setDirty(false);
    toast.success(
      "Diagnósticos estruturados enviados ao prontuário para salvamento.",
    );
  }

  return (
    <details
      data-section="assessment"
      className="group scroll-mt-6 overflow-hidden rounded-lg border bg-card"
    >
      <summary className="grid h-10 cursor-pointer list-none grid-cols-[18px_minmax(140px,auto)_minmax(0,1fr)_18px] items-center gap-2.5 px-3 [&::-webkit-details-marker]:hidden">
        <Stethoscope className="size-[18px] text-primary" />
        <span className="truncate text-sm font-semibold">
          Hipóteses Diagnósticas e CID
        </span>
        <span className="hidden truncate text-[13px] text-muted-foreground sm:block">
          {engine.diagnoses.length
            ? `${engine.diagnoses.length} diagnóstico(s) · ${engine.preview.primary?.description || "Sem principal"}`
            : "Nenhum diagnóstico estruturado"}
        </span>
        <ChevronRight className="size-[18px] text-muted-foreground transition-transform group-open:rotate-90" />
      </summary>
      <div className="space-y-3 border-t p-3">
        <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <p>
            A busca usa somente uma amostra local não exaustiva. Não há decisão
            clínica automática nem validação contra bases oficiais nesta versão.
          </p>
        </div>
        {hasLegacyContent && (
          <div className="rounded-lg border p-3 text-xs">
            <strong>Registro textual existente preservado</strong>
            <p className="mt-1 text-muted-foreground">
              Ele só será substituído após adicionar diagnósticos e confirmar
              explicitamente a atualização estruturada.
            </p>
          </div>
        )}
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.75fr)]">
          <div className="space-y-3">
            <DiagnosisSearch
              query={query}
              onQueryChange={setQuery}
              selectedSystems={systems}
              onSystemsChange={setSystems}
              diagnoses={engine.diagnoses}
              disabled={disabled}
              onAdd={(result) =>
                changed(() => {
                  if (!engine.add(result))
                    toast.info("Este diagnóstico já foi adicionado.");
                })
              }
            />
            <DiagnosisList
              diagnoses={engine.diagnoses}
              disabled={disabled}
              onMakePrimary={(id) => changed(() => engine.makePrimary(id))}
              onStatusChange={(id, status) =>
                changed(() => engine.setStatus(id, status))
              }
              onObservationChange={(id, value) =>
                changed(() => engine.setObservation(id, value))
              }
              onMove={(id, direction) =>
                changed(() => engine.move(id, direction))
              }
              onRemove={remove}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                disabled={disabled || !dirty || !engine.diagnoses.length}
                onClick={commit}
              >
                <Save />
                Atualizar prontuário
              </Button>
              <span
                aria-live="polite"
                className="text-xs text-muted-foreground"
              >
                {dirty
                  ? "Alterações ainda não enviadas ao prontuário."
                  : engine.diagnoses.length
                    ? "Diagnósticos sincronizados com o formulário."
                    : "Nenhum diagnóstico estruturado."}
              </span>
            </div>
          </div>
          <DiagnosisPreview
            primary={engine.preview.primary}
            secondary={engine.preview.secondary}
          />
        </div>
      </div>
    </details>
  );
}
