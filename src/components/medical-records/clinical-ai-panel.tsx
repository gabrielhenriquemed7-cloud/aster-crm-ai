"use client";

import {
  AlertTriangle,
  Bot,
  Clipboard,
  Loader2,
  RotateCcw,
  Sparkles,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { toast } from "sonner";

import {
  acceptClinicalAiSections,
  discardClinicalAiSuggestion,
  generateClinicalAiSuggestion,
} from "@/app/(dashboard)/consultas/clinical-ai-actions";
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
} from "@/components/ui/dialog";
import type { ClinicalAiSuggestion } from "@/lib/ai/clinical-schema";
import type { ClinicalAiRequestType } from "@/lib/ai/clinical-assistant";
import type { MedicalRecordFormValues } from "@/lib/medical-records/schema";

type FieldName = keyof MedicalRecordFormValues;
type Section = {
  key: keyof ClinicalAiSuggestion;
  label: string;
  field?: FieldName;
};

const sections: Section[] = [
  {
    key: "chiefComplaint",
    label: "Queixa principal",
    field: "chief_complaint",
  },
  { key: "hpi", label: "HDA", field: "hpi" },
  { key: "personalHistory", label: "Antecedentes", field: "pmh" },
  { key: "allergies", label: "Alergias", field: "allergies" },
  { key: "medications", label: "Medicamentos em uso", field: "medications" },
  { key: "physicalExam", label: "Exame físico", field: "physical_exam" },
  { key: "clinicalAssessment", label: "Avaliação", field: "assessment" },
  {
    key: "diagnosticHypotheses",
    label: "Hipóteses diagnósticas",
    field: "assessment",
  },
  { key: "cid10Suggestions", label: "CID-10 sugeridos", field: "cid10" },
  { key: "suggestedExams", label: "Exames sugeridos", field: "exam_requests" },
  { key: "plan", label: "Conduta sugerida", field: "plan" },
  {
    key: "alertsAndMissingInformation",
    label: "Alertas e informações faltantes",
  },
];

const requests: Array<{ type: ClinicalAiRequestType; label: string }> = [
  { type: "structured_anamnesis", label: "Gerar anamnese estruturada" },
  { type: "soap", label: "Gerar SOAP" },
  { type: "hypotheses", label: "Sugerir hipóteses" },
  { type: "cid10", label: "Sugerir CID-10" },
  { type: "exams", label: "Sugerir exames" },
  { type: "conduct", label: "Sugerir conduta" },
];

function sectionLabel(
  section: Section,
  requestType: ClinicalAiRequestType | null,
) {
  if (requestType !== "soap") return section.label;
  if (section.key === "hpi") return "Subjetivo";
  if (section.key === "physicalExam") return "Objetivo";
  if (section.key === "clinicalAssessment") return "Avaliação";
  if (section.key === "plan") return "Plano";
  return section.label;
}

export function ClinicalAIPanel({
  appointmentId,
  form,
  enabled,
  canEdit,
  canManageAi,
}: {
  appointmentId: string;
  form: UseFormReturn<MedicalRecordFormValues>;
  enabled: boolean;
  canEdit: boolean;
  canManageAi: boolean;
}) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<ClinicalAiSuggestion | null>(
    null,
  );
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Array<keyof ClinicalAiSuggestion>>(
    [],
  );
  const [lastRequest, setLastRequest] = useState<ClinicalAiRequestType | null>(
    null,
  );
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [conflicts, setConflicts] = useState<
    Array<{ field: FieldName; label: string; value: string; keys: string[] }>
  >([]);

  const visibleSections = useMemo(
    () => sections.filter((section) => suggestion?.[section.key]?.trim()),
    [suggestion],
  );

  if (!enabled) {
    return (
      <Card id="aster-copilot" className="w-full border-amber-500/30 bg-amber-500/5 shadow-none">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <p className="font-medium">
              A IA Clínica está desabilitada para esta clínica.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Habilite o recurso para usar o ASTER COPILOT.
            </p>
          </div>
          {canManageAi && (
            <Button
              type="button"
              variant="outline"
              render={<Link href="/configuracoes/ia" />}
              nativeButton={false}
            >
              Abrir configurações
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  async function generate(requestType: ClinicalAiRequestType) {
    setLoading(true);
    setError("");
    setSuccess("");
    setLastRequest(requestType);
    const result = await generateClinicalAiSuggestion({
      appointmentId,
      text: input,
      requestType,
    });
    setLoading(false);
    if (result.error || !result.suggestion || !result.generationId) {
      setError(
        `Não foi possível gerar a sugestão: ${result.error || "RESPOSTA_INVALIDA — Resposta inválida."}`,
      );
      return;
    }
    const available = sections
      .filter((section) => result.suggestion?.[section.key]?.trim())
      .map((section) => section.key);
    setSuggestion(result.suggestion);
    setGenerationId(result.generationId);
    setSelected(available);
    setSuccess(
      "Sugestão gerada com sucesso. Revise o conteúdo antes de inserir.",
    );
  }

  function proposals() {
    const grouped = new Map<
      FieldName,
      { labels: string[]; values: string[]; keys: string[] }
    >();
    for (const section of sections.filter(
      (item) => item.field && selected.includes(item.key),
    )) {
      const value = suggestion?.[section.key]?.trim();
      if (!value || !section.field) continue;
      const current = grouped.get(section.field) ?? {
        labels: [],
        values: [],
        keys: [],
      };
      current.labels.push(sectionLabel(section, lastRequest));
      current.values.push(value);
      current.keys.push(section.key);
      grouped.set(section.field, current);
    }
    return [...grouped.entries()].map(([field, item]) => ({
      field,
      label: item.labels.join(" + "),
      value: item.values.join("\n\n"),
      keys: item.keys,
    }));
  }

  function insertSelected() {
    const pending = proposals();
    if (!pending.length)
      return toast.error(
        "Selecione ao menos um card que possa ser inserido no prontuário.",
      );
    const occupied = pending.filter((item) =>
      form.getValues(item.field)?.trim(),
    );
    if (occupied.length) {
      setConflicts(pending);
      return;
    }
    applyInsertion(pending);
  }

  function applyInsertion(items: ReturnType<typeof proposals>) {
    items.forEach((item) =>
      form.setValue(item.field, item.value, {
        shouldDirty: true,
        shouldValidate: true,
      }),
    );
    const accepted = items.flatMap((item) => item.keys);
    if (generationId)
      void acceptClinicalAiSections({ generationId, sections: accepted });
    setConflicts([]);
    setSuccess(
      "Campos selecionados inseridos no rascunho. Revise antes de salvar o prontuário.",
    );
  }

  async function discard() {
    if (generationId) {
      const result = await discardClinicalAiSuggestion(generationId);
      if (result.error)
        return setError(`Não foi possível descartar: ${result.error}`);
    }
    setSuggestion(null);
    setGenerationId(null);
    setSelected([]);
    setError("");
    setSuccess("Sugestão descartada.");
  }

  async function copyAll() {
    const content = visibleSections
      .map(
        (section) =>
          `${sectionLabel(section, lastRequest)}\n${suggestion?.[section.key]}`,
      )
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(content);
      setSuccess("Conteúdo copiado.");
    } catch {
      setError("Não foi possível copiar o conteúdo.");
    }
  }

  return (
    <Card id="aster-copilot" className="w-full border-primary/25 shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="size-5 text-primary" /> ASTER COPILOT
        </CardTitle>
      </CardHeader>
      <CardContent
        className={
          suggestion ? "grid items-start gap-6 lg:grid-cols-2" : "space-y-4"
        }
      >
        <div className="space-y-4">
          <label className="block text-sm font-medium">
            Relato clínico para análise
            <textarea
              rows={10}
              maxLength={50000}
              disabled={!canEdit || loading}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              className="mt-2 w-full resize-y rounded-lg border bg-background px-3 py-2 font-normal leading-6 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder="Digite ou cole aqui o relato da consulta, queixa principal, história, exame físico e demais informações relevantes."
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {requests.map((request) => (
              <Button
                key={request.type}
                type="button"
                variant={
                  request.type === "structured_anamnesis"
                    ? "default"
                    : "outline"
                }
                disabled={!canEdit || loading || input.trim().length < 30}
                onClick={() => generate(request.type)}
              >
                {loading && lastRequest === request.type ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Sparkles />
                )}
                {request.label}
              </Button>
            ))}
            <Button
              type="button"
              variant="outline"
              disabled={loading || (!input && !suggestion)}
              onClick={() => {
                setInput("");
                setSuggestion(null);
                setGenerationId(null);
                setSelected([]);
                setError("");
                setSuccess("");
              }}
            >
              <Trash2 /> Limpar
            </Button>
          </div>
          {loading && (
            <p
              role="status"
              className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3 text-sm"
            >
              <Loader2 className="size-4 animate-spin" /> Analisando informações
              clínicas...
            </p>
          )}
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            >
              <p>{error}</p>
              {lastRequest && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  disabled={loading}
                  onClick={() => generate(lastRequest)}
                >
                  <RotateCcw /> Tentar novamente
                </Button>
              )}
            </div>
          )}
          {success && (
            <p
              role="status"
              className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700 dark:text-emerald-300"
            >
              {success}
            </p>
          )}
          <p className="flex gap-2 text-xs text-muted-foreground">
            <AlertTriangle className="size-4 shrink-0" /> Conteúdo gerado por
            IA. Revise antes de inserir no prontuário.
          </p>
        </div>
        {suggestion && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={insertSelected}
                disabled={!canEdit || !selected.length}
              >
                Inserir campos selecionados no prontuário
              </Button>
              <Button type="button" variant="outline" onClick={copyAll}>
                <Clipboard /> Copiar tudo
              </Button>
              <Button type="button" variant="outline" onClick={discard}>
                <Trash2 /> Descartar
              </Button>
            </div>
            {visibleSections.map((section) => (
              <section key={section.key} className="rounded-xl border p-4">
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <input
                    type="checkbox"
                    checked={selected.includes(section.key)}
                    onChange={(event) =>
                      setSelected((current) =>
                        event.target.checked
                          ? [...current, section.key]
                          : current.filter((key) => key !== section.key),
                      )
                    }
                  />
                  {sectionLabel(section, lastRequest)}
                </label>
                <textarea
                  rows={3}
                  value={suggestion[section.key]}
                  onChange={(event) =>
                    setSuggestion((current) =>
                      current
                        ? { ...current, [section.key]: event.target.value }
                        : current,
                    )
                  }
                  className="mt-2 w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm leading-6"
                />
              </section>
            ))}
            <p className="text-xs text-muted-foreground">
              Hipóteses a considerar e sugestões para avaliação profissional
              necessitam correlação clínica. A IA não estabelece diagnóstico
              definitivo.
            </p>
          </div>
        )}
      </CardContent>
      <Dialog
        open={conflicts.length > 0}
        onOpenChange={(open) => {
          if (!open) setConflicts([]);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Substituir campos preenchidos?</DialogTitle>
            <DialogDescription>
              Os campos abaixo já possuem conteúdo. Confirme somente se deseja
              substituí-los pela sugestão revisada da IA.
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-2 text-sm">
            {conflicts
              .filter((item) => form.getValues(item.field)?.trim())
              .map((item) => (
                <li key={item.field} className="rounded-lg border p-3">
                  {item.label}
                </li>
              ))}
          </ul>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="button" onClick={() => applyInsertion(conflicts)}>
              Confirmar substituição
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
