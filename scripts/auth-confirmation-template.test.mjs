import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync(new URL("../supabase/templates/confirmation.html", import.meta.url), "utf8");
const text = readFileSync(new URL("../supabase/templates/confirmation.txt", import.meta.url), "utf8");
const config = readFileSync(new URL("../supabase/config.toml", import.meta.url), "utf8");

test("confirmation template keeps the provider verification URL and excludes untrusted interpolation", () => {
  const links = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(links, ["{{ .ConfirmationURL }}"]);
  for (const body of [html, text]) {
    const variables = [...body.matchAll(/{{[^}]+}}/g)].map((match) => match[0]);
    assert.ok(variables.length > 0);
    assert.ok(variables.every((variable) => variable === "{{ .ConfirmationURL }}"));
    assert.match(body, /This link can be used once\./);
    assert.match(body, /If you did not create a MathNexa account, you can ignore this email\./);
    assert.doesNotMatch(body, /<script|<img|<form|\bon\w+=|https?:\/\//i);
  }
});

test("local configuration enables the reviewed HTML and subject without an unsupported text MIME setting", () => {
  const confirmation = config.match(/\[auth\.email\.template\.confirmation\]([^]*?)(?=\n\[|$)/)?.[1];
  assert.ok(confirmation);
  assert.match(confirmation, /^subject = "Confirm your MathNexa email address"$/m);
  assert.match(confirmation, /^content_path = "\.\/supabase\/templates\/confirmation\.html"$/m);
  assert.doesNotMatch(confirmation, /^\w*text\w*\s*=/m);
  assert.match(config, /^enable_confirmations = true$/m);
  assert.match(config, /^otp_expiry = 3600$/m);
});
