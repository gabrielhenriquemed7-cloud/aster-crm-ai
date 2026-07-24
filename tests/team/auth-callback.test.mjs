import assert from "node:assert/strict";
import test from "node:test";

import { getSafeAuthCallbackDestination } from "../../src/lib/auth/callback.ts";

test("professional invite callback is allowed", () => {
  assert.equal(
    getSafeAuthCallbackDestination("/auth/accept-invite"),
    "/auth/accept-invite",
  );
});

test("password recovery callback remains allowed", () => {
  assert.equal(
    getSafeAuthCallbackDestination("/reset-password"),
    "/reset-password",
  );
});

test("callback without next uses the safe dashboard destination", () => {
  assert.equal(getSafeAuthCallbackDestination(), "/dashboard");
});

test("callback blocks absolute and protocol-relative external destinations", () => {
  for (const destination of [
    "https://malicious.example",
    "//malicious.example",
    "/auth/accept-invite?next=https://malicious.example",
  ])
    assert.equal(getSafeAuthCallbackDestination(destination), "/dashboard");
});
