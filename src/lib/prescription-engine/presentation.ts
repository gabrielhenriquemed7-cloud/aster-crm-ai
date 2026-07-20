import type {
  PrescriptionDocument,
  PrescriptionMedication,
} from "@/lib/prescription-engine/types";

export interface PresentedMedication {
  name: string;
  formAndPackage: string;
  posology: string;
  quantity: string;
  orientations: string[];
}

const safeForms: Array<[RegExp, string]> = [
  [/\bPO SUS OR\b/i, "Suspensão oral"],
  [/\bSUS OR\b/i, "Suspensão oral"],
  [/\bSOL OR\b/i, "Solução oral"],
  [/\bCOM REV\b/i, "Comprimido revestido"],
  [/\bCAP DURA\b/i, "Cápsula dura"],
];

const safePackages: Array<[RegExp, string]> = [
  [/\bCT FR PLAS OPC X (\d+(?:[.,]\d+)?) ML\b/i, "Frasco plástico opaco com $1 mL"],
  [/\bCT FR(?: PLAS)? X (\d+(?:[.,]\d+)?) ML\b/i, "Frasco com $1 mL"],
  [/\bCT (?:BL |BL AL PLAS )?X (\d+) COM\b/i, "Caixa com $1 comprimidos"],
  [/\bCT (?:BL |BL AL PLAS )?X (\d+) CAP\b/i, "Caixa com $1 cápsulas"],
];

function sentenceCase(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
  return normalized ? normalized[0].toLocaleUpperCase("pt-BR") + normalized.slice(1) : "";
}

function normalizeUnits(value: string) {
  return value
    .replace(/(\d)\s*mg\s*\/\s*ml\b/gi, "$1 mg/mL")
    .replace(/(\d)\s*mcg\s*\/\s*ml\b/gi, "$1 mcg/mL")
    .replace(/(\d)\s*g\s*\/\s*ml\b/gi, "$1 g/mL")
    .replace(/(\d)\s*ml\b/gi, "$1 mL")
    .replace(/(\d)\s*mg\b/gi, "$1 mg")
    .replace(/(\d)\s*g\b/gi, "$1 g")
    .replace(/\s+/g, " ")
    .trim();
}

export function presentMedicationName(name: string, concentration: string) {
  const readableName = sentenceCase(name);
  const readableConcentration = normalizeUnits(concentration);
  if (readableConcentration && readableName.toLocaleLowerCase("pt-BR").includes(readableConcentration.toLocaleLowerCase("pt-BR")))
    return readableName;
  return [readableName, readableConcentration].filter(Boolean).join(" ");
}

function confirmedValue(value: string, mappings: Array<[RegExp, string]>) {
  for (const [pattern, replacement] of mappings) {
    const match = value.match(pattern);
    if (match) return normalizeUnits(match[0].replace(pattern, replacement));
  }
  return "";
}

export function presentFormAndPackage(item: PrescriptionMedication) {
  const form =
    confirmedValue(item.pharmaceuticalForm, safeForms) ||
    (!/\b[A-Z]{2,}\b/.test(item.pharmaceuticalForm)
      ? sentenceCase(item.pharmaceuticalForm)
      : "");
  const packageText =
    confirmedValue(item.packageDescription ?? "", safePackages) ||
    confirmedValue(item.presentation ?? "", safePackages);
  return [form, packageText].filter(Boolean).join(" — ");
}

function lowerSentence(value: string) {
  const normalized = normalizeUnits(value).replace(/[.,;]+$/, "");
  return normalized
    ? normalized[0].toLocaleLowerCase("pt-BR") + normalized.slice(1)
    : "";
}

export function presentPosology(item: PrescriptionMedication) {
  const route = item.route.toLocaleLowerCase("pt-BR");
  const verb = /oftálm|ocular/.test(route)
    ? "Instilar"
    : /tópic|cutân/.test(route)
      ? "Aplicar"
      : /nasal/.test(route)
        ? "Usar"
        : /oral/.test(route)
          ? "Tomar"
          : "Administrar";
  const parts = [
    `${verb} ${normalizeUnits(item.dose)}`.trim(),
    item.route && `por via ${lowerSentence(item.route)}`,
    lowerSentence(item.frequency),
  ].filter(Boolean);
  let result = parts.join(" ");
  if (item.duration) result += `, durante ${lowerSentence(item.duration)}`;
  return result ? `${result.replace(/\s+/g, " ").replace(/[.,;]+$/, "")}.` : "";
}

function lines(value: string) {
  return value
    .split(/\n|;/)
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean)
    .map((line) => `${line[0].toLocaleUpperCase("pt-BR")}${line.slice(1).replace(/[.;]+$/, "")}.`);
}

export function buildPrescriptionPresentation(
  document: Pick<PrescriptionDocument, "medications" | "orientations" | "observations">,
) {
  return {
    medications: document.medications.map((item) => ({
      name: presentMedicationName(item.name, item.concentration),
      formAndPackage: presentFormAndPackage(item),
      posology: presentPosology(item),
      quantity: item.quantity ? `Quantidade: ${normalizeUnits(item.quantity).replace(/[.]+$/, "")}.` : "",
      orientations: lines(item.notes),
    })),
    orientations: lines(document.orientations),
    observations: lines(document.observations),
  };
}
