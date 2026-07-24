import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const actionsPath = "src/app/(dashboard)/settings/team/actions.ts";
const callbackPath = "src/app/auth/callback/route.ts";
const callbackDestinationPath = "src/lib/auth/callback.ts";
const inviteTemplatePath = "docs/email-templates/invite.html";
const acceptancePath = "src/app/(auth)/auth/accept-invite/actions.ts";
const formPath = "src/components/auth/accept-invite-form.tsx";
const migrationPath =
  "supabase/migrations/20260722130000_secure_professional_email_invites.sql";
const onboardingMigrationPath =
  "supabase/migrations/20260722210000_complete_professional_invite_onboarding.sql";
const onboardingActionPath =
  "src/app/(auth)/auth/professional-onboarding/actions.ts";
const onboardingFormPath =
  "src/components/auth/professional-onboarding-form.tsx";

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
  assert.match(actions, /resolveServerInviteUrl/);
  assert.match(actions, /APP_URL_CONFIGURATION_ERROR/);
});

test("invite template sends token hash directly to the callback", async () => {
  const template = await readFile(inviteTemplatePath, "utf8");
  assert.match(
    template,
    /\{\{ \.RedirectTo \}\}\?token_hash=\{\{ \.TokenHash \}\}&type=invite/,
  );
  assert.doesNotMatch(template, /\{\{ \.ConfirmationURL \}\}/);
});

test("redirect diagnostic contains only safe URL resolution fields", async () => {
  const actions = await readFile(actionsPath, "utf8");
  const redirectLog = actions.match(
    /console\.info\("ASTER_INVITE_REDIRECT_DIAGNOSTIC",[\s\S]*?\n\s*\}\);/,
  )?.[0];
  assert.ok(redirectLog);
  for (const field of [
    "NODE_ENV",
    "VERCEL_ENV",
    "APP_URL_PRESENT",
    "VERCEL_PROJECT_PRODUCTION_URL_PRESENT",
    "NEXT_PUBLIC_SITE_URL_PRESENT",
    "siteUrl",
    "redirectTo",
  ])
    assert.match(redirectLog, new RegExp(field));
  assert.doesNotMatch(
    redirectLog,
    /serviceKey|SUPABASE_SERVICE_ROLE_KEY|token|password|email|clinic/i,
  );
});

test("invite button never uses signup confirmation APIs", async () => {
  const actions = await readFile(actionsPath, "utf8");
  assert.doesNotMatch(actions, /auth\.signUp|auth\.resend|generateLink/);
  assert.match(actions, /auth\.admin\.inviteUserByEmail/);
  assert.match(actions, /auth\.signInWithOtp/);
  assert.match(actions, /shouldCreateUser:\s*false/);
});

test("invite delivery logs the selected flow without tokens or service keys", async () => {
  const actions = await readFile(actionsPath, "utf8");
  assert.match(actions, /ASTER_PROFESSIONAL_INVITE_AUTH/);
  assert.match(actions, /magic_link/);
  assert.match(actions, /userState/);
  const structuredLog = actions.match(
    /console\.info\("ASTER_PROFESSIONAL_INVITE_AUTH",[\s\S]*?\n\s*\}\);/,
  )?.[0];
  assert.ok(structuredLog);
  assert.doesNotMatch(
    structuredLog,
    /token|serviceKey|SUPABASE_SERVICE_ROLE_KEY/,
  );
});

test("temporary delivery diagnostic exposes only safe operational fields", async () => {
  const actions = await readFile(actionsPath, "utf8");
  assert.match(actions, /ASTER_INVITE_DELIVERY_SAFE_DIAGNOSTIC/);
  assert.match(actions, /Falha ao enviar convite:/);
  assert.match(actions, /MISSING_SERVER_CONFIGURATION/);
  const safeLog = actions.match(
    /method\("ASTER_INVITE_DELIVERY_SAFE_DIAGNOSTIC",[\s\S]*?\n\s*\}\);/,
  )?.[0];
  assert.ok(safeLog);
  for (const field of [
    "stage",
    "code",
    "message",
    "status",
    "callback",
    "configuration",
  ])
    assert.match(safeLog, new RegExp(field));
  assert.doesNotMatch(
    safeLog,
    /email|fullName|clinicId|invitationId|role|token|password/i,
  );
});

test("callback establishes a session and never activates membership", async () => {
  const callback = await readFile(callbackPath, "utf8");
  assert.match(callback, /exchangeCodeForSession/);
  assert.match(callback, /verifyOtp/);
  assert.match(callback, /createServerClient/);
  assert.match(callback, /response\.cookies\.set/);
  assert.doesNotMatch(callback, /accept_my_clinic_invites/);
  const acceptance = await readFile(acceptancePath, "utf8");
  assert.match(acceptance, /accept_my_clinic_invite/);
});

test("acceptance requires password confirmation and authenticated RPC", async () => {
  const form = await readFile(formPath, "utf8");
  const acceptance = await readFile(acceptancePath, "utf8");
  assert.match(form, /password\.length < 8/);
  assert.match(form, /\\d/);
  assert.match(form, /A-Za-z/);
  assert.match(form, /password !== confirmation/);
  assert.match(acceptance, /auth\.updateUser\(\{/);
  assert.match(acceptance, /auth\.getUser/);
});

test("existing users accept membership without replacing their password", async () => {
  const form = await readFile(formPath, "utf8");
  const acceptance = await readFile(acceptancePath, "utf8");
  assert.match(form, /Sua conta já existe/);
  assert.match(form, /sem alterar sua[\s\S]*senha atual/);
  assert.match(acceptance, /requiresPassword/);
  assert.match(acceptance, /user_metadata\?\.invitation_id/);
});

test("callback strips sensitive URL data and offers safe recovery actions", async () => {
  const callback = await readFile(callbackPath, "utf8");
  assert.match(callback, /Solicitar novo convite/);
  assert.match(callback, /Voltar para o login/);
  assert.match(callback, /"Cache-Control": "no-store"/);
  assert.match(callback, /"Referrer-Policy": "no-referrer"/);
  assert.doesNotMatch(callback, /window\.location\.hash/);
  assert.doesNotMatch(callback, /setSession/);
  assert.doesNotMatch(callback, /onAuthStateChange/);
  assert.doesNotMatch(callback, /poll/i);
});

test("callback diagnostic records only safe operational fields", async () => {
  const callback = await readFile(callbackPath, "utf8");
  assert.match(callback, /ASTER_AUTH_CALLBACK_DIAGNOSTIC/);
  for (const field of [
    "stage",
    "hasTokenHash",
    "type",
    "verificationSucceeded",
    "sessionCreated",
    "redirectTarget",
    "safeErrorCode",
  ])
    assert.match(callback, new RegExp(field));
  const diagnostic = callback.match(/function diagnostic\([\s\S]*?\n\}/)?.[0];
  assert.ok(diagnostic);
  assert.doesNotMatch(
    diagnostic,
    /access_token|refresh_token|cookies|password|serviceRole|anonKey/i,
  );
});

test("callback accepts only the invite destination", async () => {
  const callback = await readFile(callbackPath, "utf8");
  assert.match(callback, /INVITE_REDIRECT_TARGET = "\/auth\/accept-invite"/);
  assert.match(
    callback,
    /verifyOtp\(\{\s*token_hash: tokenHash,\s*type: "invite"/,
  );
  assert.match(callback, /if \(type === "invite"\)/);
});

test("callback destination uses an explicit internal allowlist", async () => {
  const destination = await readFile(callbackDestinationPath, "utf8");
  assert.match(destination, /allowedAuthCallbackDestinations/);
  assert.match(destination, /"\/auth\/accept-invite"/);
  assert.match(destination, /"\/reset-password"/);
  assert.doesNotMatch(destination, /startsWith/);
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

test("professional fields are validated server-side and stored as invite metadata", async () => {
  const actions = await readFile(actionsPath, "utf8");
  const sql = await readFile(onboardingMigrationPath, "utf8");
  assert.match(actions, /role === "doctor"/);
  for (const field of [
    "specialty",
    "council",
    "council_number",
    "council_state",
    "phone",
  ]) {
    assert.match(actions, new RegExp(field));
    assert.match(sql, new RegExp(field));
  }
});

test("acceptance is idempotent and keeps membership invited until onboarding", async () => {
  const sql = await readFile(onboardingMigrationPath, "utf8");
  assert.match(
    sql,
    /selected_invite\.status='accepted' and selected_invite\.auth_user_id=current_user_id/,
  );
  assert.match(sql, /'invited'/);
  assert.match(
    sql,
    /onboarding_completed_at is not null then return destination/,
  );
  assert.match(sql, /set status='active'/);
});

test("onboarding cannot change clinic or role and destination is server-derived", async () => {
  const action = await readFile(onboardingActionPath, "utf8");
  const form = await readFile(onboardingFormPath, "utf8");
  const sql = await readFile(onboardingMigrationPath, "utf8");
  assert.doesNotMatch(form, /name="clinic_id"|name="role"/);
  const rpcCall = action.match(
    /supabase\.rpc\(\s*"complete_professional_invite_onboarding",[\s\S]*?\n\s*\);/,
  )?.[0];
  assert.ok(rpcCall);
  assert.doesNotMatch(rpcCall, /clinic_id:|role:/);
  assert.match(sql, /case selected_invite\.role/);
  assert.match(action, /complete_professional_invite_onboarding/);
});

test("onboarding diagnostic exposes only safe operational fields", async () => {
  const action = await readFile(onboardingActionPath, "utf8");
  assert.match(action, /ASTER_ONBOARDING_DIAGNOSTIC/);
  for (const field of [
    "action",
    "phase",
    "stage",
    "userIdPresent",
    "invitationIdPresent",
    "clinicIdPresent",
    "role",
    "profileUpdateSuccess",
    "membershipUpdateSuccess",
    "invitationAcceptSuccess",
    "activeClinicUpdateSuccess",
    "errorCode",
    "errorMessage",
    "errorDetails",
    "errorHint",
  ])
    assert.match(action, new RegExp(field));
  const diagnostic = action.match(
    /function onboardingDiagnostic\([\s\S]*?\n\}/,
  )?.[0];
  assert.ok(diagnostic);
  assert.doesNotMatch(
    diagnostic,
    /access_token|refresh_token|cookies|password|serviceRole|anonKey/i,
  );
  assert.match(
    action,
    /Falha ao concluir onboarding: \$\{stage\} — \$\{error\.code/,
  );
});

test("onboarding schema mismatch rejects non-professional roles", async () => {
  const onboardingSql = await readFile(onboardingMigrationPath, "utf8");
  const professionalProfileSql = await readFile(
    "supabase/migrations/20260711190000_clinic_identity_and_professional_profiles.sql",
    "utf8",
  );
  assert.match(onboardingSql, /insert into public\.professional_profiles/);
  assert.match(
    professionalProfileSql,
    /target_role not in \('doctor','clinic_admin'\)/,
  );
  assert.match(
    professionalProfileSql,
    /O profissional precisa ter vínculo ativo com a clínica/,
  );
});

test("audit covers invitation, password, onboarding and activation without secrets", async () => {
  const sql = await readFile(onboardingMigrationPath, "utf8");
  for (const event of [
    "professional_invited",
    "invitation_accepted",
    "password_created",
    "onboarding_started",
    "onboarding_completed",
    "user_activated",
  ])
    assert.match(sql, new RegExp(event));
  assert.doesNotMatch(sql, /service_role/);
});

test("email delivery and database divergence returns a reconciliation error", async () => {
  const actions = await readFile(actionsPath, "utf8");
  assert.match(actions, /ASTER_INVITE_RECONCILIATION/);
  assert.match(actions, /status precisa ser reconciliado/);
});
