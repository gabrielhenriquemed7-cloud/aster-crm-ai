import type {
  PrescriptionDocument,
  PrescriptionDraft,
  PrescriptionMedication,
  PrescriptionTemplate,
} from "@/lib/prescription-engine/types";

export function createEmptyMedication(): PrescriptionMedication {
  return {
    id: crypto.randomUUID(),
    name: "",
    activeIngredient: "",
    concentration: "",
    pharmaceuticalForm: "",
    route: "",
    dose: "",
    frequency: "",
    interval: "",
    schedule: "",
    duration: "",
    quantity: "",
    notes: "",
    posologyMode: "custom_schedule",
  };
}

export class PrescriptionFactory {
  static fromDraft(
    draft: PrescriptionDraft,
    identity: Omit<
      PrescriptionDocument,
      "id" | "status" | "type" | "medications" | "orientations" | "observations"
    >,
  ): PrescriptionDocument {
    return {
      ...identity,
      ...draft,
      status: "draft",
      medications: draft.medications.map((item) => ({ ...item })),
    };
  }

  static fromTemplate(
    template: PrescriptionTemplate,
    identity: Omit<
      PrescriptionDocument,
      "id" | "status" | "type" | "medications" | "orientations" | "observations"
    >,
  ): PrescriptionDocument {
    return {
      ...identity,
      id: crypto.randomUUID(),
      status: "draft",
      type: template.type,
      medications: template.medications.map((item) => ({
        ...item,
        id: crypto.randomUUID(),
      })),
      orientations: template.orientations,
      observations: template.observations,
    };
  }
}
