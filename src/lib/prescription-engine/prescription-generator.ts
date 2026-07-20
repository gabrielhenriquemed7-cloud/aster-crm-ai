import { buildPrescriptionPresentation } from "@/lib/prescription-engine/presentation";
import type { PrescriptionDocument } from "@/lib/prescription-engine/types";

function medicationText(
  item: ReturnType<typeof buildPrescriptionPresentation>["medications"][number],
  index: number,
) {
  return [
    `${index + 1}. ${item.name || "Medicamento não informado"}`,
    item.formAndPackage,
    item.posology,
    item.quantity,
    item.orientations.length
      ? `Orientações:\n${item.orientations.map((line) => `- ${line}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export class PrescriptionGenerator {
  static generate(document: PrescriptionDocument) {
    const presentation = buildPrescriptionPresentation(document);
    const header = [
      document.clinic.name,
      `Paciente: ${document.patient.name}`,
      document.patient.document && `CPF: ${document.patient.document}`,
      `Data: ${new Date(document.issuedAt).toLocaleDateString("pt-BR")}`,
    ]
      .filter(Boolean)
      .join("\n");
    const body = presentation.medications.map(medicationText).join("\n\n");
    const footer = [
      presentation.orientations.length
        ? `ORIENTAÇÕES\n${presentation.orientations.map((line) => `- ${line}`).join("\n")}`
        : "",
      presentation.observations.length
        ? `OBSERVAÇÕES\n${presentation.observations.map((line) => `- ${line}`).join("\n")}`
        : "",
      `\n${document.signaturePlaceholder}`,
      [
        document.prescriber.name,
        document.prescriber.council,
        document.prescriber.document,
        document.prescriber.councilState,
      ]
        .filter(Boolean)
        .join(" "),
    ]
      .filter(Boolean)
      .join("\n\n");
    return [header, "Rp/", body, footer].filter(Boolean).join("\n\n");
  }
}
