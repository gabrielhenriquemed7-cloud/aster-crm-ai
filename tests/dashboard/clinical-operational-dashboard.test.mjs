import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const actionsPath = "src/app/(dashboard)/dashboard/actions.ts";
const pagePath = "src/app/(dashboard)/dashboard/page.tsx";

test("dashboard uses tenant-bound real sources without fixed metrics", async () => {
  const source = await readFile(actionsPath, "utf8");
  for (const table of ["appointments", "patients", "medical_records", "clinical_documents", "care_continuity_items"])
    assert.match(source, new RegExp(`from\\(\\"${table}\\"\\)`));
  assert.match(source, /\.eq\("clinic_id",clinicId\)/);
  assert.doesNotMatch(source, /Carlos Henrique|Marina Souza|Ana Beatriz/);
});

test("doctor dashboard scopes agenda and period indicators to professional", async () => {
  const source = await readFile(actionsPath, "utf8");
  assert.match(source, /const isDoctor=role===\"doctor\"/);
  assert.match(source, /todayQuery=todayQuery\.eq\("professional_id",auth\.user\.id\)/);
  assert.match(source, /monthQuery=monthQuery\.eq\("professional_id",auth\.user\.id\)/);
});

test("dashboard changes quick actions by role and hides them in demo", async () => {
  const source = await readFile(pagePath, "utf8");
  assert.match(source, /data\.user\.role===\"receptionist\"/);
  assert.match(source, /data\.user\.role===\"demo\"/);
  assert.match(source, /Novo agendamento/);
  assert.match(source, /Abrir pendências/);
});

test("section failures and empty states are isolated", async () => {
  const [actions, page] = await Promise.all([readFile(actionsPath,"utf8"),readFile(pagePath,"utf8")]);
  assert.match(actions, /sectionErrors/);
  assert.match(page, /data\.sectionErrors\.agenda/);
  assert.match(page, /data\.sectionErrors\.continuity/);
  assert.match(page, /data\.sectionErrors\.documents/);
  assert.match(page, /Não há pacientes aguardando ou em atendimento/);
  assert.match(page, /Não existem documentos recentes/);
});

test("dashboard layout prevents horizontal overflow and limits lists", async () => {
  const [actions, page] = await Promise.all([readFile(actionsPath,"utf8"),readFile(pagePath,"utf8")]);
  assert.match(page, /overflow-x-hidden/);
  assert.match(page, /min-w-0/);
  assert.match(actions, /\.limit\(8\)/);
  assert.match(actions, /\.limit\(100\)/);
  assert.match(actions, /\.slice\(0,5\)/);
});
