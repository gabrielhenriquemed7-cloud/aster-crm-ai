"use client";

import {
  Check,
  Clipboard,
  FileDown,
  Loader2,
  Pencil,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useState } from "react";

import {
  acceptAiPrescription,
  discardAiPrescription,
  generateAiPrescription,
} from "@/app/(dashboard)/consultas/prescription-ai-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PrescriptionSafetyWorkspace } from "@/components/medical-records/prescription-safety-workspace";
import type { ClinicalAiSuggestion } from "@/lib/ai/clinical-schema";
import type {
  AiMedication,
  AiPrescription,
} from "@/lib/ai/prescription-schema";
import type { RealtimeClinicalAnalysis } from "@/lib/ai/clinical-realtime-schema";
import type { MedicalRecordFormValues } from "@/lib/medical-records/schema";

const errors: Record<string, string> = {
  PRESCRIPTION_EMPTY_CONTEXT:
    "Não há contexto clínico suficiente para gerar uma sugestão.",
  PRESCRIPTION_AUTH_ERROR:
    "Não foi possível autenticar ou autorizar a geração.",
  PRESCRIPTION_QUOTA_ERROR: "O limite do serviço de IA foi atingido.",
  PRESCRIPTION_INVALID_RESPONSE: "A resposta da IA não pôde ser interpretada.",
  PRESCRIPTION_SCHEMA_ERROR:
    "A resposta da IA não corresponde ao formato esperado.",
  PRESCRIPTION_ERROR: "Não foi possível gerar a prescrição assistida.",
};

const medicationFields: Array<[keyof AiMedication, string]> = [
  ["nome", "Nome"],
  ["principioAtivo", "Princípio ativo"],
  ["apresentacao", "Apresentação"],
  ["dose", "Dose"],
  ["via", "Via"],
  ["frequencia", "Frequência"],
  ["duracao", "Duração"],
  ["orientacoes", "Orientações"],
  ["justificativa", "Justificativa"],
  ["alertas", "Alertas"],
];

function prescriptionText(prescription: AiPrescription) {
  const medications = prescription.medicamentos
    .map(
      (item, index) =>
        `${index + 1}. ${item.nome}${item.principioAtivo ? ` (${item.principioAtivo})` : ""}\n` +
        [
          item.apresentacao && `Apresentação: ${item.apresentacao}`,
          item.dose && `Dose: ${item.dose}`,
          item.via && `Via: ${item.via}`,
          item.frequencia && `Frequência: ${item.frequencia}`,
          item.duracao && `Duração: ${item.duracao}`,
          item.orientacoes && `Orientações: ${item.orientacoes}`,
          item.alertas && `Alertas: ${item.alertas}`,
        ]
          .filter(Boolean)
          .join("\n"),
    )
    .join("\n\n");
  const extras = [
    prescription.cuidadosGerais.length &&
      `Cuidados gerais:\n${prescription.cuidadosGerais.map((item) => `- ${item}`).join("\n")}`,
    prescription.orientacoesPaciente.length &&
      `Orientações ao paciente:\n${prescription.orientacoesPaciente.map((item) => `- ${item}`).join("\n")}`,
    prescription.observacoes.length &&
      `Observações:\n${prescription.observacoes.map((item) => `- ${item}`).join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  return [medications, extras].filter(Boolean).join("\n\n");
}

export function IntelligentPrescription({
  appointmentId,
  getFormValues,
  assistance,
  clinicalSuggestion,
  onInsert,
  patientAge,
}: {
  appointmentId: string;
  getFormValues: () => MedicalRecordFormValues;
  assistance: RealtimeClinicalAnalysis;
  clinicalSuggestion: ClinicalAiSuggestion | null;
  onInsert: (value: string) => void;
  patientAge: number | null;
}) {
  const [prescription, setPrescription] = useState<AiPrescription | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<number[]>([]);
  const [editing, setEditing] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function generate() {
    const values = getFormValues();
    setLoading(true);
    setError("");
    setSuccess("");
    const result = await generateAiPrescription({
      appointmentId,
      context: {
        anamnesis: [
          values.chief_complaint,
          values.pmh,
          values.family_history,
          values.social_history,
          clinicalSuggestion?.personalHistory,
          clinicalSuggestion?.reviewOfSystems,
        ]
          .filter(Boolean)
          .join("\n\n"),
        hpi: values.hpi || clinicalSuggestion?.hpi || "",
        soap: [
          clinicalSuggestion?.hpi,
          clinicalSuggestion?.physicalExam,
          clinicalSuggestion?.clinicalAssessment,
          clinicalSuggestion?.plan,
        ]
          .filter(Boolean)
          .join("\n\n"),
        physicalExam:
          values.physical_exam || clinicalSuggestion?.physicalExam || "",
        hypotheses: [
          values.assessment,
          clinicalSuggestion?.diagnosticHypotheses,
          ...assistance.hypotheses.map(
            (item) => `${item.name} — ${item.compatibility}`,
          ),
        ]
          .filter(Boolean)
          .join("\n"),
        suggestedCids:
          values.cid10 || clinicalSuggestion?.cid10Suggestions || "",
        allergies: values.allergies || clinicalSuggestion?.allergies || "",
        medications:
          values.medications || clinicalSuggestion?.medications || "",
        vitalSigns: values.vital_signs || clinicalSuggestion?.vitalSigns || "",
      },
    });
    setLoading(false);
    if (result.error || !result.prescription || !result.generationId) {
      const code = result.error || "PRESCRIPTION_ERROR";
      setError(`${code}: ${errors[code] || errors.PRESCRIPTION_ERROR}`);
      return;
    }
    setPrescription(result.prescription);
    setGenerationId(result.generationId);
    setAccepted([]);
    setEditing([]);
    setSuccess("Sugestão gerada. Revise e aceite cada medicamento desejado.");
  }

  function updateMedication(
    index: number,
    field: keyof AiMedication,
    value: string,
  ) {
    setPrescription((current) =>
      current
        ? {
            ...current,
            medicamentos: current.medicamentos.map((item, itemIndex) =>
              itemIndex === index ? { ...item, [field]: value } : item,
            ),
          }
        : current,
    );
  }

  function updateLines(
    field: "cuidadosGerais" | "orientacoesPaciente" | "observacoes",
    value: string,
  ) {
    setPrescription((current) =>
      current
        ? {
            ...current,
            [field]: value
              .split("\n")
              .map((item) => item.trim())
              .filter(Boolean),
          }
        : current,
    );
  }

  async function insert() {
    if (!prescription || !generationId || !accepted.length) return;
    const finalPrescription = {
      ...prescription,
      medicamentos: prescription.medicamentos.filter((_, index) =>
        accepted.includes(index),
      ),
    };
    const result = await acceptAiPrescription({
      generationId,
      prescription: finalPrescription,
    });
    if (result.error) {
      setError(
        `${result.error}: ${errors[result.error] || errors.PRESCRIPTION_ERROR}`,
      );
      return;
    }
    onInsert(prescriptionText(finalPrescription));
    setSuccess(
      "Medicamentos inseridos no formulário. Revise o prontuário antes de salvar ou emitir qualquer documento.",
    );
  }

  async function copy() {
    if (!prescription) return;
    await navigator.clipboard.writeText(prescriptionText(prescription));
    setSuccess("Prescrição sugerida copiada.");
  }

  async function clear() {
    if (generationId) await discardAiPrescription(generationId);
    setPrescription(null);
    setGenerationId(null);
    setAccepted([]);
    setEditing([]);
    setError("");
    setSuccess("");
  }

  return (
    <div className="space-y-4">
      <PrescriptionSafetyWorkspace
        getFormValues={getFormValues}
        patientAge={patientAge}
        onInsert={onInsert}
      />
      <div className="border-t pt-4">
      <div>
        <h4 className="font-semibold">Prescrição Inteligente</h4>
        <p className="text-sm text-muted-foreground">
          A IA sugere. O profissional decide.
        </p>
      </div>
      {!prescription && !loading && (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          Adicione informações clínicas para gerar uma prescrição assistida.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={loading}
          onClick={() => void generate()}
        >
          {loading ? (
            <Loader2 className="animate-spin" />
          ) : prescription ? (
            <RefreshCw />
          ) : (
            <Sparkles />
          )}
          {prescription ? "Regenerar" : "Gerar Prescrição"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!prescription || !accepted.length || loading}
          onClick={() => void insert()}
        >
          Inserir no prontuário
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!prescription}
          onClick={() => void copy()}
        >
          <Clipboard /> Copiar
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!prescription}
          onClick={() => void clear()}
        >
          <Trash2 /> Limpar
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled
          title="Disponível em breve"
        >
          <FileDown /> Exportar PDF · Disponível em breve
        </Button>
      </div>
      {loading && (
        <p
          role="status"
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <Loader2 className="size-4 animate-spin" /> Gerando prescrição
          assistida...
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="text-sm text-emerald-700">
          {success}
        </p>
      )}
      {prescription && (
        <div className="space-y-4">
          <label className="block text-sm font-medium">
            Diagnóstico provável
            <Input
              className="mt-1"
              value={prescription.diagnosticoProvavel}
              onChange={(event) =>
                setPrescription((current) =>
                  current
                    ? { ...current, diagnosticoProvavel: event.target.value }
                    : current,
                )
              }
            />
          </label>
          {prescription.medicamentos.map((medication, index) => (
            <article
              key={index}
              className={
                accepted.includes(index)
                  ? "rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-4"
                  : "rounded-xl border p-4"
              }
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <strong>{medication.nome || `Medicamento ${index + 1}`}</strong>
                <div className="flex flex-wrap gap-1">
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    onClick={() =>
                      setEditing((current) =>
                        current.includes(index)
                          ? current.filter((item) => item !== index)
                          : [...current, index],
                      )
                    }
                  >
                    <Pencil /> Editar
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    onClick={() => {
                      setPrescription((current) =>
                        current
                          ? {
                              ...current,
                              medicamentos: current.medicamentos.filter(
                                (_, itemIndex) => itemIndex !== index,
                              ),
                            }
                          : current,
                      );
                      setAccepted([]);
                    }}
                  >
                    <Trash2 /> Excluir
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant={accepted.includes(index) ? "secondary" : "outline"}
                    onClick={() =>
                      setAccepted((current) =>
                        current.includes(index)
                          ? current.filter((item) => item !== index)
                          : [...current, index],
                      )
                    }
                  >
                    <Check /> {accepted.includes(index) ? "Aceito" : "Aceitar"}
                  </Button>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {medicationFields.map(([field, label]) => (
                  <label
                    key={field}
                    className={
                      field === "orientacoes" ||
                      field === "justificativa" ||
                      field === "alertas"
                        ? "sm:col-span-2 text-xs font-medium"
                        : "text-xs font-medium"
                    }
                  >
                    {label}
                    {field === "orientacoes" ||
                    field === "justificativa" ||
                    field === "alertas" ? (
                      <textarea
                        rows={2}
                        disabled={!editing.includes(index)}
                        value={medication[field]}
                        onChange={(event) =>
                          updateMedication(index, field, event.target.value)
                        }
                        className="mt-1 w-full resize-y rounded-md border bg-background p-2 text-sm disabled:opacity-70"
                      />
                    ) : (
                      <Input
                        className="mt-1"
                        disabled={!editing.includes(index)}
                        value={medication[field]}
                        onChange={(event) =>
                          updateMedication(index, field, event.target.value)
                        }
                      />
                    )}
                  </label>
                ))}
              </div>
            </article>
          ))}
          {(
            [
              ["cuidadosGerais", "Cuidados gerais"],
              ["orientacoesPaciente", "Orientações ao paciente"],
              ["observacoes", "Observações"],
            ] as const
          ).map(([field, label]) => (
            <label key={field} className="block text-sm font-medium">
              {label}
              <textarea
                rows={3}
                value={prescription[field].join("\n")}
                onChange={(event) => updateLines(field, event.target.value)}
                className="mt-1 w-full resize-y rounded-md border bg-background p-2 text-sm"
              />
            </label>
          ))}
        </div>
      )}
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-800 dark:text-amber-200">
        Prescrição assistida por IA. Requer revisão, validação e assinatura
        profissional. As sugestões abaixo não foram verificadas por uma base
        farmacológica licenciada.
      </div>
      </div>
    </div>
  );
}
