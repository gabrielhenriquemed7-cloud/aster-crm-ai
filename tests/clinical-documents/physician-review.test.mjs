import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const documentCenterMigrationPath =
  "supabase/migrations/20260720160000_intelligent_document_center.sql";
const reviewMigrationPath =
  "supabase/migrations/20260721120000_capture_physician_document_review.sql";
const actionsPath = "src/app/(dashboard)/documentos/actions.ts";

test("AI draft without explicit issuance remains unreviewed and is blocked as official", async () => {
  const [sql, actions] = await Promise.all([
    readFile(documentCenterMigrationPath, "utf8"),
    readFile(actionsPath, "utf8"),
  ]);
  const saveDraft = actions.match(
    /export async function saveClinicalDocument[\s\S]+?export async function listClinicalDocumentTemplates/,
  )?.[0];
  assert.ok(saveDraft);
  assert.doesNotMatch(saveDraft, /reviewed_by_physician|reviewed_at|reviewed_by:/);
  assert.match(
    sql,
    /check \(status not in \('finalized', 'signed', 'archived'\) or reviewed_by_physician\)/i,
  );
});

test("explicit physician issuance records complete review metadata", async () => {
  const sql = await readFile(reviewMigrationPath, "utf8");
  assert.match(sql, /before update of status on public\.clinical_documents/i);
  assert.match(sql, /new\.reviewed_by_physician := true/i);
  assert.match(sql, /new\.reviewed_by := reviewing_user_id/i);
  assert.match(sql, /new\.reviewed_at := now\(\)/i);
});

test("manual document stays manual while AI provenance is preserved", async () => {
  const actions = await readFile(actionsPath, "utf8");
  assert.match(
    actions,
    /generated_by_ai: options\?\.generatedByAi \?\? doc\.generated_by_ai/,
  );
  assert.doesNotMatch(actions, /generated_by_ai: Boolean\(options\?\.generatedByAi\)/);
});

test("user without physician review permission is rejected", async () => {
  const sql = await readFile(reviewMigrationPath, "utf8");
  assert.match(sql, /member\.status = 'active'/i);
  assert.match(sql, /member\.role in \('doctor', 'clinic_admin'\)/i);
  assert.match(sql, /Somente o profissional responsável pode revisar o documento/i);
  assert.match(sql, /errcode = '42501'/i);
});

test("review from a different tenant is rejected", async () => {
  const sql = await readFile(reviewMigrationPath, "utf8");
  assert.match(sql, /member\.clinic_id = new\.clinic_id/i);
  assert.match(sql, /profile\.active_clinic_id = new\.clinic_id/i);
  assert.match(sql, /member\.user_id = reviewing_user_id/i);
});
