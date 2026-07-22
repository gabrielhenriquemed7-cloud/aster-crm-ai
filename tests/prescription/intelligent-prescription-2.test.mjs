import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { prescriptionConsistencyAlerts } from "../../src/lib/prescription-engine/validation.ts";

const medication = (overrides = {}) => ({
  id: crypto.randomUUID(),
  name: "Amoxicilina",
  activeIngredient: "Amoxicilina",
  concentration: "500 mg",
  pharmaceuticalForm: "Cápsula",
  presentation: "Caixa com 21 cápsulas",
  route: "Oral",
  dose: "1 cápsula",
  frequency: "A cada 8 horas",
  interval: "8 horas",
  schedule: "",
  duration: "7 dias",
  quantity: "21 cápsulas",
  notes: "Tomar com água",
  posologyMode: "custom_schedule",
  ...overrides,
});

test("detects exact medication, ingredient and presentation duplicates", () => {
  const alerts = prescriptionConsistencyAlerts([
    medication(),
    medication({ id: crypto.randomUUID(), name: " amoxicilina " }),
  ]);
  assert.deepEqual(
    new Set(alerts.map((alert) => alert.code)),
    new Set([
      "duplicate_medication",
      "duplicate_ingredient",
      "duplicate_presentation",
    ]),
  );
});

test("does not infer therapeutic equivalence from different literal values", () => {
  assert.deepEqual(
    prescriptionConsistencyAlerts([
      medication(),
      medication({
        id: crypto.randomUUID(),
        name: "Ampicilina",
        activeIngredient: "Ampicilina",
        presentation: "Frasco",
      }),
    ]),
    [],
  );
});

test("catalog combobox supports keyboard navigation and explicit selection", async () => {
  const source = await readFile(
    "src/components/prescriptions/intelligent-prescription-engine.tsx",
    "utf8",
  );
  assert.match(source, /event\.key === "ArrowDown"/);
  assert.match(source, /event\.key === "ArrowUp"/);
  assert.match(source, /aria-activedescendant/);
  assert.match(source, /selectCatalogMedication\(selected\)/);
});

test("physician review constraint has a safe user-facing error", async () => {
  const source = await readFile(
    "src/app/(dashboard)/consultas/actions.ts",
    "utf8",
  );
  assert.match(source, /clinical_documents_physician_review_required/);
  assert.match(
    source,
    /a revisão médica não foi registrada corretamente/,
  );
  assert.doesNotMatch(
    source.match(/return \{\s*error:\s*\n?\s*"Não foi possível concluir[\s\S]+?\};/)?.[0] ?? "",
    /23514|clinical_documents_physician_review_required/,
  );
});

test("final action explicitly communicates physician review", async () => {
  const source = await readFile(
    "src/components/prescriptions/intelligent-prescription-engine.tsx",
    "utf8",
  );
  assert.match(source, /Revisar e inserir no prontuário/);
  assert.match(source, /registra sua revisão médica/);
});
