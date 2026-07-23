import assert from "node:assert/strict";
import test from "node:test";

import {
  buildProfessionalInviteRedirectTo,
  DEVELOPMENT_INVITE_SITE_URL,
  InviteSiteUrlConfigurationError,
  resolveInviteSiteUrl,
} from "../../src/lib/invites/invite-url.ts";

test("production prioritizes APP_URL and normalizes its trailing slash", () => {
  assert.equal(
    resolveInviteSiteUrl({
      nodeEnv: "production",
      appUrl: "https://app.asterclin.com.br/",
      vercelProjectProductionUrl: "aster-crm-ai.vercel.app",
      nextPublicSiteUrl: "https://compatibility.example.com",
    }),
    "https://app.asterclin.com.br",
  );
});

test("production uses VERCEL_PROJECT_PRODUCTION_URL with HTTPS", () => {
  assert.equal(
    resolveInviteSiteUrl({
      nodeEnv: "production",
      appUrl: undefined,
      vercelProjectProductionUrl: "aster-crm-ai.vercel.app",
      nextPublicSiteUrl: undefined,
    }),
    "https://aster-crm-ai.vercel.app",
  );
});

test("production temporarily supports NEXT_PUBLIC_SITE_URL", () => {
  assert.equal(
    resolveInviteSiteUrl({
      nodeEnv: "production",
      appUrl: undefined,
      vercelProjectProductionUrl: undefined,
      nextPublicSiteUrl: "https://legacy.asterclin.com.br/",
    }),
    "https://legacy.asterclin.com.br",
  );
});

test("production rejects missing public URL configuration", () => {
  assert.throws(
    () =>
      resolveInviteSiteUrl({
        nodeEnv: "production",
        appUrl: undefined,
        vercelProjectProductionUrl: undefined,
        nextPublicSiteUrl: undefined,
      }),
    InviteSiteUrlConfigurationError,
  );
});

test("production rejects local hosts from every configured source", () => {
  for (const options of [
    { appUrl: "http://localhost:3000" },
    { vercelProjectProductionUrl: "127.0.0.1:3000" },
    { nextPublicSiteUrl: "http://[::1]:3000" },
  ])
    assert.throws(
      () =>
        resolveInviteSiteUrl({
          nodeEnv: "production",
          appUrl: undefined,
          vercelProjectProductionUrl: undefined,
          nextPublicSiteUrl: undefined,
          ...options,
        }),
      /não pode apontar para localhost/,
    );
});

test("development permits localhost when public URL configuration is absent", () => {
  const siteUrl = resolveInviteSiteUrl({
    nodeEnv: "development",
    appUrl: undefined,
    vercelProjectProductionUrl: undefined,
    nextPublicSiteUrl: undefined,
  });
  assert.equal(siteUrl, DEVELOPMENT_INVITE_SITE_URL);
  assert.equal(
    buildProfessionalInviteRedirectTo(siteUrl),
    "http://localhost:3000/auth/callback?next=%2Fauth%2Faccept-invite",
  );
});

test("production callback encodes the next destination", () => {
  const siteUrl = resolveInviteSiteUrl({
    nodeEnv: "production",
    appUrl: "https://app.asterclin.com.br/",
    vercelProjectProductionUrl: undefined,
    nextPublicSiteUrl: undefined,
  });
  assert.equal(
    buildProfessionalInviteRedirectTo(siteUrl),
    "https://app.asterclin.com.br/auth/callback?next=%2Fauth%2Faccept-invite",
  );
});
