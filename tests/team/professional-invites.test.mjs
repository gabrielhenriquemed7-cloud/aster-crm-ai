import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const actionsPath = "src/app/(dashboard)/settings/team/actions.ts";
const callbackPath = "src/app/auth/callback/route.ts";
const acceptancePath = "src/app/(auth)/auth/accept-invite/actions.ts";
const formPath = "src/components/auth/accept-invite-form.tsx";
const migrationPath =
  "supabase/migrations/20260722130000_secure_professional_email_invites.sql";

test("service role and Supabase Admin invite remain server-only", async () => {
  const actions = await readFile(actionsPath, "utf8");
  const form = await readFile(formPath, "utf8");
  assert.match(actions, /^"use server"/);
  assert.match(actions, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(actions, /inviteUserByEmail/);
  assert.doesNotMatch(form, /SERVICE_ROLE|inviteUserByEmail/);
});

test("invite carries ASTER metadata and validated redirect", async () => {
  const actions = await readFile(actionsPath, "utf8");
  assert.match(actions, /clinic_name/);
  assert.match(actions, /invitation_id/);
  assert.match(actions, /auth\/callback\?next=\/auth\/accept-invite/);
});

test("opening the callback never activates membership", async () => {
  const callback = await readFile(callbackPath, "utf8");
  assert.doesNotMatch(callback, /accept_my_clinic_invites/);
  const acceptance = await readFile(acceptancePath, "utf8");
  assert.match(acceptance, /accept_my_clinic_invite/);
});

test("acceptance requires password confirmation and authenticated RPC", async () => {
  const form = await readFile(formPath, "utf8");
  const acceptance = await readFile(acceptancePath, "utf8");
  assert.match(form, /password\.length < 8/);
  assert.match(form, /password !== confirmation/);
  assert.match(form, /auth\.updateUser\(\{ password \}\)/);
  assert.match(acceptance, /auth\.getUser/);
});

test("migration enforces tenant, duplicate, expiry, cancellation, cooldown and audit", async () => {
  const sql = await readFile(migrationPath, "utf8");
  for (const pattern of [
    /current_clinic_admin_id/,
    /clinic_id = selected_clinic_id/,
    /Já existe um convite pendente/,
    /expires_at <= now\(\)/,
    /status = 'cancelled'/,
    /interval '60 seconds'/,
    /clinic_audit_logs/,
  ])
    assert.match(sql, pattern);
});

test("delivery failure is preserved and can be resent", async () => {
  const actions = await readFile(actionsPath, "utf8");
  const sql = await readFile(migrationPath, "utf8");
  assert.match(actions, /record_clinic_invite_delivery/);
  assert.match(sql, /invite_send_failed/);
  assert.match(sql, /status in \('pending', 'sent', 'expired', 'failed'\)/);
});

test("RLS limits invite reads to the authenticated e-mail", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /auth\.jwt\(\) ->> 'email'/);
  assert.match(sql, /lower\(email\)/);
});
