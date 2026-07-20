import type {
  ExamField,
  ExamTemplate,
  PhysicalExamSystemDefinition,
  PhysicalExamSystems,
  VitalSigns,
} from "@/lib/physical-exam/types";

export function templateVitalFields(template: ExamTemplate) {
  return template.sections
    .filter((section) => section.kind === "vital_signs")
    .flatMap((section) => section.fields)
    .filter((field) => field.kind === "vital_sign");
}

export function templateSystemDefinitions(
  template: ExamTemplate,
): PhysicalExamSystemDefinition[] {
  return template.sections
    .filter((section) => section.kind === "systems")
    .flatMap((section) => section.fields)
    .filter(
      (field): field is ExamField & { normalText: string } =>
        field.kind === "system" && Boolean(field.normalText),
    )
    .map((field) => ({
      id: field.id,
      label: field.label,
      normalText: field.normalText,
    }));
}

export function templateObservationField(template: ExamTemplate) {
  return template.sections
    .find((section) => section.kind === "observations")
    ?.fields.find((field) => field.kind === "textarea");
}

export function emptyVitalSigns(template: ExamTemplate): VitalSigns {
  return Object.fromEntries(
    templateVitalFields(template).map((field) => [field.id, ""]),
  );
}

export function emptyPhysicalExamSystems(
  template: ExamTemplate,
): PhysicalExamSystems {
  return Object.fromEntries(
    templateSystemDefinitions(template).map((system) => [
      system.id,
      { status: "unassessed", description: "" },
    ]),
  );
}

const vitalPatterns: Record<string, RegExp> = {
  pa: /(?:^|\n)PA:\s*([^\n]*)/i,
  fc: /(?:^|\n)FC:\s*([^\n]*)/i,
  fr: /(?:^|\n)FR:\s*([^\n]*)/i,
  temperature: /(?:^|\n)(?:Temperatura|Temp):\s*([^\n]*)/i,
  spo2: /(?:^|\n)(?:SpO2|SatO2|Saturação|Sat):\s*([^\n]*)/i,
  weight: /(?:^|\n)Peso:\s*([^\n]*)/i,
  height: /(?:^|\n)Altura:\s*([^\n]*)/i,
  glucose: /(?:^|\n)(?:Glicemia|HGT):\s*([^\n]*)/i,
};

export function parseVitalSigns(
  template: ExamTemplate,
  text: string,
): VitalSigns {
  const values = emptyVitalSigns(template);
  templateVitalFields(template).forEach((field) => {
    const pattern = vitalPatterns[field.id];
    if (!pattern) return;
    values[field.id] =
      text
        .match(pattern)?.[1]
        ?.replace(/\s*(?:mmHg|bpm|irpm|°C|%|kg|cm|mg\/dL).*$/i, "")
        .trim() ?? "";
  });
  return values;
}

function numeric(value = "") {
  return Number(value.replace(",", "."));
}

export function calculateBmi(vitals: VitalSigns) {
  const weight = numeric(vitals.weight);
  const height = numeric(vitals.height) / 100;
  return weight > 0 && height > 0
    ? (weight / (height * height)).toFixed(1)
    : "";
}

const persistedVitalLabels: Record<string, string> = {
  pa: "PA",
  fc: "FC",
  fr: "FR",
  temperature: "Temperatura",
  spo2: "SpO2",
  weight: "Peso",
  height: "Altura",
  glucose: "Glicemia",
};

export function serializeVitalSigns(
  template: ExamTemplate,
  vitals: VitalSigns,
) {
  const bmi = calculateBmi(vitals);
  return templateVitalFields(template)
    .filter((field) => vitals[field.id]?.trim())
    .map((field) => {
      const unit = field.unit ? ` ${field.unit}` : "";
      return `${persistedVitalLabels[field.id] ?? field.label}: ${vitals[field.id].trim()}${unit}`;
    })
    .concat(bmi ? [`IMC: ${bmi} kg/m²`] : [])
    .join("\n");
}

export function vitalSignWarnings(vitals: VitalSigns) {
  const warnings: string[] = [];
  if (vitals.pa && !/^\d{2,3}\s*[x/]\s*\d{2,3}$/.test(vitals.pa))
    warnings.push("Confira o formato da pressão arterial (ex.: 120x80).");
  if (vitals.fc && (numeric(vitals.fc) < 20 || numeric(vitals.fc) > 250))
    warnings.push("A frequência cardíaca parece improvável.");
  if (vitals.fr && (numeric(vitals.fr) < 5 || numeric(vitals.fr) > 80))
    warnings.push("A frequência respiratória parece improvável.");
  if (
    vitals.temperature &&
    (numeric(vitals.temperature) < 30 || numeric(vitals.temperature) > 45)
  )
    warnings.push("A temperatura parece improvável.");
  if (vitals.spo2 && (numeric(vitals.spo2) < 50 || numeric(vitals.spo2) > 100))
    warnings.push("A saturação parece improvável.");
  return warnings;
}

export function buildPhysicalExamText(
  template: ExamTemplate,
  systems: PhysicalExamSystems,
  observations: string,
) {
  return templateSystemDefinitions(template)
    .flatMap((definition) => {
      const value = systems[definition.id];
      if (value?.status === "normal") return [definition.normalText];
      if (value?.status === "altered" && value.description.trim())
        return [value.description.trim()];
      return [];
    })
    .concat(observations.trim() ? [observations.trim()] : [])
    .join("\n\n");
}
