import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = "supabase/migrations/20260722010000_care_continuity.sql";

test("continuity migration is additive, tenant-bound and non-destructive", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /create table if not exists public\.care_continuity_items/i);
  assert.match(sql, /clinic_id uuid not null references public\.clinics/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /public\.active_clinic_id\(\)/i);
  assert.doesNotMatch(sql, /drop table|truncate|delete from/i);
});

test("continuity generation is explicit-after-finalization and idempotent", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /source\.status <> 'completed'/i);
  assert.match(sql, /unique \(clinic_id, appointment_id, source_key\)/i);
  assert.match(sql, /on conflict \(clinic_id,appointment_id,source_key\) do nothing/i);
  assert.match(sql, /record\.return_guidance/i);
  assert.match(sql, /record\.exam_requests/i);
  assert.match(sql, /document\.document_type in \('referral','exam_request'\)/i);
});

test("completion, cancellation and reopening preserve history fields", async () => {
  const [migration, actions] = await Promise.all([
    readFile(migrationPath, "utf8"),
    readFile("src/app/(dashboard)/continuidade/actions.ts", "utf8"),
  ]);
  assert.match(migration, /completed_at timestamptz/);
  assert.match(migration, /cancelled_at timestamptz/);
  assert.match(migration, /cancellation_reason text/);
  assert.match(actions, /Informe o motivo do cancelamento/);
  assert.match(actions, /Informe a justificativa para reabrir/);
  assert.doesNotMatch(actions, /\.delete\(/);
});

test("AI does not call continuity mutations", async () => {
  const ai = await readFile("src/app/(dashboard)/consultas/clinical-ai-actions.ts", "utf8");
  assert.doesNotMatch(ai, /care_continuity_items|create_encounter_continuity_items/);
});
