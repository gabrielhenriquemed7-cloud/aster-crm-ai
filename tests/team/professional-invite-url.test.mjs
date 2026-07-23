import assert from "node:assert/strict";
import test from "node:test";

import {
  DEVELOPMENT_SITE_URL,
  getProfessionalInviteCallbackUrl,
  PublicAppUrlConfigurationError,
  resolvePublicAppUrl,
} from "../../src/lib/site-url.ts";

test("development permits localhost when the public URL is absent", () => {
  assert.equal(
    resolvePublicAppUrl({
      nodeEnv: "development",
      configuredUrl: undefined,
    }),
    DEVELOPMENT_SITE_URL,
  );
  assert.equal(
    getProfessionalInviteCallbackUrl({
      nodeEnv: "development",
      configuredUrl: undefined,
    }),
    "http://localhost:3000/auth/callback?next=/auth/accept-invite",
  );
});

test("production uses the configured ASTER URL and normalizes trailing slashes", () => {
  assert.equal(
    resolvePublicAppUrl({
      nodeEnv: "production",
      configuredUrl: "https://app.asterclin.com.br/",
    }),
    "https://app.asterclin.com.br",
  );
  assert.equal(
    getProfessionalInviteCallbackUrl({
      nodeEnv: "production",
      configuredUrl: "https://app.asterclin.com.br/",
    }),
    "https://app.asterclin.com.br/auth/callback?next=/auth/accept-invite",
  );
});

test("production rejects a missing public URL before e-mail delivery", () => {
  assert.throws(
    () =>
      resolvePublicAppUrl({
        nodeEnv: "production",
        configuredUrl: undefined,
      }),
    PublicAppUrlConfigurationError,
  );
});

test("production rejects localhost before e-mail delivery", () => {
  assert.throws(
    () =>
      resolvePublicAppUrl({
        nodeEnv: "production",
        configuredUrl: "http://localhost:3000",
      }),
    /não pode apontar para localhost/,
  );
});
