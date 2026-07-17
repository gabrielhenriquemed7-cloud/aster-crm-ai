"use client";

import { Activity, Check, ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { useWatch, type UseFormReturn } from "react-hook-form";

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
import type { MedicalRecordFormValues } from "@/lib/medical-records/schema";

type VitalKey = "pa" | "fc" | "fr" | "temperature" | "spo2" | "weight" | "height" | "pain";
type VitalValues = Record<VitalKey, string>;

const vitalLabels: Array<{ key: VitalKey; label: string; unit?: string; placeholder?: string }> = [
  { key: "pa", label: "PA", unit: "mmHg", placeholder: "120x80" },
  { key: "fc", label: "FC", unit: "bpm" },
  { key: "fr", label: "FR", unit: "irpm" },
  { key: "temperature", label: "Temperatura", unit: "°C" },
  { key: "spo2", label: "SpO₂", unit: "%" },
  { key: "weight", label: "Peso", unit: "kg" },
  { key: "height", label: "Altura", unit: "cm" },
  { key: "pain", label: "Dor", unit: "0–10" },
];

const systems = [
  { id: "general", label: "Estado Geral", chips: ["Bom estado geral", "Regular estado geral", "Mau estado geral", "Consciente", "Orientado", "Corado", "Hidratado"] },
  { id: "head", label: "Cabeça e Pescoço", chips: ["Pupilas isocóricas", "Mucosas coradas", "Orofaringe sem alterações", "Sem rigidez de nuca", "Linfonodos palpáveis"] },
  { id: "cardio", label: "Cardiovascular", chips: ["Bulhas normais", "Ritmo regular", "Sopro", "Perfusão preservada", "Edema", "Pulsos palpáveis"] },
  { id: "respiratory", label: "Respiratório", chips: ["MV presente bilateralmente", "MV diminuído", "Sibilos", "Roncos", "Estertores", "Sem ruídos adventícios", "Uso de musculatura acessória"] },
  { id: "abdomen", label: "Abdome", chips: ["Abdome flácido", "RHA presentes", "Dor à palpação", "Defesa", "Descompressão brusca dolorosa", "Sem massas palpáveis"] },
  { id: "neurologic", label: "Neurológico", chips: ["Consciente", "Orientado", "Pupilas isocóricas", "Força preservada", "Déficit focal", "Rigidez de nuca", "Glasgow 15"] },
  { id: "musculoskeletal", label: "Osteomuscular", chips: ["Amplitude preservada", "Dor à mobilização", "Edema articular", "Deformidade", "Marcha preservada"] },
  { id: "skin", label: "Pele", chips: ["Pele íntegra", "Lesões cutâneas", "Cianose", "Icterícia", "Petéquias"] },
  { id: "genitourinary", label: "Geniturinário", chips: ["Sem alterações externas", "Dor suprapúbica", "Giordano negativo", "Secreção", "Edema"] },
  { id: "extremities", label: "Extremidades", chips: ["Sem edema", "Perfusão preservada", "Enchimento capilar < 2 s", "Pulsos simétricos", "Cianose periférica"] },
  { id: "psychiatric", label: "Psiquiátrico", chips: ["Contato adequado", "Humor eutímico", "Discurso organizado", "Agitação", "Ideação suicida referida"] },
  { id: "other", label: "Outros", chips: [] },
] as const;

const pediatricChips = ["Estado geral", "Perfusão", "Fontanela", "Peso", "Estatura", "Perímetro cefálico", "Desenvolvimento", "Desconforto respiratório"];
const urgencyChips = ["ABCDE", "Glasgow", "Pupilas", "Via aérea", "Perfusão", "Pulsos", "PA", "Temperatura", "Dor"];

function emptyVitals(): VitalValues {
  return { pa: "", fc: "", fr: "", temperature: "", spo2: "", weight: "", height: "", pain: "" };
}

function parseVitals(text: string): VitalValues {
  const values = emptyVitals();
  const patterns: Array<[VitalKey, RegExp]> = [
    ["pa", /(?:^|\n)PA:\s*([^\n]*)/i], ["fc", /(?:^|\n)FC:\s*([^\n]*)/i],
    ["fr", /(?:^|\n)FR:\s*([^\n]*)/i], ["temperature", /(?:^|\n)(?:Temperatura|Temp):\s*([^\n]*)/i],
    ["spo2", /(?:^|\n)(?:SpO2|Sat):\s*([^\n]*)/i], ["weight", /(?:^|\n)Peso:\s*([^\n]*)/i],
    ["height", /(?:^|\n)Altura:\s*([^\n]*)/i], ["pain", /(?:^|\n)Dor:\s*([^\n]*)/i],
  ];
  patterns.forEach(([key, pattern]) => { values[key] = text.match(pattern)?.[1]?.replace(/\s*(?:mmHg|bpm|irpm|°C|%|kg|cm).*$/i, "").trim() ?? ""; });
  return values;
}

function bmiFor(vitals: VitalValues) {
  const weight = Number(vitals.weight.replace(",", "."));
  const height = Number(vitals.height.replace(",", ".")) / 100;
  return weight > 0 && height > 0 ? (weight / (height * height)).toFixed(1) : "";
}

function serializeVitals(vitals: VitalValues) {
  const bmi = bmiFor(vitals);
  const units: Partial<Record<VitalKey, string>> = { pa: "mmHg", fc: "bpm", fr: "irpm", temperature: "°C", spo2: "%", weight: "kg", height: "cm" };
  return vitalLabels
    .filter(({ key }) => vitals[key].trim())
    .map(({ key, label }) => `${label.replace("SpO₂", "SpO2")}: ${vitals[key].trim()}${units[key] ? ` ${units[key]}` : ""}`)
    .concat(bmi ? [`IMC: ${bmi} kg/m²`] : [])
    .join("\n");
}

function vitalWarnings(vitals: VitalValues) {
  const number = (key: VitalKey) => Number(vitals[key].replace(",", "."));
  const warnings: string[] = [];
  if (vitals.pa && !/^\d{2,3}\s*[x/]\s*\d{2,3}$/.test(vitals.pa)) warnings.push("Confira o formato da pressão arterial (ex.: 120x80).");
  if (vitals.fc && (number("fc") < 20 || number("fc") > 250)) warnings.push("A frequência cardíaca parece improvável.");
  if (vitals.fr && (number("fr") < 5 || number("fr") > 80)) warnings.push("A frequência respiratória parece improvável.");
  if (vitals.temperature && (number("temperature") < 30 || number("temperature") > 45)) warnings.push("A temperatura parece improvável.");
  if (vitals.spo2 && (number("spo2") < 50 || number("spo2") > 100)) warnings.push("A SpO₂ parece improvável.");
  if (vitals.pain && (number("pain") < 0 || number("pain") > 10)) warnings.push("A escala de dor esperada é de 0 a 10.");
  return warnings;
}

function contextualSystems(text: string) {
  const normalized = text.toLocaleLowerCase("pt-BR");
  const matches: string[] = [];
  if (/dor abdominal|abd[oô]men|náusea|v[oô]mito/.test(normalized)) matches.push("Abdome: Murphy, Giordano, defesa, RHA e sinais de irritação peritoneal.");
  if (/cefaleia|tontura|neurol[oó]g/.test(normalized)) matches.push("Neurológico: pupilas, Glasgow, pares cranianos, força e rigidez de nuca.");
  if (/dispneia|falta de ar|tosse/.test(normalized)) matches.push("Respiratório: ausculta, SpO₂, frequência respiratória e esforço respiratório.");
  if (/dor torácica|precordial/.test(normalized)) matches.push("Cardiovascular e respiratório: ausculta, pulsos, perfusão e sinais de congestão.");
  return matches;
}

function selectableButtonClass(selected: boolean) {
  return `cursor-pointer transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:scale-[0.98] focus-visible:ring-3 focus-visible:ring-ring/60 disabled:cursor-not-allowed ${
    selected
      ? "border-warning bg-warning/15 text-foreground shadow-[0_0_0_1px_color-mix(in_oklab,var(--warning)_25%,transparent)] hover:border-warning hover:bg-warning/25 dark:bg-warning/15 dark:hover:bg-warning/25"
      : "border-border bg-background text-foreground shadow-none hover:border-foreground/30 hover:bg-muted/70 dark:border-input dark:bg-input/30 dark:hover:bg-input/50"
  }`;
}

function SelectionCheck({ selected }: { selected: boolean }) {
  return selected ? (
    <Check className="size-3.5 text-warning" aria-hidden="true" />
  ) : null;
}

export function AdaptivePhysicalExam({ form, disabled, patientAge, aiPending, onManualEdit }: {
  form: UseFormReturn<MedicalRecordFormValues>;
  disabled: boolean;
  patientAge: number | null;
  aiPending: boolean;
  onManualEdit: (field: keyof MedicalRecordFormValues) => void;
}) {
  const [open, setOpen] = useState(false);
  const [vitals, setVitals] = useState(() => parseVitals(form.getValues("vital_signs") || ""));
  const [selected, setSelected] = useState<string[]>([]);
  const [maneuvers, setManeuvers] = useState<Record<string, string>>({});
  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] = useState("");
  const [urgency, setUrgency] = useState(false);
  const [chiefComplaint, hpi] = useWatch({ control: form.control, name: ["chief_complaint", "hpi"] });
  const suggestions = useMemo(() => contextualSystems(`${chiefComplaint || ""}\n${hpi || ""}`), [chiefComplaint, hpi]);
  const warnings = vitalWarnings(vitals);
  const isPediatric = patientAge !== null && patientAge < 18;
  const registration = form.register("physical_exam");

  function updateVital(key: VitalKey, value: string) {
    const next = { ...vitals, [key]: value };
    setVitals(next);
    form.setValue("vital_signs", serializeVitals(next), { shouldDirty: true, shouldValidate: true });
    onManualEdit("vital_signs");
  }

  function toggleFinding(value: string) {
    setSelected((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  }

  function openPreview() {
    const maneuverText = Object.entries(maneuvers).filter(([, value]) => value && value !== "Não avaliado").map(([name, value]) => `${name}: ${value}.`);
    const text = [...selected.map((item) => `${item}.`), ...maneuverText].join("\n");
    setPreview(text);
    setPreviewOpen(true);
  }

  function insert(mode: "append" | "replace") {
    const current = form.getValues("physical_exam")?.trim() || "";
    form.setValue("physical_exam", mode === "append" && current ? `${current}\n\n${preview.trim()}` : preview.trim(), { shouldDirty: true, shouldValidate: true });
    onManualEdit("physical_exam");
    setPreviewOpen(false);
  }

  return (
    <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)} data-section="physical_exam" className={`group overflow-hidden rounded-lg border bg-card ${aiPending ? "bg-primary/5 ring-2 ring-primary/35" : ""}`}>
      <summary className="grid h-12 cursor-pointer list-none grid-cols-[20px_minmax(150px,auto)_minmax(0,1fr)_20px] items-center gap-3 px-4 [&::-webkit-details-marker]:hidden">
        <Activity className="size-[18px] text-primary" aria-hidden="true" />
        <span className="truncate text-sm font-semibold">Exame Físico</span>
        <span className="hidden truncate text-[13px] text-muted-foreground sm:block">Sinais vitais, modelos assistidos, sistemas e texto livre.</span>
        {open ? <ChevronDown className="size-[18px] text-muted-foreground" /> : <ChevronRight className="size-[18px] text-muted-foreground" />}
      </summary>
      <div className="space-y-4 border-t p-3">
        <section aria-labelledby="vital-signs-title">
          <h4 id="vital-signs-title" className="mb-2 text-sm font-semibold">Sinais vitais</h4>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
            {vitalLabels.map((item) => (
              <label key={item.key} className="text-xs font-medium">{item.label}
                <span className="mt-1 flex items-center rounded-md border bg-background focus-within:ring-2 focus-within:ring-ring/40">
                  <input disabled={disabled} inputMode={item.key === "pa" ? "text" : "decimal"} value={vitals[item.key]} placeholder={item.placeholder} onChange={(event) => updateVital(item.key, event.target.value)} className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-sm outline-none" />
                  {item.unit && <span className="pr-2 text-[10px] text-muted-foreground">{item.unit}</span>}
                </span>
              </label>
            ))}
            <label className="text-xs font-medium">IMC
              <span className="mt-1 block rounded-md border bg-muted px-2 py-1.5 text-sm">{bmiFor(vitals) || "—"}</span>
            </label>
          </div>
          {warnings.length > 0 && <ul className="mt-2 space-y-1 text-xs text-amber-700">{warnings.map((warning) => <li key={warning}>• {warning} O salvamento permanece disponível.</li>)}</ul>}
        </section>

        {(suggestions.length > 0 || isPediatric) && <section className="rounded-lg border border-primary/20 bg-primary/5 p-3">
          <h4 className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="size-4 text-primary" /> Modelos sugeridos pelo contexto</h4>
          <ul className="mt-2 space-y-1 text-sm">{suggestions.map((item) => <li key={item}>• {item}</li>)}</ul>
          {isPediatric && <div className="mt-2"><p className="text-xs font-medium">Estrutura pediátrica</p><div className="mt-1 flex flex-wrap gap-1">{pediatricChips.map((item) => { const isSelected = selected.includes(item); return <Button key={item} type="button" size="xs" variant="outline" className={selectableButtonClass(isSelected)} aria-pressed={isSelected} disabled={disabled} onClick={() => toggleFinding(item)}>{item}<SelectionCheck selected={isSelected} /></Button>; })}</div></div>}
          <p className="mt-2 text-xs text-muted-foreground">Sugestões assistenciais. Nenhum achado será presumido ou inserido automaticamente.</p>
        </section>}

        <section>
          <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-semibold">Exame por sistemas</h4><Button type="button" size="xs" variant="outline" className={selectableButtonClass(urgency)} aria-pressed={urgency} disabled={disabled} onClick={() => setUrgency((value) => !value)}>Modelo de urgência<SelectionCheck selected={urgency} /></Button></div>
          {urgency && <div className="mt-2 flex flex-wrap gap-1 rounded-lg border p-2">{urgencyChips.map((item) => { const isSelected = selected.includes(item); return <Button key={item} type="button" size="xs" variant="outline" className={selectableButtonClass(isSelected)} aria-pressed={isSelected} onClick={() => toggleFinding(item)}>{item}<SelectionCheck selected={isSelected} /></Button>; })}</div>}
          <div className="mt-2 space-y-2">{systems.map((system) => <details key={system.id} className="rounded-md border"><summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium">{system.label}</summary><div className="flex flex-wrap gap-1 border-t p-2">{system.chips.length ? system.chips.map((chip) => { const isSelected = selected.includes(chip); return <Button key={chip} type="button" size="xs" variant="outline" className={selectableButtonClass(isSelected)} aria-pressed={isSelected} disabled={disabled} onClick={() => toggleFinding(chip)}>{chip}<SelectionCheck selected={isSelected} /></Button>; }) : <input disabled={disabled} placeholder="Outro achado" className="w-full rounded-md border bg-background px-2 py-1.5 text-sm" onKeyDown={(event) => { if (event.key === "Enter" && event.currentTarget.value.trim()) { event.preventDefault(); toggleFinding(event.currentTarget.value.trim()); event.currentTarget.value = ""; } }} />}</div></details>)}</div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          {[{ name: "Murphy", options: ["Não avaliado", "Negativo", "Positivo"] }, { name: "Giordano", options: ["Não avaliado", "Negativo", "Positivo D", "Positivo E", "Bilateral"] }].map((maneuver) => <fieldset key={maneuver.name} className="rounded-lg border p-3"><legend className="px-1 text-sm font-semibold">{maneuver.name}</legend><div className="flex flex-wrap gap-2">{maneuver.options.map((option) => <label key={option} className="flex items-center gap-1 text-xs"><input type="radio" name={maneuver.name} checked={(maneuvers[maneuver.name] || "Não avaliado") === option} disabled={disabled} onChange={() => setManeuvers((current) => ({ ...current, [maneuver.name]: option }))} />{option}</label>)}</div></fieldset>)}
        </section>

        <div className="flex justify-end"><Button type="button" size="sm" variant="outline" disabled={disabled || (!selected.length && !Object.values(maneuvers).some((value) => value !== "Não avaliado"))} onClick={openPreview}>Revisar texto selecionado</Button></div>
        <section><label htmlFor="physical_exam" className="mb-1 block text-sm font-semibold">Editor de texto livre</label><textarea id="physical_exam" rows={8} disabled={disabled} placeholder="Registre livremente os achados observados." className="w-full resize-none overflow-hidden rounded-lg border bg-background px-3 py-2 text-sm leading-6 outline-none focus-visible:ring-3 focus-visible:ring-ring/50" {...registration} onInput={(event) => { event.currentTarget.style.height = "auto"; event.currentTarget.style.height = `${event.currentTarget.scrollHeight}px`; }} onChange={(event) => { void registration.onChange(event); onManualEdit("physical_exam"); }} />{aiPending && <p className="mt-2 text-xs font-medium text-amber-700">Preenchido pelo ASTER Copilot — pendente de revisão</p>}</section>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}><DialogContent><DialogHeader><DialogTitle>Prévia do exame físico</DialogTitle><DialogDescription>Edite o rascunho e escolha como levá-lo ao campo Exame Físico.</DialogDescription></DialogHeader><textarea rows={10} value={preview} onChange={(event) => setPreview(event.target.value)} className="w-full rounded-lg border bg-background p-3 text-sm" /><DialogFooter><DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose><Button type="button" variant="outline" disabled={!preview.trim()} onClick={() => insert("append")}>Adicionar ao final</Button><Button type="button" disabled={!preview.trim()} onClick={() => insert("replace")}>Substituir</Button></DialogFooter></DialogContent></Dialog>
    </details>
  );
}
