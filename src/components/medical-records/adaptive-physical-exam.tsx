"use client";

import { Activity, ChevronDown, ChevronRight, HeartPulse } from "lucide-react";
import { useState } from "react";
import type { UseFormReturn } from "react-hook-form";

import { PhysicalExamSystemSection } from "@/components/medical-records/physical-exam-system-section";
import { PhysicalExamPreview } from "@/components/medical-records/physical-exam-preview";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePhysicalExam } from "@/hooks/use-physical-exam";
import {
  calculateBmi,
  templateObservationField,
  templateSystemDefinitions,
  templateVitalFields,
  vitalSignWarnings,
} from "@/lib/physical-exam/service";
import { ExamTemplateFactory } from "@/lib/physical-exam/template-factory";
import type { MedicalRecordFormValues } from "@/lib/medical-records/schema";

export function AdaptivePhysicalExam({
  form,
  disabled,
  aiPending,
  onManualEdit,
}: {
  form: UseFormReturn<MedicalRecordFormValues>;
  disabled: boolean;
  patientAge: number | null;
  aiPending: boolean;
  onManualEdit: (field: keyof MedicalRecordFormValues) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewText, setReviewText] = useState("");
  const template = ExamTemplateFactory.get("medical_clinic");
  const vitalFields = templateVitalFields(template);
  const systemDefinitions = templateSystemDefinitions(template);
  const observationField = templateObservationField(template);
  const {
    observations,
    preview,
    systems,
    vitals,
    setObservations,
    updateDescription,
    updateSystem,
    updateVital,
  } = usePhysicalExam(template, form.getValues("vital_signs") || "");
  const warnings = vitalSignWarnings(vitals);
  const registration = form.register("physical_exam");

  function handleVitalChange(
    key: Parameters<typeof updateVital>[0],
    value: string,
  ) {
    form.setValue("vital_signs", updateVital(key, value), {
      shouldDirty: true,
      shouldValidate: true,
    });
    onManualEdit("vital_signs");
  }

  function reviewCompleteExam() {
    setReviewText(preview);
    setReviewOpen(true);
  }

  function insert(mode: "append" | "replace") {
    const current = form.getValues("physical_exam")?.trim() || "";
    form.setValue(
      "physical_exam",
      mode === "append" && current
        ? `${current}\n\n${reviewText.trim()}`
        : reviewText.trim(),
      { shouldDirty: true, shouldValidate: true },
    );
    onManualEdit("physical_exam");
    setReviewOpen(false);
  }

  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      data-section="physical_exam"
      className={`group scroll-mt-6 overflow-hidden rounded-lg border bg-card ${
        aiPending ? "bg-primary/5 ring-2 ring-primary/35" : ""
      }`}
    >
      <summary className="grid h-10 cursor-pointer list-none grid-cols-[18px_minmax(140px,auto)_minmax(0,1fr)_18px] items-center gap-2.5 px-3 [&::-webkit-details-marker]:hidden">
        <Activity className="size-[18px] text-primary" aria-hidden="true" />
        <span className="truncate text-sm font-semibold">Exame Físico</span>
        <span className="hidden truncate text-[13px] text-muted-foreground sm:block">
          {Object.values(vitals).filter(Boolean).length} sinais vitais ·{" "}
          {Object.values(systems).filter((item) => item.status).length} sistemas
          avaliados
        </span>
        {open ? (
          <ChevronDown
            className="size-[18px] text-muted-foreground"
            aria-hidden="true"
          />
        ) : (
          <ChevronRight
            className="size-[18px] text-muted-foreground"
            aria-hidden="true"
          />
        )}
      </summary>

      <div className="border-t p-3">
        <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(17rem,0.42fr)]">
          <div className="min-w-0 space-y-2">
            <details className="group overflow-hidden rounded-lg border bg-card">
              <summary className="grid h-11 cursor-pointer list-none grid-cols-[20px_minmax(0,1fr)_18px] items-center gap-2 px-3 [&::-webkit-details-marker]:hidden">
                <HeartPulse
                  className="size-4 text-primary"
                  aria-hidden="true"
                />
                <span className="text-sm font-semibold">Sinais Vitais</span>
                <ChevronRight
                  className="size-[18px] text-muted-foreground transition-transform group-open:rotate-90"
                  aria-hidden="true"
                />
              </summary>
              <div className="space-y-3 border-t p-3">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 2xl:grid-cols-4">
                  {vitalFields.map((field) => (
                    <label key={field.id} className="text-xs font-medium">
                      {field.label}
                      <span className="mt-1 flex items-center rounded-md border bg-background focus-within:ring-2 focus-within:ring-ring/40">
                        <input
                          disabled={disabled}
                          inputMode={field.inputMode}
                          value={vitals[field.id] ?? ""}
                          placeholder={field.placeholder}
                          className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-sm outline-none"
                          onChange={(event) =>
                            handleVitalChange(field.id, event.target.value)
                          }
                        />
                        {field.unit && (
                          <span className="pr-2 text-[10px] text-muted-foreground">
                            {field.unit}
                          </span>
                        )}
                      </span>
                    </label>
                  ))}
                  <label className="text-xs font-medium">
                    IMC
                    <span className="mt-1 block rounded-md border bg-muted px-2 py-1.5 text-sm">
                      {calculateBmi(vitals) || "—"}
                    </span>
                  </label>
                </div>
                {warnings.length > 0 && (
                  <ul className="space-y-1 text-xs text-amber-700 dark:text-amber-300">
                    {warnings.map((warning) => (
                      <li key={warning}>• {warning}</li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-muted-foreground">
                  Validação exclusivamente estrutural. Os valores devem ser
                  conferidos pelo profissional.
                </p>
              </div>
            </details>

            {systemDefinitions.map((definition) => (
              <PhysicalExamSystemSection
                key={definition.id}
                definition={definition}
                disabled={disabled}
                value={systems[definition.id]}
                onStatusChange={(status) => updateSystem(definition.id, status)}
                onDescriptionChange={(description) =>
                  updateDescription(definition.id, description)
                }
              />
            ))}

            <details className="group overflow-hidden rounded-lg border bg-card">
              <summary className="grid h-11 cursor-pointer list-none grid-cols-[minmax(0,1fr)_18px] items-center gap-2 px-3 [&::-webkit-details-marker]:hidden">
                <span className="text-sm font-semibold">
                  Observações Gerais
                </span>
                <ChevronRight
                  className="size-[18px] text-muted-foreground transition-transform group-open:rotate-90"
                  aria-hidden="true"
                />
              </summary>
              <div className="border-t p-3">
                <textarea
                  rows={4}
                  disabled={disabled}
                  value={observations}
                  placeholder={observationField?.placeholder}
                  className="w-full resize-y overflow-hidden rounded-lg border bg-background px-3 py-2 text-sm leading-6 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  onInput={(event) => {
                    event.currentTarget.style.height = "auto";
                    event.currentTarget.style.height = `${event.currentTarget.scrollHeight}px`;
                  }}
                  onChange={(event) => setObservations(event.target.value)}
                />
              </div>
            </details>
          </div>

          <PhysicalExamPreview
            disabled={disabled}
            text={preview}
            onGenerate={reviewCompleteExam}
          />
        </div>

        <section className="mt-4 border-t pt-3">
          <label
            htmlFor="physical_exam"
            className="mb-1 block text-sm font-semibold"
          >
            Texto registrado no prontuário
          </label>
          <textarea
            id="physical_exam"
            rows={8}
            disabled={disabled}
            placeholder="Registre livremente os achados observados ou gere um exame estruturado."
            className="w-full resize-y overflow-hidden rounded-lg border bg-background px-3 py-2 text-sm leading-6 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            {...registration}
            onInput={(event) => {
              event.currentTarget.style.height = "auto";
              event.currentTarget.style.height = `${event.currentTarget.scrollHeight}px`;
            }}
            onChange={(event) => {
              void registration.onChange(event);
              onManualEdit("physical_exam");
            }}
          />
          {aiPending && (
            <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">
              Preenchido pelo ASTER Copilot — pendente de revisão
            </p>
          )}
        </section>
      </div>

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Revisar Exame Físico</DialogTitle>
            <DialogDescription>
              O texto somente será inserido após sua confirmação.
            </DialogDescription>
          </DialogHeader>
          <textarea
            rows={14}
            value={reviewText}
            className="w-full resize-y rounded-lg border bg-background p-3 text-sm leading-6"
            onChange={(event) => setReviewText(event.target.value)}
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="outline"
              disabled={!reviewText.trim()}
              onClick={() => insert("append")}
            >
              Adicionar ao final
            </Button>
            <Button
              type="button"
              disabled={!reviewText.trim()}
              onClick={() => insert("replace")}
            >
              Substituir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </details>
  );
}
