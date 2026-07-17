"use client";

import { AlertTriangle, Calculator, Check, Copy, Pencil, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { MedicalRecordFormValues } from "@/lib/medical-records/schema";
import {
  availablePrescriptionContext,
  emptyPrescriptionDraftItem,
  exactDuplicateMessages,
  prescriptionItemText,
  structuralIssues,
  textualAllergyMatches,
  unconfiguredMedicationProviders,
  type PrescriptionDraftItem,
} from "@/lib/prescriptions/safety";

const itemFields: Array<[keyof PrescriptionDraftItem, string]> = [
  ["medication", "Medicamento"], ["activeIngredient", "Princípio ativo (se informado)"], ["presentation", "Apresentação"], ["concentration", "Concentração"], ["dose", "Dose"], ["unit", "Unidade"], ["route", "Via"], ["frequency", "Frequência"], ["duration", "Duração"], ["quantity", "Quantidade"], ["instructions", "Instruções ao paciente"], ["indication", "Indicação"], ["observations", "Observações"],
];

const reviewLabels = ["Paciente confirmado", "Alergias revisadas", "Medicamentos revisados", "Dose e unidade revisadas", "Via revisada", "Frequência revisada", "Duração revisada", "Quantidade revisada", "Instruções revisadas", "Duplicidades textuais revisadas", "Limitações da análise reconhecidas"];

export function PrescriptionSafetyWorkspace({ getFormValues, patientAge, onInsert }: { getFormValues: () => MedicalRecordFormValues; patientAge: number | null; onInsert: (value: string) => void }) {
  const values = getFormValues();
  const context = availablePrescriptionContext(values, patientAge);
  const [items, setItems] = useState<PrescriptionDraftItem[]>([]);
  const [editing, setEditing] = useState<PrescriptionDraftItem>(() => emptyPrescriptionDraftItem());
  const [reviewed, setReviewed] = useState<string[]>([]);
  const [referenceMgKg, setReferenceMgKg] = useState("");
  const [calculationWeight, setCalculationWeight] = useState(context.weight ? String(context.weight) : "");
  const [maxDose, setMaxDose] = useState("");
  const [desiredMg, setDesiredMg] = useState("");
  const [mgPerMl, setMgPerMl] = useState("");
  const missing = Object.entries(context).filter(([, value]) => value === null).map(([key]) => ({ age: "Idade", weight: "Peso", allergies: "Alergias", medications: "Medicamentos em uso", indication: "Hipótese ou indicação", pregnancyLactation: "Gestação/lactação", renalFunction: "Função renal", hepaticFunction: "Função hepática" })[key as keyof typeof context]);
  const doseReference = Number(referenceMgKg.replace(",", "."));
  const weight = Number(calculationWeight.replace(",", "."));
  const maximum = Number(maxDose.replace(",", "."));
  const calculatedDose = doseReference > 0 && weight > 0 ? doseReference * weight : null;
  const limitedDose = calculatedDose !== null && maximum > 0 ? Math.min(calculatedDose, maximum) : calculatedDose;
  const desired = Number(desiredMg.replace(",", "."));
  const concentration = Number(mgPerMl.replace(",", "."));
  const volume = desired > 0 && concentration > 0 ? desired / concentration : null;
  const checks = items.flatMap((item) => structuralIssues(item).map((message) => `${item.medication || "Item"}: ${message}`).concat(exactDuplicateMessages(item, items, values.medications || "").map((message) => `${item.medication || "Item"}: ${message}`)));

  function patch(field: keyof PrescriptionDraftItem, value: string | boolean) { setEditing((current) => ({ ...current, [field]: value })); }
  function addItem() { if (!editing.medication.trim()) return; setItems((current) => [...current, editing]); setEditing(emptyPrescriptionDraftItem()); setReviewed([]); }
  function editItem(item: PrescriptionDraftItem) { setEditing(item); setItems((current) => current.filter((entry) => entry.id !== item.id)); setReviewed([]); }
  function insertDraft() { if (!items.length || reviewed.length !== reviewLabels.length) return; onInsert(items.map(prescriptionItemText).join("\n\n")); }

  return <div className="space-y-4">
    <section className="rounded-lg border p-3"><h4 className="text-sm font-semibold">1. Dados clínicos disponíveis</h4><dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2"><div><dt className="font-medium">Idade</dt><dd>{context.age === null ? "Não informado" : `${context.age} anos`}</dd></div><div><dt className="font-medium">Peso</dt><dd>{context.weight === null ? "Não informado" : `${context.weight} kg`}</dd></div><div><dt className="font-medium">Alergias</dt><dd className="whitespace-pre-wrap">{context.allergies || "Não informado"}</dd></div><div><dt className="font-medium">Medicamentos em uso</dt><dd className="whitespace-pre-wrap">{context.medications || "Não informado"}</dd></div><div><dt className="font-medium">Hipótese ou indicação</dt><dd>{context.indication || "Não informado"}</dd></div><div><dt className="font-medium">Gestação/lactação</dt><dd>{context.pregnancyLactation || "Não informado"}</dd></div><div><dt className="font-medium">Função renal</dt><dd>{context.renalFunction || "Não informado"}</dd></div><div><dt className="font-medium">Função hepática</dt><dd>{context.hepaticFunction || "Não informado"}</dd></div></dl></section>
    {missing.length > 0 && <section className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3"><h4 className="text-sm font-semibold">2. Dados ainda não informados</h4><p className="mt-1 text-xs text-muted-foreground">A necessidade depende do medicamento e da avaliação profissional.</p><ul className="mt-2 text-xs">{missing.map((item) => <li key={item}>• {item}: Não informado</li>)}</ul></section>}

    <section className="space-y-3 rounded-lg border p-3"><div><h4 className="text-sm font-semibold">3. Pesquisa e inclusão manual</h4><p className="text-xs text-muted-foreground">Fonte farmacológica não configurada. Digite manualmente; nenhum campo farmacológico será completado.</p></div><div className="grid gap-2 sm:grid-cols-2">{itemFields.map(([field, label]) => <label key={field} className={field === "instructions" || field === "observations" ? "sm:col-span-2 text-xs font-medium" : "text-xs font-medium"}>{label}<Input className="mt-1" value={String(editing[field])} onChange={(event) => patch(field, event.target.value)} /></label>)}</div>{textualAllergyMatches(editing, context.allergies || "").length > 0 && <div id="manual-allergy-alert" role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive"><ShieldAlert className="mr-1 inline size-4" /> Alergia registrada contendo: {textualAllergyMatches(editing, context.allergies || "").join(", ")}. Esta é apenas correspondência textual. Revise antes de prosseguir.<label className="mt-2 flex items-center gap-2 text-foreground"><input type="checkbox" checked={editing.textualAllergyConfirmed} onChange={(event) => patch("textualAllergyConfirmed", event.target.checked)} /> Confirmo que revisei este alerta textual.</label></div>}<Button type="button" size="sm" disabled={!editing.medication.trim() || (textualAllergyMatches(editing, context.allergies || "").length > 0 && !editing.textualAllergyConfirmed)} onClick={addItem}><Plus /> Adicionar ao rascunho</Button></section>

    <section className="space-y-2 rounded-lg border p-3"><h4 className="text-sm font-semibold">4. Rascunho atual</h4>{items.length ? items.map((item, index) => { const allergies = textualAllergyMatches(item, context.allergies || ""); const duplicates = exactDuplicateMessages(item, items, values.medications || ""); return <article key={item.id} className="rounded-md border p-3 text-xs"><div className="flex items-start justify-between gap-2"><div><strong>{index + 1}. {item.medication}</strong><p>{item.dose} {item.unit} · {item.route} · {item.frequency} · {item.duration}</p></div><div className="flex gap-1"><Button type="button" size="icon-xs" variant="ghost" aria-label={`Editar ${item.medication}`} onClick={() => editItem(item)}><Pencil /></Button><Button type="button" size="icon-xs" variant="ghost" aria-label={`Duplicar ${item.medication}`} onClick={() => setItems((current) => [...current, { ...item, id: crypto.randomUUID(), reviewed: false }])}><Copy /></Button><Button type="button" size="icon-xs" variant="ghost" aria-label={`Remover ${item.medication}`} onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))}><Trash2 /></Button></div></div>{allergies.length > 0 && <p className="mt-2 text-destructive"><AlertTriangle className="mr-1 inline size-3" /> Correspondência textual com alergia: {allergies.join(", ")}.</p>}{duplicates.map((message) => <p key={message} className="mt-1 text-amber-700">• {message}</p>)}<label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={item.reviewed} onChange={(event) => setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, reviewed: event.target.checked } : entry))} /> Item revisado pelo profissional</label></article>; }) : <p className="text-xs text-muted-foreground">Nenhum item no rascunho.</p>}</section>

    <section className="rounded-lg border p-3"><h4 className="text-sm font-semibold">5–7. Verificações estruturais, alergias e duplicidades</h4>{checks.length ? <ul className="mt-2 text-xs text-amber-700" aria-live="polite">{checks.map((item) => <li key={item}>• {item}</li>)}</ul> : <p className="mt-2 text-xs text-muted-foreground">A análise farmacológica não está disponível. As verificações aqui são exclusivamente documentais e textuais.</p>}</section>

    <section className="space-y-3 rounded-lg border p-3"><h4 className="flex items-center gap-2 text-sm font-semibold"><Calculator className="size-4" /> 8. Cálculos transparentes</h4><p className="text-xs text-muted-foreground">A dose de referência deve ser definida e validada pelo profissional.</p><div className="grid gap-2 sm:grid-cols-3"><label className="text-xs font-medium">Dose de referência (mg/kg/dose)<Input className="mt-1" inputMode="decimal" value={referenceMgKg} onChange={(event) => setReferenceMgKg(event.target.value)} /></label><label className="text-xs font-medium">Peso utilizado (kg)<Input className="mt-1" inputMode="decimal" value={calculationWeight} onChange={(event) => setCalculationWeight(event.target.value)} /></label><label className="text-xs font-medium">Dose máxima informada (mg)<Input className="mt-1" inputMode="decimal" value={maxDose} onChange={(event) => setMaxDose(event.target.value)} /></label></div>{referenceMgKg && !weight && <p className="text-xs text-amber-700">Peso necessário para executar o cálculo matemático.</p>}{calculatedDose !== null && <div className="rounded-md bg-muted p-2 text-xs"><p>Fórmula: {doseReference} mg/kg/dose × {weight} kg = {calculatedDose.toFixed(2)} mg/dose.</p>{maximum > 0 && <p>Máximo informado: {maximum} mg. Resultado limitado matematicamente: {limitedDose?.toFixed(2)} mg/dose.</p>}<p>Nenhum arredondamento clínico foi aplicado.</p></div>}<div className="grid gap-2 sm:grid-cols-2"><label className="text-xs font-medium">Dose desejada informada (mg)<Input className="mt-1" inputMode="decimal" value={desiredMg} onChange={(event) => setDesiredMg(event.target.value)} /></label><label className="text-xs font-medium">Concentração informada (mg/mL)<Input className="mt-1" inputMode="decimal" value={mgPerMl} onChange={(event) => setMgPerMl(event.target.value)} /></label></div>{mgPerMl && concentration <= 0 && <p className="text-xs text-destructive">Informe uma concentração numérica maior que zero.</p>}{volume !== null && <p className="rounded-md bg-muted p-2 text-xs">Volume por dose = {desired} mg ÷ {concentration} mg/mL = {volume.toFixed(2)} mL.</p>}</section>

    <section className="space-y-3 rounded-lg border p-3"><h4 className="text-sm font-semibold">9. Revisão final</h4><div className="grid gap-2 sm:grid-cols-2">{reviewLabels.map((label) => <label key={label} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={reviewed.includes(label)} onChange={(event) => setReviewed((current) => event.target.checked ? [...current, label] : current.filter((item) => item !== label))} /> {label}</label>)}</div><Button type="button" size="sm" disabled={!items.length || items.some((item) => !item.reviewed) || reviewed.length !== reviewLabels.length || checks.length > 0} onClick={insertDraft}><Check /> Inserir rascunho revisado no prontuário</Button></section>

    <section className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs"><strong>10. Limitações da base</strong><p className="mt-1">Esta versão não possui base farmacológica licenciada para análise completa de interações, contraindicações ou recomendações terapêuticas.</p><ul className="mt-2"><li>• Conhecimento medicamentoso: {unconfiguredMedicationProviders.medicationKnowledge.status === "not_configured" ? "Fonte farmacológica não configurada" : "Configurado"}.</li><li>• Interações, contraindicações e ajustes: Análise não disponível.</li><li>• Gestação/lactação e referências de dose: Requer revisão profissional.</li></ul></section>
  </div>;
}
