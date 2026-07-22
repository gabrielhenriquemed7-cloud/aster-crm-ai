import type { PrescriptionMedication } from "@/lib/prescription-engine/types";

function normalize(value: string | undefined) {
  return value?.trim().toLocaleLowerCase("pt-BR").replace(/\s+/g, " ") ?? "";
}

export type PrescriptionConsistencyAlert = {
  code: "duplicate_medication" | "duplicate_ingredient" | "duplicate_presentation";
  message: string;
};

export function prescriptionConsistencyAlerts(
  medications: PrescriptionMedication[],
): PrescriptionConsistencyAlert[] {
  const alerts: PrescriptionConsistencyAlert[] = [];
  const seen = {
    medication: new Set<string>(),
    ingredient: new Set<string>(),
    presentation: new Set<string>(),
  };

  for (const item of medications) {
    const medication = normalize(item.name);
    const ingredient = normalize(item.activeIngredient);
    const presentation = normalize(item.presentation);
    if (medication && seen.medication.has(medication))
      alerts.push({
        code: "duplicate_medication",
        message: `${item.name}: medicamento repetido no rascunho.`,
      });
    if (ingredient && seen.ingredient.has(ingredient))
      alerts.push({
        code: "duplicate_ingredient",
        message: `${item.activeIngredient}: princípio ativo repetido.`,
      });
    if (presentation && seen.presentation.has(presentation))
      alerts.push({
        code: "duplicate_presentation",
        message: `${item.presentation}: apresentação repetida.`,
      });
    if (medication) seen.medication.add(medication);
    if (ingredient) seen.ingredient.add(ingredient);
    if (presentation) seen.presentation.add(presentation);
  }
  return alerts;
}
