import { z } from "zod";

export const clinicalStatusSchema = z.enum([
  "draft",
  "in_review",
  "reviewed",
  "approved",
  "suspended",
  "outdated",
]);

export type ClinicalStatus = z.infer<typeof clinicalStatusSchema>;

export interface DrugEngineOption {
  code: string;
  shortLabel: string;
  prescriptionText: string;
  sortOrder: number;
}

export interface MedicationRouteOption {
  code: string;
  label: string;
  isDefault: boolean;
}

export interface MedicationDoseUnit {
  code: string;
  singularLabel: string;
  pluralLabel: string;
  allowsFraction: boolean;
  measurable: boolean;
}

export interface MedicationFrequencyOption extends DrugEngineOption {
  administrationsPerDay: number | null;
  intervalHours: number | null;
  type: "exact" | "conditional" | "continuous" | "custom";
}

export interface MedicationDurationOption extends DrugEngineOption {
  durationDays: number | null;
  type: "exact" | "single_dose" | "continuous" | "conditional" | "custom";
}

export interface ClinicalReference {
  id: string;
  name: string;
  title: string | null;
  organization: string | null;
  version: string | null;
  publicationYear: number | null;
  referenceUrl: string | null;
  accessedAt: string | null;
}

export interface ClinicalMedicationProfile {
  id: string;
  profileKey: string;
  version: number;
  presentationId: string | null;
  pharmaceuticalFormPattern: string | null;
  status: ClinicalStatus;
  reference: ClinicalReference | null;
  routes: MedicationRouteOption[];
  doseUnits: MedicationDoseUnit[];
  guidance: Array<{ id: string; text: string; version: number }>;
  dosageTemplates: MedicationDosageTemplate[];
}

export interface MedicationDosageTemplate {
  id: string;
  name: string;
  version: number;
  status: ClinicalStatus;
  routeCode: string | null;
  doseAmount: number | null;
  doseUnitCode: string | null;
  frequencyCode: string | null;
  durationCode: string | null;
  instructions: string | null;
  populationContext: string | null;
  reference: ClinicalReference;
}

export interface ClinicalProfileBundle {
  profile: ClinicalMedicationProfile | null;
  frequencies: MedicationFrequencyOption[];
  durations: MedicationDurationOption[];
  source: "ASTER_CLINICAL_LAYER";
}

export const quantityInputSchema = z.object({
  amountPerAdministration: z.number().positive(),
  administrationsPerDay: z.number().positive(),
  durationDays: z.number().int().positive(),
  unit: z.object({
    singular: z.string().trim().min(1),
    plural: z.string().trim().min(1),
  }),
  packageUnits: z.number().positive().optional(),
});

export type QuantityInput = z.infer<typeof quantityInputSchema>;

export interface QuantityEstimate {
  requiredUnits: number;
  displayQuantity: string;
  packageEstimate: {
    packageCount: number;
    packageUnits: number;
    dispensedUnits: number;
  } | null;
  calculation: string;
}

export function calculateQuantity(input: QuantityInput): QuantityEstimate {
  const value = quantityInputSchema.parse(input);
  const requiredUnits =
    value.amountPerAdministration *
    value.administrationsPerDay *
    value.durationDays;
  const label = requiredUnits === 1 ? value.unit.singular : value.unit.plural;
  const packageEstimate = value.packageUnits
    ? {
        packageCount: Math.ceil(requiredUnits / value.packageUnits),
        packageUnits: value.packageUnits,
        dispensedUnits:
          Math.ceil(requiredUnits / value.packageUnits) * value.packageUnits,
      }
    : null;

  return {
    requiredUnits,
    displayQuantity: `${requiredUnits} ${label}`,
    packageEstimate,
    calculation: `${value.amountPerAdministration} × ${value.administrationsPerDay} × ${value.durationDays}`,
  };
}

export function canUseClinicalStatus(status: ClinicalStatus) {
  return status === "reviewed" || status === "approved";
}
