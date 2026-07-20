import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPrescriptionPresentation,
  presentFormAndPackage,
  presentMedicationName,
  presentPosology,
} from "../../src/lib/prescription-engine/presentation.ts";

const medication = (overrides = {}) => ({
  id: "item-1",
  name: "AMOXICILINA",
  activeIngredient: "AMOXICILINA",
  concentration: "100 MG/ML",
  pharmaceuticalForm: "Suspensão oral",
  presentation: "100 MG/ML PO SUS OR CT FR PLAS OPC X 150 ML + COP",
  packageDescription: "CT FR PLAS OPC X 150 ML + COP",
  route: "Oral",
  dose: "3 ml",
  frequency: "A cada 12 horas",
  interval: "",
  schedule: "",
  duration: "10 dias",
  quantity: "1 frasco",
  notes: "agitar antes de usar; utilizar o dispositivo dosador",
  posologyMode: "custom_schedule",
  registrationNumber: "REGULATORY-SNAPSHOT",
  ean: "7890000000000",
  ...overrides,
});

test("humanizes medication, confirmed form and package", () => {
  assert.equal(
    presentMedicationName("AMOXICILINA", "100 MG/ML"),
    "Amoxicilina 100 mg/mL",
  );
  assert.equal(
    presentFormAndPackage(medication()),
    "Suspensão oral — Frasco plástico opaco com 150 mL",
  );
});

test("does not expose an unknown regulatory abbreviation", () => {
  assert.equal(
    presentFormAndPackage(
      medication({
        pharmaceuticalForm: "XYZ ABC",
        packageDescription: "CT XYZ ABC X 10 UN",
        presentation: "XYZ ABC CT XYZ ABC X 10 UN",
      }),
    ),
    "",
  );
});

test("generates natural oral, topical, ophthalmic and nasal posology", () => {
  assert.equal(
    presentPosology(medication()),
    "Tomar 3 mL por via oral a cada 12 horas, durante 10 dias.",
  );
  assert.match(
    presentPosology(medication({ route: "Tópica", dose: "uma fina camada" })),
    /^Aplicar uma fina camada por via tópica/,
  );
  assert.match(
    presentPosology(medication({ route: "Oftálmica", dose: "1 gota" })),
    /^Instilar 1 gota por via oftálmica/,
  );
  assert.match(
    presentPosology(medication({ route: "Nasal", dose: "2 jatos" })),
    /^Usar 2 jatos por via nasal/,
  );
});

test("formats quantity and orientations without mutating regulatory snapshot", () => {
  const source = medication();
  const result = buildPrescriptionPresentation({
    medications: [source],
    orientations: "",
    observations: "",
  });
  assert.equal(result.medications[0].quantity, "Quantidade: 1 frasco.");
  assert.deepEqual(result.medications[0].orientations, [
    "Agitar antes de usar.",
    "Utilizar o dispositivo dosador.",
  ]);
  assert.equal(source.registrationNumber, "REGULATORY-SNAPSHOT");
  assert.equal(source.ean, "7890000000000");
});
