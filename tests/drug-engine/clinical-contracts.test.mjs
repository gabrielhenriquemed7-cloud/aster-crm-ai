import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateQuantity,
  canUseClinicalStatus,
} from "../../src/lib/drug-engine/clinical-contracts.ts";

test("calculates exact tablet quantity without package rounding", () => {
  const result = calculateQuantity({
    amountPerAdministration: 1,
    administrationsPerDay: 4,
    durationDays: 5,
    unit: { singular: "comprimido", plural: "comprimidos" },
  });
  assert.equal(result.displayQuantity, "20 comprimidos");
  assert.equal(result.packageEstimate, null);
});

test("reports package estimate without replacing required quantity", () => {
  const result = calculateQuantity({
    amountPerAdministration: 1,
    administrationsPerDay: 3,
    durationDays: 7,
    unit: { singular: "cápsula", plural: "cápsulas" },
    packageUnits: 20,
  });
  assert.equal(result.requiredUnits, 21);
  assert.deepEqual(result.packageEstimate, {
    packageCount: 2,
    packageUnits: 20,
    dispensedUnits: 40,
  });
});

test("calculates measurable liquid quantity", () => {
  const result = calculateQuantity({
    amountPerAdministration: 5,
    administrationsPerDay: 3,
    durationDays: 7,
    unit: { singular: "mL", plural: "mL" },
  });
  assert.equal(result.displayQuantity, "105 mL");
});

test("only reviewed and approved clinical data can be consumed", () => {
  assert.equal(canUseClinicalStatus("reviewed"), true);
  assert.equal(canUseClinicalStatus("approved"), true);
  assert.equal(canUseClinicalStatus("draft"), false);
  assert.equal(canUseClinicalStatus("suspended"), false);
  assert.equal(canUseClinicalStatus("outdated"), false);
});
