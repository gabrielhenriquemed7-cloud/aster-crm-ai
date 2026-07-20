export interface StructuredOption {
  code: string;
  label: string;
}

export const frequencyOptions: StructuredOption[] = [
  { code: "ONCE_DAILY", label: "Uma vez ao dia" },
  { code: "EVERY_4_HOURS", label: "A cada 4 horas" },
  { code: "EVERY_6_HOURS", label: "A cada 6 horas" },
  { code: "EVERY_8_HOURS", label: "A cada 8 horas" },
  { code: "EVERY_12_HOURS", label: "A cada 12 horas" },
  { code: "EVERY_24_HOURS", label: "A cada 24 horas" },
  { code: "MORNING", label: "Pela manhã" },
  { code: "NIGHT", label: "À noite" },
  { code: "AS_NEEDED", label: "Se necessário" },
  { code: "SINGLE_DOSE", label: "Dose única" },
  { code: "CONTINUOUS", label: "Uso contínuo" },
];

export const durationOptions: StructuredOption[] = [
  { code: "SINGLE_DOSE", label: "Dose única" },
  { code: "DAYS_1", label: "1 dia" },
  { code: "DAYS_3", label: "3 dias" },
  { code: "DAYS_5", label: "5 dias" },
  { code: "DAYS_7", label: "7 dias" },
  { code: "DAYS_10", label: "10 dias" },
  { code: "DAYS_14", label: "14 dias" },
  { code: "DAYS_30", label: "30 dias" },
  { code: "CONTINUOUS", label: "Uso contínuo" },
  { code: "UNTIL_REASSESSMENT", label: "Até reavaliação" },
  { code: "AS_NEEDED", label: "Se necessário" },
];

interface FormProfile {
  test: RegExp;
  routes: string[];
  doseOptions: string[];
  orientationOptions: string[];
}

const formProfiles: FormProfile[] = [
  {
    test: /comprimido/i,
    routes: ["Oral"],
    doseOptions: ["1/2 comprimido", "1 comprimido", "2 comprimidos"],
    orientationOptions: ["Ingerir com água"],
  },
  {
    test: /cápsula/i,
    routes: ["Oral"],
    doseOptions: ["1 cápsula", "2 cápsulas"],
    orientationOptions: ["Ingerir com água"],
  },
  {
    test: /gota/i,
    routes: ["Oral"],
    doseOptions: [],
    orientationOptions: ["Utilizar o dispositivo dosador da embalagem"],
  },
  {
    test: /solução oral|suspensão oral|xarope/i,
    routes: ["Oral"],
    doseOptions: [],
    orientationOptions: ["Utilizar o dispositivo dosador da embalagem"],
  },
  {
    test: /injet/i,
    routes: [],
    doseOptions: [],
    orientationOptions: ["Administração por profissional habilitado"],
  },
  {
    test: /creme|pomada/i,
    routes: ["Tópica"],
    doseOptions: ["Camada fina", "1 aplicação"],
    orientationOptions: [],
  },
  {
    test: /oftálm/i,
    routes: ["Oftálmica"],
    doseOptions: [],
    orientationOptions: [],
  },
  {
    test: /nasal/i,
    routes: ["Nasal"],
    doseOptions: [],
    orientationOptions: [],
  },
  {
    test: /aerossol|inalat/i,
    routes: ["Inalatória"],
    doseOptions: [],
    orientationOptions: [],
  },
  {
    test: /supositório/i,
    routes: ["Retal"],
    doseOptions: ["1 supositório"],
    orientationOptions: [],
  },
];

export function optionsForForm(form: string) {
  return (
    formProfiles.find((profile) => profile.test.test(form)) ?? {
      routes: [],
      doseOptions: [],
      orientationOptions: [],
    }
  );
}

function numericDose(dose: string) {
  const normalized = dose.replace(",", ".").trim();
  const fraction = normalized.match(/^(\d+)\/(\d+)\s/);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);
  const number = normalized.match(/^(\d+(?:\.\d+)?)\s/);
  return number ? Number(number[1]) : null;
}

function administrationsPerDay(code?: string) {
  const hours = code?.match(/^EVERY_(\d+)_HOURS$/);
  if (hours) return 24 / Number(hours[1]);
  if (code === "ONCE_DAILY" || code === "EVERY_24_HOURS") return 1;
  if (code === "SINGLE_DOSE") return 1;
  return null;
}

function durationDays(code?: string) {
  const days = code?.match(/^DAYS_(\d+)$/);
  if (days) return Number(days[1]);
  if (code === "SINGLE_DOSE") return 1;
  return null;
}

export function suggestedQuantity(
  dose: string,
  frequencyCode?: string,
  durationCode?: string,
) {
  const amount = numericDose(dose);
  const perDay = administrationsPerDay(frequencyCode);
  const days = durationDays(durationCode);
  if (amount === null || perDay === null || days === null) return null;
  const total = amount * perDay * days;
  if (!Number.isFinite(total) || total <= 0) return null;
  const rawUnit = dose
    .replace(/^(?:\d+(?:[.,]\d+)?|\d+\/\d+)\s+/, "")
    .trim();
  const unit =
    Math.ceil(total) > 1
      ? rawUnit
          .replace(/^comprimido$/, "comprimidos")
          .replace(/^cápsula$/, "cápsulas")
          .replace(/^supositório$/, "supositórios")
          .replace(/^aplicação$/, "aplicações")
      : rawUnit;
  return `${Math.ceil(total)} ${unit}`;
}
