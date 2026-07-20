import type {
  PhysicalExamSystemDefinition,
  PhysicalExamSystems,
  VitalSignKey,
  VitalSigns,
} from "@/lib/physical-exam/types";

export const physicalExamSystems: PhysicalExamSystemDefinition[] = [
  {
    id: "general",
    label: "Estado Geral",
    normalText:
      "Bom estado geral, lúcido, orientado em tempo e espaço, hidratado, corado, afebril.",
  },
  {
    id: "skin",
    label: "Pele e Mucosas",
    normalText: "Pele íntegra, corada, hidratada, sem lesões aparentes.",
  },
  {
    id: "head_neck",
    label: "Cabeça e Pescoço",
    normalText:
      "Normocefálico, pupilas isocóricas e fotorreagentes, sem alterações aparentes.",
  },
  {
    id: "cardiovascular",
    label: "Cardiovascular",
    normalText:
      "Ritmo cardíaco regular em dois tempos, bulhas normofonéticas, sem sopros.",
  },
  {
    id: "respiratory",
    label: "Respiratório",
    normalText:
      "Murmúrio vesicular presente bilateralmente, sem ruídos adventícios.",
  },
  {
    id: "abdomen",
    label: "Abdome",
    normalText:
      "Plano, flácido, indolor à palpação, ruídos hidroaéreos presentes.",
  },
  {
    id: "genitourinary",
    label: "Geniturinário",
    normalText: "Sem alterações aparentes ao exame geniturinário.",
  },
  {
    id: "musculoskeletal",
    label: "Musculoesquelético",
    normalText:
      "Amplitude de movimentos preservada, sem deformidades aparentes.",
  },
  {
    id: "neurologic",
    label: "Neurológico",
    normalText: "Lúcido, orientado, sem déficits neurológicos focais.",
  },
  {
    id: "extremities",
    label: "Extremidades",
    normalText: "Sem edema, pulsos periféricos palpáveis, perfusão preservada.",
  },
];

export const vitalSignFields: Array<{
  key: VitalSignKey;
  label: string;
  unit?: string;
  placeholder?: string;
  inputMode?: "text" | "decimal";
}> = [
  {
    key: "pa",
    label: "PA",
    unit: "mmHg",
    placeholder: "120x80",
    inputMode: "text",
  },
  { key: "fc", label: "FC", unit: "bpm", inputMode: "decimal" },
  { key: "fr", label: "FR", unit: "irpm", inputMode: "decimal" },
  {
    key: "temperature",
    label: "Temperatura",
    unit: "°C",
    inputMode: "decimal",
  },
  { key: "spo2", label: "Saturação", unit: "%", inputMode: "decimal" },
  { key: "weight", label: "Peso", unit: "kg", inputMode: "decimal" },
  { key: "height", label: "Altura", unit: "cm", inputMode: "decimal" },
  { key: "glucose", label: "Glicemia", unit: "mg/dL", inputMode: "decimal" },
];

export function emptyVitalSigns(): VitalSigns {
  return {
    pa: "",
    fc: "",
    fr: "",
    temperature: "",
    spo2: "",
    weight: "",
    height: "",
    glucose: "",
  };
}

export function emptyPhysicalExamSystems(): PhysicalExamSystems {
  return Object.fromEntries(
    physicalExamSystems.map((system) => [
      system.id,
      { status: "unassessed", description: "" },
    ]),
  ) as PhysicalExamSystems;
}

export function parseVitalSigns(text: string): VitalSigns {
  const values = emptyVitalSigns();
  const patterns: Array<[VitalSignKey, RegExp]> = [
    ["pa", /(?:^|\n)PA:\s*([^\n]*)/i],
    ["fc", /(?:^|\n)FC:\s*([^\n]*)/i],
    ["fr", /(?:^|\n)FR:\s*([^\n]*)/i],
    ["temperature", /(?:^|\n)(?:Temperatura|Temp):\s*([^\n]*)/i],
    ["spo2", /(?:^|\n)(?:SpO2|Saturação|Sat):\s*([^\n]*)/i],
    ["weight", /(?:^|\n)Peso:\s*([^\n]*)/i],
    ["height", /(?:^|\n)Altura:\s*([^\n]*)/i],
    ["glucose", /(?:^|\n)(?:Glicemia|HGT):\s*([^\n]*)/i],
  ];
  patterns.forEach(([key, pattern]) => {
    values[key] =
      text
        .match(pattern)?.[1]
        ?.replace(/\s*(?:mmHg|bpm|irpm|°C|%|kg|cm|mg\/dL).*$/i, "")
        .trim() ?? "";
  });
  return values;
}

function numeric(value: string) {
  return Number(value.replace(",", "."));
}

export function calculateBmi(vitals: VitalSigns) {
  const weight = numeric(vitals.weight);
  const height = numeric(vitals.height) / 100;
  return weight > 0 && height > 0
    ? (weight / (height * height)).toFixed(1)
    : "";
}

export function serializeVitalSigns(vitals: VitalSigns) {
  const bmi = calculateBmi(vitals);
  const units: Partial<Record<VitalSignKey, string>> = {
    pa: "mmHg",
    fc: "bpm",
    fr: "irpm",
    temperature: "°C",
    spo2: "%",
    weight: "kg",
    height: "cm",
    glucose: "mg/dL",
  };
  const labels: Record<VitalSignKey, string> = {
    pa: "PA",
    fc: "FC",
    fr: "FR",
    temperature: "Temperatura",
    spo2: "SpO2",
    weight: "Peso",
    height: "Altura",
    glucose: "Glicemia",
  };
  return vitalSignFields
    .filter(({ key }) => vitals[key].trim())
    .map(
      ({ key }) =>
        `${labels[key]}: ${vitals[key].trim()}${units[key] ? ` ${units[key]}` : ""}`,
    )
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
  systems: PhysicalExamSystems,
  observations: string,
) {
  return physicalExamSystems
    .flatMap((definition) => {
      const value = systems[definition.id];
      if (value.status === "normal") return [definition.normalText];
      if (value.status === "altered" && value.description.trim())
        return [value.description.trim()];
      return [];
    })
    .concat(observations.trim() ? [observations.trim()] : [])
    .join("\n\n");
}
