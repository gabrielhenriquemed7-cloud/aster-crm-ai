import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260720021000_immutable_official_clinical_documents.sql";

test("official document migration is additive and non-destructive", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.doesNotMatch(sql, /\bdrop\s+table\b/i);
  assert.doesNotMatch(sql, /\bdrop\s+column\b/i);
  assert.doesNotMatch(sql, /\btruncate\b/i);
  assert.doesNotMatch(sql, /\bdelete\s+from\b/i);
  assert.match(sql, /add column if not exists snapshot_json jsonb/i);
  assert.match(sql, /add column if not exists rendered_html text/i);
  assert.match(sql, /add column if not exists pdf_storage_path text/i);
});

test("official issuance freezes a versioned snapshot and SHA-256 hash", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /'schema_version', 2/i);
  assert.match(sql, /snapshot_json = official_snapshot/i);
  assert.match(sql, /content_hash = public\.canonical_jsonb_sha256\(official_snapshot\)/i);
  assert.match(sql, /hash_algorithm = 'SHA-256'/i);
  assert.match(sql, /status = 'finalized'/i);
  assert.match(sql, /immutable_at = issued_timestamp/i);
});

test("database trigger blocks mutation of official clinical content", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /old\.status in \('finalized', 'signed', 'archived', 'cancelled'\)/i);
  assert.match(sql, /new\.snapshot_json is distinct from old\.snapshot_json/i);
  assert.match(sql, /new\.rendered_html is distinct from old\.rendered_html/i);
  assert.match(sql, /new\.content_hash is distinct from old\.content_hash/i);
  assert.match(sql, /immutable_update_blocked/i);
});

test("version chain and private PDF storage preserve prior documents", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /supersedes_document_id uuid references public\.clinical_documents/i);
  assert.match(sql, /superseded_by_document_id uuid references public\.clinical_documents/i);
  assert.match(sql, /create or replace function public\.supersede_clinical_document/i);
  assert.match(sql, /values \('clinical-documents', 'clinical-documents', false/i);
  assert.doesNotMatch(sql, /on conflict[^;]+pdf_storage_path[^;]+do update/is);
});

test("official print view does not invoke the current prescription renderer", async () => {
  const source = await readFile(
    "src/components/clinical-documents/print-document.tsx",
    "utf8",
  );
  assert.doesNotMatch(source, /buildPrescriptionPresentation/);
  assert.match(source, /snapshot_json\?\.prescription\?\.presentation/);
  assert.match(source, /snapshot_json\?\.legacy\?\.warning/);
});
