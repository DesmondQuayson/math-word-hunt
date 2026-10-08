/**
 * Unauthenticated probe of the Phase 2B Super Admin session surface on a
 * deployed origin. Signs in to nothing and changes nothing.
 *
 *   ADMIN_PROBE_ORIGIN=https://...            (required)
 *   VERCEL_AUTOMATION_BYPASS_SECRET=...       (optional, protected previews only)
 *
 * The bypass value travels only as a header on requests to ADMIN_PROBE_ORIGIN
 * itself (scripts/vercel-protection-bypass.mjs), never in a URL; a redirect is
 * reported, never followed; everything printed goes through redact().
 *
 * Checks: /admin, /admin/mfa, forged and unknown session cookies and signed-out
 * POSTs are concealed as 404 with no-store/noindex; the sign-in page carries the
 * expiry notice and only a validated `next`; security headers are present.
 */
import { randomBytes } from "node:crypto";

import { createProtectionBypass } from "./vercel-protection-bypass.mjs";

const origin = (process.env.ADMIN_PROBE_ORIGIN ?? "").trim().replace(/\/$/, "");
if (!/^https:\/\/[a-z0-9.-]+$/.test(origin)) throw new Error("ADMIN_PROBE_ORIGIN must be an https origin");
const protection = createProtectionBypass({ origin, secret: (process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "").trim() });
const results = [];
const redact = (text) => protection.redact(text);
// A failed probe is reported redacted too, never as Node's raw error print.
process.on("uncaughtException", (error) => {
  process.stderr.write(`${redact(error?.stack ?? error)}\n`, () => process.exit(1));
});

async function probe(name, path, { method = "GET", headers = {}, body, expect }) {
  const url = `${origin}${path}`;
  const response = await fetch(url, { method, headers: { ...protection.headersFor(url), ...headers }, body, redirect: "manual" });
  const text = await response.text();
  const problems = expect(response, text);
  results.push({ name, status: response.status, pass: problems.length === 0, problems });
}

const concealed = (response, text) => {
  const problems = [];
  if (response.status !== 404) problems.push(`status ${response.status}`);
  if (!/no-store/.test(response.headers.get("cache-control") ?? "")) problems.push("missing no-store");
  if (response.headers.get("x-robots-tag") !== "noindex, nofollow") problems.push("missing noindex");
  if (/MathNexa Super Admin|End admin session/.test(text)) problems.push("admin content leaked");
  return problems;
};

await probe("GET /admin without a session is concealed", "/admin", { expect: concealed });
await probe("GET /admin/mfa without a challenge is concealed", "/admin/mfa", { expect: concealed });
await probe("a forged admin cookie is concealed", "/admin?section=users", { headers: { cookie: "mvh-admin-session=forged-admin=true" }, expect: concealed });
await probe("an unknown well-formed admin token is concealed", "/admin?section=users", {
  headers: { cookie: `mvh-admin-session=${randomBytes(32).toString("base64url")}` }, expect: concealed
});
await probe("a signed-out POST to an admin route is concealed", "/admin/users/action", {
  method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin }, body: "operation=sync-billing",
  expect: (response) => response.status === 404 ? [] : [`status ${response.status}`]
});
await probe("the Stay signed in endpoint is concealed without a session", "/admin/session/activity", {
  method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin }, body: "csrfToken=x",
  expect: (response) => response.status === 404 ? [] : [`status ${response.status}`]
});
await probe("the sign-in page explains the expiry and keeps a validated destination", "/admin/sign-in?expired=1&next=%2Fadmin%3Fsection%3Dusers", {
  expect: (response, text) => {
    const problems = [];
    if (response.status !== 200) problems.push(`status ${response.status}`);
    if (!text.includes("Your Super Admin session ended.")) problems.push("missing expiry notice");
    if (!/name="next" value="\/admin\?section=users"/.test(text)) problems.push("missing validated next");
    if (!/no-store/.test(response.headers.get("cache-control") ?? "")) problems.push("missing no-store");
    if (!response.headers.get("content-security-policy")) problems.push("missing CSP");
    return problems;
  }
});
for (const next of ["https://evil.example/", "//evil.example/admin", "/account", "/admin/users/action"]) {
  await probe(`the sign-in page drops an untrusted destination (${next})`, `/admin/sign-in?expired=1&next=${encodeURIComponent(next)}`, {
    expect: (response, text) => {
      const problems = [];
      if (response.status !== 200) problems.push(`status ${response.status}`);
      if (/name="next"/.test(text)) problems.push("untrusted next was kept");
      // The framework's own router payload may carry the raw query string as inert
      // data; what must never happen is the value becoming a link, form target,
      // resource or refresh destination.
      if (/(?:href|action|src|formaction|content)=["'][^"']*evil\.example/i.test(text)) problems.push("untrusted host used as a destination");
      const contexts = [...text.matchAll(/evil\.example/g)].map((match) => text.slice(Math.max(0, match.index - 50), match.index + 30).replace(/\s+/g, " "));
      if (contexts.length) results.push({ name: `where "${next}" appears (informational)`, status: response.status, pass: true, problems: [], contexts });
      return problems;
    }
  });
}

const failed = results.filter((result) => !result.pass);
process.stdout.write(`${redact(JSON.stringify({ origin, checks: results.length, passed: results.length - failed.length, results }, null, 2))}\n`);
if (failed.length) process.exitCode = 1;
