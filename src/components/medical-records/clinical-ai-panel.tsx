"use client";

import { Bot, Clipboard, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
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
import type { MedicalRecordFormValues } from "@/lib/medical-records/schema";

type FieldName = keyof MedicalRecordFormValues;
type Strategy = "keep" | "append" | "replace";
const sections: Array<{
  key: keyof ClinicalAiSuggestion;
  label: string;
  field: FieldName;
}> = [
  {
    key: "chiefComplaint",
    label: "Motivo da consulta",
    field: "chief_complaint",
  },
  { key: "hpi", label: "HDA", field: "hpi" },
  { key: "personalHistory", label: "Antecedentes pessoais", field: "pmh" },
  {
    key: "familyHistory",
    label: "Antecedentes familiares",
    field: "family_history",
  },
  { key: "socialHistory", label: "Hábitos de vida", field: "social_history" },
  { key: "medications", label: "Medicamentos em uso", field: "medications" },
  { key: "allergies", label: "Alergias", field: "allergies" },
  { key: "reviewOfSystems", label: "Revisão de sistemas", field: "hpi" },
  {
    key: "vitalSigns",
    label: "Sinais vitais mencionados",
    field: "vital_signs",
  },
  { key: "physicalExam", label: "Exame físico", field: "physical_exam" },
  {
    key: "clinicalAssessment",
    label: "Avaliação clínica",
    field: "assessment",
  },
  {
    key: "diagnosticHypotheses",
    label: "Hipóteses diagnósticas",
    field: "assessment",
  },
  {
    key: "differentialDiagnoses",
    label: "Diagnósticos diferenciais",
    field: "assessment",
  },
  { key: "cid10Suggestions", label: "Sugestões de CID-10", field: "cid10" },
  { key: "plan", label: "Plano / conduta", field: "plan" },
  { key: "suggestedExams", label: "Exames sugeridos", field: "exam_requests" },
  { key: "guidance", label: "Orientações", field: "guidance" },
  { key: "followUp", label: "Retorno", field: "return_guidance" },
];

export function ClinicalAiPanel({
  appointmentId,
  form,
  enabled,
  canEdit,
}: {
  appointmentId: string;
  form: UseFormReturn<MedicalRecordFormValues>;
  enabled: boolean;
  canEdit: boolean;
}) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<ClinicalAiSuggestion | null>(
    null,
  );
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [strategies, setStrategies] = useState<Record<string, Strategy>>({});
  const [confirmAll, setConfirmAll] = useState(false);
  if (!enabled) return null;
  async function generate() {
    setLoading(true);
    const result = await generateClinicalAiSuggestion({
      appointmentId,
      text: input,
    });
    setLoading(false);
    if (result.error || !result.suggestion || !result.generationId)
      return toast.error(result.error || "Resposta inválida.");
    setSuggestion(result.suggestion);
    setGenerationId(result.generationId);
    setStrategies({});
    toast.success("Sugestão gerada. Revise todas as seções.");
  }
  function strategyFor(field: FieldName) {
    return (
      strategies[field] ?? (form.getValues(field)?.trim() ? "keep" : "replace")
    );
  }
  function add(items: typeof sections) {
    const accepted: string[] = [];
    for (const item of items) {
      const proposed = suggestion?.[item.key]?.trim();
      if (!proposed) continue;
      const current = form.getValues(item.field)?.trim() ?? "";
      const strategy = strategyFor(item.field);
      if (current && strategy === "keep") continue;
      form.setValue(
        item.field,
        current && strategy === "append"
          ? `${current}\n\n${item.label}: ${proposed}`
          : proposed,
        { shouldDirty: true, shouldValidate: true },
      );
      accepted.push(item.key);
    }
    if (!accepted.length)
      return toast.info(
        "Nenhuma seção foi adicionada. Ajuste as opções dos campos já preenchidos.",
      );
    if (generationId)
      void acceptClinicalAiSections({ generationId, sections: accepted });
    toast.success(
      `${accepted.length} seção(ões) adicionada(s) ao rascunho. Revise antes de salvar.`,
    );
  }
  async function discard() {
    if (generationId) {
      const result = await discardClinicalAiSuggestion(generationId);
      if (result.error) return toast.error(result.error);
    }
    setSuggestion(null);
    setGenerationId(null);
    setInput("");
    toast.success("Sugestão descartada.");
  }
  return (
    <Card className="border-primary/25 shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="size-5 text-primary" /> IA Clínica
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="block text-sm font-medium">
          Anotações ou transcrição da consulta
          <textarea
            rows={8}
            maxLength={50000}
            disabled={!canEdit || loading}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            className="mt-2 w-full resize-y rounded-lg border bg-background px-3 py-2 font-normal leading-6 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            placeholder="Cole a transcrição ou digite suas anotações clínicas..."
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={generate}
            disabled={!canEdit || loading || input.trim().length < 30}
          >
            {loading ? <Loader2 className="animate-spin" /> : <Sparkles />}{" "}
            {loading ? "Processando..." : "Gerar sugestão clínica"}
          </Button>
          <p className="text-xs text-muted-foreground">
            A IA pode cometer erros. Revise todas as informações antes de
            adicionar ao prontuário.
          </p>
        </div>
        {suggestion && (
          <div className="space-y-3 border-t pt-4">
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => setConfirmAll(true)}>
                <Plus /> Adicionar tudo ao prontuário
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  navigator.clipboard
                    .writeText(
                      sections
                        .filter((s) => suggestion[s.key])
                        .map((s) => `${s.label}\n${suggestion[s.key]}`)
                        .join("\n\n"),
                    )
                    .then(() => toast.success("Conteúdo copiado."))
                }
              >
                <Clipboard /> Copiar conteúdo
              </Button>
              <Button type="button" variant="outline" onClick={discard}>
                <Trash2 /> Descartar sugestão
              </Button>
            </div>
            {sections.map((item) => (
              <section key={item.key} className="rounded-xl border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label
                    className="text-sm font-semibold"
                    htmlFor={`ai-${item.key}`}
                  >
                    {item.label}
                  </label>
                  <div className="flex items-center gap-2">
                    {form.getValues(item.field)?.trim() && (
                      <select
                        aria-label={`Conflito em ${item.label}`}
                        className="rounded-md border bg-background px-2 py-1 text-xs"
                        value={strategyFor(item.field)}
                        onChange={(event) =>
                          setStrategies((value) => ({
                            ...value,
                            [item.field]: event.target.value as Strategy,
                          }))
                        }
                      >
                        <option value="keep">Manter atual</option>
                        <option value="append">Acrescentar sugestão</option>
                        <option value="replace">Substituir manualmente</option>
                      </select>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      type="button"
                      disabled={!suggestion[item.key]?.trim()}
                      onClick={() => add([item])}
                    >
                      Adicionar seção
                    </Button>
                  </div>
                </div>
                <textarea
                  id={`ai-${item.key}`}
                  rows={3}
                  value={suggestion[item.key]}
                  onChange={(event) =>
                    setSuggestion((current) =>
                      current
                        ? { ...current, [item.key]: event.target.value }
                        : current,
                    )
                  }
                  className="mt-2 w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm leading-6"
                  placeholder="Não informado na consulta."
                />
              </section>
            ))}
          </div>
        )}
      </CardContent>
      <Dialog open={confirmAll} onOpenChange={setConfirmAll}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar todas as seções?</DialogTitle>
            <DialogDescription>
              As sugestões serão inseridas apenas no rascunho. Campos existentes
              seguirão a opção de conflito selecionada e nada será salvo sem sua
              revisão.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <Button
              type="button"
              onClick={() => {
                add(sections);
                setConfirmAll(false);
              }}
            >
              Confirmar adição
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
