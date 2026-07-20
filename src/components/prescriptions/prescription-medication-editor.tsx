"use client";

import { AlertTriangle, Check, ChevronDown, ChevronRight, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { createEmptyMedication } from "@/lib/prescription-engine/prescription-factory";
import {
  durationOptions,
  frequencyOptions,
  optionsForForm,
  suggestedQuantity,
} from "@/lib/prescription-engine/structured-options";
import type {
  PosologyMode,
  PrescriptionMedication,
} from "@/lib/prescription-engine/types";

const posologyModes: Array<[PosologyMode, string]> = [
  ["single_use", "Uso único"],
  ["continuous", "Uso contínuo"],
  ["as_needed", "Se necessário (SOS)"],
  ["alternate_days", "Dias alternados"],
  ["custom_schedule", "Horários personalizados"],
];

export function PrescriptionMedicationEditor({
  disabled,
  initialMedication,
  onSave,
  onCancel,
}: {
  disabled: boolean;
  initialMedication?: PrescriptionMedication;
  onSave: (medication: PrescriptionMedication) => void;
  onCancel?: () => void;
}) {
  const [medication, setMedication] = useState(
    initialMedication ?? createEmptyMedication,
  );
  const [manual, setManual] = useState(Boolean(initialMedication?.manualEntry));
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const formOptions = useMemo(
    () => optionsForForm(medication.pharmaceuticalForm),
    [medication.pharmaceuticalForm],
  );

  const posologyComplete = Boolean(
    medication.dose.trim() &&
      medication.route.trim() &&
      medication.frequency.trim(),
  );
  const durationComplete = Boolean(
    medication.duration.trim() && medication.quantity.trim(),
  );
  const orientationComplete = Boolean(medication.notes.trim());

  function patch(
    field: keyof PrescriptionMedication,
    value: string | boolean,
  ) {
    setMedication((current) => ({ ...current, [field]: value }));
  }

  function selectFrequency(code: string, label: string) {
    setMedication((current) => {
      const next = { ...current, frequencyCode: code, frequency: label };
      const quantity = suggestedQuantity(
        next.dose,
        next.frequencyCode,
        next.durationCode,
      );
      return quantity ? { ...next, quantity } : next;
    });
  }

  function selectDuration(code: string, label: string) {
    setMedication((current) => {
      const next = { ...current, durationCode: code, duration: label };
      const quantity = suggestedQuantity(
        next.dose,
        next.frequencyCode,
        next.durationCode,
      );
      return quantity ? { ...next, quantity } : next;
    });
  }

  function save() {
    setAttempted(true);
    if (
      !medication.name.trim() ||
      !posologyComplete ||
      !durationComplete ||
      !orientationComplete
    )
      return;
    onSave(medication);
  }

  return (
    <div className="space-y-3 rounded-lg border bg-background p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">
            {medication.manualEntry ? "Item manual" : "Apresentação selecionada"}
          </p>
          <h4 className="truncate text-sm font-semibold">
            {[medication.name, medication.concentration]
              .filter(Boolean)
              .join(" ")}
          </h4>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {[medication.pharmaceuticalForm, medication.presentation]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        {onCancel && (
          <Button type="button" size="icon-sm" variant="ghost" onClick={onCancel} aria-label="Cancelar edição">
            <X />
          </Button>
        )}
      </div>

      {medication.manualEntry && (
        <p className="flex gap-2 rounded-md bg-amber-500/10 p-2 text-xs">
          <AlertTriangle className="size-4 shrink-0 text-amber-600" />
          Apresentação não estruturada. Revise todos os campos manualmente.
        </p>
      )}

      <ProgressiveSection title="Posologia" complete={posologyComplete}>
        {!manual && (
          <div className="space-y-3">
            <OptionGroup
              label="Dose"
              options={formOptions.doseOptions}
              value={medication.dose}
              onSelect={(value) => patch("dose", value)}
              empty="Informe a dose em Personalizar prescrição."
            />
            <OptionGroup
              label="Via"
              options={formOptions.routes}
              value={medication.route}
              onSelect={(value) => patch("route", value)}
              empty="A forma não possui via configurada."
            />
            <OptionGroup
              label="Frequência"
              options={frequencyOptions.map((item) => item.label)}
              value={medication.frequency}
              onSelect={(label) => {
                const option = frequencyOptions.find((item) => item.label === label);
                if (option) selectFrequency(option.code, option.label);
              }}
            />
          </div>
        )}
        {manual && (
          <div className="grid gap-2 sm:grid-cols-3">
            <Field label="Dose" value={medication.dose} onChange={(value) => patch("dose", value)} disabled={disabled} error={attempted && !medication.dose.trim()} />
            <Field label="Via" value={medication.route} onChange={(value) => { patch("route", value); patch("routeOverride", true); }} disabled={disabled} error={attempted && !medication.route.trim()} />
            <Field label="Frequência" value={medication.frequency} onChange={(value) => patch("frequency", value)} disabled={disabled} error={attempted && !medication.frequency.trim()} />
          </div>
        )}
        <Button type="button" size="xs" variant="ghost" className="mt-2" onClick={() => setManual((value) => !value)}>
          {manual ? "Usar opções estruturadas" : "Personalizar prescrição"}
        </Button>
      </ProgressiveSection>

      {posologyComplete && (
        <ProgressiveSection title="Duração e quantidade" complete={durationComplete}>
          {!manual && (
            <OptionGroup
              label="Duração"
              options={durationOptions.map((item) => item.label)}
              value={medication.duration}
              onSelect={(label) => {
                const option = durationOptions.find((item) => item.label === label);
                if (option) selectDuration(option.code, option.label);
              }}
            />
          )}
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {manual && <Field label="Duração" value={medication.duration} onChange={(value) => patch("duration", value)} disabled={disabled} error={attempted && !medication.duration.trim()} />}
            <Field label="Quantidade sugerida" value={medication.quantity} onChange={(value) => patch("quantity", value)} disabled={disabled} error={attempted && !medication.quantity.trim()} />
          </div>
          {suggestedQuantity(medication.dose, medication.frequencyCode, medication.durationCode) && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Sugestão matemática revisável; confirme a quantidade antes de salvar.
            </p>
          )}
        </ProgressiveSection>
      )}

      {durationComplete && (
        <ProgressiveSection title="Orientações" complete={orientationComplete}>
          <OptionGroup
            label="Orientações compatíveis com a forma"
            options={formOptions.orientationOptions}
            value={medication.notes}
            onSelect={(value) => patch("notes", value)}
            empty="Nenhuma orientação validada para esta forma."
          />
          <label className="mt-2 block text-xs font-medium">
            Adicionar orientação personalizada
            <textarea
              aria-invalid={attempted && !orientationComplete}
              className="mt-1 min-h-16 w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              disabled={disabled}
              value={medication.notes}
              onChange={(event) => patch("notes", event.target.value)}
            />
          </label>
        </ProgressiveSection>
      )}

      {orientationComplete && (
        <div className="rounded-md border">
          <button type="button" className="flex h-9 w-full items-center justify-between px-3 text-left text-xs font-medium" aria-expanded={detailsOpen} onClick={() => setDetailsOpen((value) => !value)}>
            Mais opções <ChevronDown className={`size-4 transition-transform ${detailsOpen ? "rotate-180" : ""}`} />
          </button>
          {detailsOpen && (
            <div className="grid gap-2 border-t p-3 sm:grid-cols-2">
              <Field label="Princípio ativo" value={medication.activeIngredient} onChange={(value) => patch("activeIngredient", value)} disabled={disabled} />
              <Field label="Concentração" value={medication.concentration} onChange={(value) => patch("concentration", value)} disabled={disabled} />
              <Field label="Forma farmacêutica" value={medication.pharmaceuticalForm} onChange={(value) => patch("pharmaceuticalForm", value)} disabled={disabled} />
              <Field label="Horários" value={medication.schedule} onChange={(value) => patch("schedule", value)} disabled={disabled} />
              <label className="text-xs font-medium sm:col-span-2">Regime de uso<Select className="mt-1" disabled={disabled} value={medication.posologyMode} onChange={(event) => patch("posologyMode", event.target.value)}>{posologyModes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label>
            </div>
          )}
        </div>
      )}

      <Button type="button" size="sm" disabled={disabled || !orientationComplete} onClick={save}>
        <Check /> Adicionar à prescrição
      </Button>
    </div>
  );
}

function OptionGroup({ label, options, value, onSelect, empty }: { label: string; options: string[]; value: string; onSelect: (value: string) => void; empty?: string }) {
  return <div><p className="mb-1.5 text-xs font-medium">{label}</p>{options.length ? <div className="flex flex-wrap gap-1.5">{options.map((option) => <Button key={option} type="button" size="xs" variant={value === option ? "secondary" : "outline"} aria-pressed={value === option} onClick={() => onSelect(option)}>{option}</Button>)}</div> : <p className="text-xs text-muted-foreground">{empty}</p>}</div>;
}

function Field({ label, value, onChange, disabled, error = false }: { label: string; value: string; onChange: (value: string) => void; disabled: boolean; error?: boolean }) {
  const id = `prescription-${label.toLowerCase().replaceAll(" ", "-")}`;
  return <label className="text-xs font-medium">{label}<Input id={id} className="mt-1" aria-invalid={error} disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} />{error && <span className="mt-1 block text-xs text-destructive">Campo obrigatório.</span>}</label>;
}

function ProgressiveSection({ title, complete, children }: { title: string; complete: boolean; children: React.ReactNode }) {
  return <section className="border-t pt-3"><div className="mb-2 flex items-center gap-2 text-xs font-semibold">{complete ? <Check className="size-4 text-emerald-600" /> : <ChevronRight className="size-4 text-primary" />}{title}{complete && <span className="font-normal text-muted-foreground">preenchida</span>}</div>{children}</section>;
}
