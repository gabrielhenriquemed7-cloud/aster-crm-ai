import type { MedicalRecordFormValues } from "@/lib/medical-records/schema";

export type PrescriptionDraftItem = {
  id: string;
  medication: string;
  activeIngredient: string;
  presentation: string;
  concentration: string;
  dose: string;
  unit: string;
  route: string;
  frequency: string;
  duration: string;
  quantity: string;
  instructions: string;
  indication: string;
  observations: string;
  origin: "manual" | "assisted";
  reviewed: boolean;
  textualAllergyConfirmed: boolean;
};

export type ProviderStatus<T> =
  | { status: "configured"; data: T; source: string }
  | { status: "not_configured"; data: null; source: null };

export interface MedicationKnowledgeProvider { search(query: string): Promise<ProviderStatus<unknown[]>>; }
export interface DrugInteractionProvider { check(items: PrescriptionDraftItem[]): Promise<ProviderStatus<unknown[]>>; }
export interface ContraindicationProvider { check(item: PrescriptionDraftItem): Promise<ProviderStatus<unknown[]>>; }
export interface DoseReferenceProvider { find(activeIngredient: string): Promise<ProviderStatus<unknown>>; }
export interface RenalAdjustmentProvider { check(item: PrescriptionDraftItem): Promise<ProviderStatus<unknown>>; }
export interface HepaticAdjustmentProvider { check(item: PrescriptionDraftItem): Promise<ProviderStatus<unknown>>; }
export interface PregnancyLactationProvider { check(item: PrescriptionDraftItem): Promise<ProviderStatus<unknown>>; }

export const unconfiguredMedicationProviders = {
  medicationKnowledge: { status: "not_configured", data: null, source: null },
  drugInteraction: { status: "not_configured", data: null, source: null },
  contraindication: { status: "not_configured", data: null, source: null },
  doseReference: { status: "not_configured", data: null, source: null },
  renalAdjustment: { status: "not_configured", data: null, source: null },
  hepaticAdjustment: { status: "not_configured", data: null, source: null },
  pregnancyLactation: { status: "not_configured", data: null, source: null },
} as const;

export function emptyPrescriptionDraftItem(): PrescriptionDraftItem {
  return { id: crypto.randomUUID(), medication: "", activeIngredient: "", presentation: "", concentration: "", dose: "", unit: "", route: "", frequency: "", duration: "", quantity: "", instructions: "", indication: "", observations: "", origin: "manual", reviewed: false, textualAllergyConfirmed: false };
}

export function normalizeMedicationText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g, " ").trim();
}

function meaningfulTerms(value: string) {
  return normalizeMedicationText(value).split(" ").filter((term) => term.length >= 3);
}

export function textualAllergyMatches(item: PrescriptionDraftItem, allergies: string) {
  const allergyText = normalizeMedicationText(allergies);
  if (!allergyText) return [];
  return [...new Set([...meaningfulTerms(item.medication), ...meaningfulTerms(item.activeIngredient)].filter((term) => allergyText.includes(term)))];
}

export function exactDuplicateMessages(item: PrescriptionDraftItem, items: PrescriptionDraftItem[], currentMedications: string) {
  const name = normalizeMedicationText(item.medication);
  const active = normalizeMedicationText(item.activeIngredient);
  const messages: string[] = [];
  if (name && items.some((other) => other.id !== item.id && normalizeMedicationText(other.medication) === name)) messages.push("Possível item duplicado por correspondência exata do nome no rascunho.");
  if (active && items.some((other) => other.id !== item.id && normalizeMedicationText(other.activeIngredient) === active)) messages.push("Possível item duplicado por correspondência exata do princípio ativo informado.");
  if (name && normalizeMedicationText(currentMedications).includes(name)) messages.push("Medicamento com o mesmo nome aparece nos medicamentos em uso. Revise.");
  return messages;
}

export function structuralIssues(item: PrescriptionDraftItem) {
  const issues: string[] = [];
  if (!item.medication.trim()) issues.push("Medicamento não informado.");
  if (!item.dose.trim()) issues.push("Dose não informada.");
  if (item.dose.trim() && !item.unit.trim()) issues.push("Dose informada sem unidade.");
  if (!item.route.trim()) issues.push("Via não informada.");
  if (!item.frequency.trim()) issues.push("Frequência não informada.");
  if (!item.duration.trim()) issues.push("Duração não informada.");
  if (!item.quantity.trim()) issues.push("Quantidade não informada.");
  if (!item.instructions.trim()) issues.push("Instruções não informadas.");
  return issues;
}

export function parseRecordedWeight(vitalSigns: string | undefined) {
  const match = vitalSigns?.match(/(?:^|\n)Peso:\s*([0-9]+(?:[,.][0-9]+)?)/i);
  return match ? Number(match[1].replace(",", ".")) : null;
}

export function availablePrescriptionContext(values: MedicalRecordFormValues, age: number | null) {
  return {
    age,
    weight: parseRecordedWeight(values.vital_signs),
    allergies: values.allergies?.trim() || null,
    medications: values.medications?.trim() || null,
    indication: values.assessment?.trim() || values.chief_complaint?.trim() || null,
    pregnancyLactation: /gesta(?:nte|ção)|grávida|lacta(?:ção|nte)|amamenta/i.test(`${values.pmh || ""} ${values.hpi || ""}`) ? "Há menção no texto clínico; revisar o registro original." : null,
    renalFunction: /creatinina|filtração glomerular|função renal|doença renal/i.test(`${values.pmh || ""} ${values.hpi || ""}`) ? "Há menção no texto clínico; revisar o registro original." : null,
    hepaticFunction: /função hepática|hepatopatia|cirrose|tgo|tgp/i.test(`${values.pmh || ""} ${values.hpi || ""}`) ? "Há menção no texto clínico; revisar o registro original." : null,
  };
}

export function prescriptionItemText(item: PrescriptionDraftItem, index: number) {
  return [`${index + 1}. ${item.medication}${item.activeIngredient ? ` (${item.activeIngredient})` : ""}`, item.presentation && `Apresentação: ${item.presentation}`, item.concentration && `Concentração: ${item.concentration}`, item.dose && `Dose: ${item.dose}${item.unit ? ` ${item.unit}` : ""}`, item.route && `Via: ${item.route}`, item.frequency && `Frequência: ${item.frequency}`, item.duration && `Duração: ${item.duration}`, item.quantity && `Quantidade: ${item.quantity}`, item.instructions && `Instruções: ${item.instructions}`, item.indication && `Indicação informada: ${item.indication}`, item.observations && `Observações: ${item.observations}`].filter(Boolean).join("\n");
}
