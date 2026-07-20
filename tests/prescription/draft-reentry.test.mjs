import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("draft hydration preserves editable medications and refreshes identity", async () => {
  const source = await readFile(
    "src/lib/prescription-engine/prescription-factory.ts",
    "utf8",
  );
  assert.match(source, /static fromDraft/);
  assert.match(source, /\.\.\.identity,\s+\.\.\.draft/s);
  assert.match(source, /status: "draft"/);
  assert.match(source, /draft\.medications\.map/);
});

test("prescription editor receives structured draft independently from summary", async () => {
  const form = await readFile(
    "src/components/medical-records/medical-record-form.tsx",
    "utf8",
  );
  assert.match(form, /initialDraft=\{record\?\.prescription_draft\}/);
  assert.match(form, /onDraftChange=\{async \(draft\)/);
  assert.match(form, /savePrescriptionDraft/);
});

test("editability is controlled by open appointment and draft record", async () => {
  const actions = await readFile(
    "src/app/(dashboard)/consultas/actions.ts",
    "utf8",
  );
  assert.match(actions, /appointment\.status === "in_progress"/);
  assert.match(actions, /!record \|\| record\.status === "draft"/);
  assert.match(actions, /if \(appointment\.status !== "in_progress"\)/);
  assert.match(actions, /if \(record && record\.status !== "draft"\)/);
});

test("issuance persists editable draft before creating immutable document", async () => {
  const actions = await readFile(
    "src/app/(dashboard)/consultas/actions.ts",
    "utf8",
  );
  const draftSave = actions.indexOf(
    "const draftResult = await savePrescriptionDraft",
  );
  const atomicIssue = actions.indexOf(
    '"issue_prescription_document_atomic"',
    draftSave,
  );
  assert.ok(draftSave > 0);
  assert.ok(atomicIssue > draftSave);
});

test("migration adds only a constrained structured draft column", async () => {
  const sql = await readFile(
    "supabase/migrations/20260720022000_editable_prescription_draft.sql",
    "utf8",
  );
  assert.match(sql, /add column if not exists prescription_draft jsonb/i);
  assert.match(sql, /jsonb_array_length.+<= 100/is);
  assert.doesNotMatch(sql, /\bdrop\s+(table|column)\b/i);
  assert.doesNotMatch(sql, /\b(delete from|truncate)\b/i);
});

test("legacy backfill only restores open drafts from immutable prescription payloads", async () => {
  const sql = await readFile(
    "supabase/migrations/20260720023000_backfill_open_prescription_drafts.sql",
    "utf8",
  );
  assert.match(sql, /document\.snapshot_json #> '\{prescription,payload\}'/i);
  assert.match(sql, /appointment\.status = 'in_progress'/i);
  assert.match(sql, /record\.status = 'draft'/i);
  assert.match(sql, /record\.prescription_draft is null/i);
  assert.doesNotMatch(sql, /update public\.clinical_documents/i);
  assert.doesNotMatch(sql, /\b(delete from|truncate|drop table|drop column)\b/i);
});
