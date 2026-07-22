import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const templates = [
  "invite",
  "recovery",
  "confirmation",
  "magic-link",
  "change-email",
];

for (const name of templates)
  test(`${name} has responsive ASTER branding and a secure fallback link`, async () => {
    const html = await readFile(`docs/email-templates/${name}.html`, "utf8");
    assert.match(html, /ASTER CRM AI/);
    assert.match(html, /#16a34a/i);
    assert.match(html, /max-width:\s*600px/);
    assert.match(html, /@media\s*\(max-width:\s*620px\)/);
    assert.match(html, /prefers-color-scheme:\s*dark/);
    assert.match(html, /font-family:\s*Inter,\s*Arial,\s*sans-serif/);
    assert.match(html, /\{\{ \.ConfirmationURL \}\}/);
    assert.match(html, /https:\/\/asterclin\.com\.br/);
    assert.doesNotMatch(html, /<script|javascript:/i);
  });

test("invite supports optional name, clinic and role personalization", async () => {
  const html = await readFile("docs/email-templates/invite.html", "utf8");
  assert.match(html, /\.Data\.full_name/);
  assert.match(html, /\.Data\.clinic_name/);
  assert.match(html, /\.Data\.role/);
  assert.match(html, /\.Email/);
});
