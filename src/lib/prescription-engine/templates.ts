import type { PrescriptionTemplate } from "@/lib/prescription-engine/types";

export const emptyPrescriptionTemplate: PrescriptionTemplate = {
  id: "blank-prescription",
  name: "Receita em branco",
  scope: "personal",
  type: "simple",
  medications: [],
  orientations: "",
  observations: "",
};

// Estrutura preparada para persistência futura. Não contém sugestões clínicas.
export const favoritePrescriptionTemplates: PrescriptionTemplate[] = [];
