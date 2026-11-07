/**
 * READ-ONLY request/runtime-log evidence for the Super Admin "System health" panel (production).
 *
 *   node scripts/system-health-vercel-evidence.mjs [--diagnosis <file written by invoke-system-health-production-diagnosis.ps1>]
 *
 * Uses the authenticated Vercel CLI (no vault entry, no secret). Vercel keeps request records for 32 days, so:
 *  - for every unconfirmed sign-up in the diagnosis file that is still inside that window, the /auth/callback
 *    requests in the 24 hours after it (any request there means the emailed link was clicked, even if the link had
 *    expired or failed; none means it was never opened on the production domain);
 *  - 7 days of the platform's structured operational events (billing lifecycle and security taxonomy, see
 *    lib/observability and lib/billing/consumer-observability.ts) counted per day;
 *  - 7 days of HTTP 5xx responses.
 * Prints counts, timestamps, status codes, country and user-agent family only: Vercel's request records hold no
 * client address, and nothing here prints a path's query string.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const PROJECT = "mathnexa-platform-production";
const SCOPE = "bright-path-ed-tech";
const RETENTION_DAYS = 32;
const EVENTS = [
  "reconciliation-sweep-completed", "subscription-reconciliation-unavailable", "webhook-processing-failed", "webhook-manual-review",
  "entitlement-mismatch-unresolved", "entitlement-mismatch-repaired", "webhook-signature-invalid", "webhook-replay-detected",
  "authorization-denied", "auth-login-failed", "auth-rate-limited", "auth-signup-rate-limited", "auth-spray-suspected",
  "rate-limiter-unavailable", "security-dependency-unavailable", "security-config-error", "admin-auth-failed"
];
const args = new Map(process.argv.slice(2).map((arg, index, all) => (arg.startsWith("--") ? [arg, all[index + 1]] : null)).filter(Boolean));

function vercelLogs(source, query, since, until, extra = []) {
  const cli = ["vercel", "logs", source, "--project", PROJECT, "--scope", SCOPE, "--json", "--limit", "2000", "--since", since, "--until", until, ...extra, "--query", query];
  const result = process.platform === "win32"
    ? spawnSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", "npx", ...cli], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env: { ...process.env, VERCEL_TELEMETRY_DISABLED: "1" } })
    : spawnSync("npx", cli, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env: { ...process.env, VERCEL_TELEMETRY_DISABLED: "1" } });
  const records = String(result.stdout ?? "").split(/\r?\n/).filter((line) => line.startsWith("{")).map((line) => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter((record) => record && record.type !== "summary" && record.data);
  const problem = result.status === 0 ? null : (String(result.stderr ?? "").match(/"message":"([^"]+)"/)?.[1] ?? `exit ${result.status}`);
  return { records, problem };
}
const family = (agent) => String(agent ?? "").replace(/^Mozilla\/5\.0 \(([^;)]+).*/, "browser: $1").replace(/^(.{0,32}).*/, "$1");
const iso = (value) => new Date(value).toISOString().replace(/\.\d{3}Z$/, "Z");
const now = Date.now();
const evidence = { label: "system-health-vercel-evidence", takenAt: new Date(now).toISOString(), project: PROJECT };

// 1. Emailed links: was each unconfirmed sign-up's link ever opened on the production domain?
if (args.get("--diagnosis")) {
  const diagnosis = JSON.parse(readFileSync(args.get("--diagnosis"), "utf8").replace(/^\uFEFF/, ""));
  const signups = Array.isArray(diagnosis.emailLinks?.signups) ? diagnosis.emailLinks.signups : [];
  // A request record names no account. Supabase confirms the address and redirects to /auth/callback within a second,
  // so a callback up to two minutes after another account's confirmation is that account's (mail scanners and double
  // taps add duplicates); only the rest could belong to the unconfirmed sign-up (for example an expired link).
  const confirmations = signups.filter((row) => row.email_confirmed_at).map((row) => ({ account: row.account, at: Date.parse(row.email_confirmed_at) }));
  evidence.unconfirmedSignupLinks = signups.filter((row) => !row.email_confirmed_at).map((row) => {
    const start = Date.parse(row.created_at);
    if (now - start > (RETENTION_DAYS - 1) * 86_400_000) return { account: row.account, createdAt: row.created_at, callbacks: "outside Vercel's 32-day request retention" };
    const end = Math.min(start + 86_400_000, now);
    const { records, problem } = vercelLogs("requests", "requestPath:/auth/callback", iso(start), iso(end));
    if (problem) return { account: row.account, createdAt: row.created_at, callbacks: `unavailable: ${problem}` };
    const requests = records.map((record) => {
      const at = Date.parse(record.data.timestamp);
      const owner = confirmations.find((confirmation) => at >= confirmation.at - 1_000 && at <= confirmation.at + 120_000);
      return { at: record.data.timestamp, status: record.data.httpStatus, country: record.data.clientIpCountry ?? null, agent: family(record.data.clientUserAgent), followsConfirmationOf: owner ? owner.account : null };
    });
    return { account: row.account, createdAt: row.created_at, window: `${iso(start)} .. ${iso(end)}`, callbacks: requests.length,
      unexplainedCallbacks: requests.filter((request) => !request.followsConfirmationOf).length, requests };
  });
} else {
  evidence.unconfirmedSignupLinks = "pass --diagnosis <file> to check the emailed links of unconfirmed sign-ups";
}

// 2. Structured operational events, 7 days, per day.
const weekStart = iso(now - 7 * 86_400_000);
const nowIso = iso(now);
evidence.operationalEvents7d = Object.fromEntries(EVENTS.map((code) => {
  const { records, problem } = vercelLogs("runtime", `environment:production AND ${code}`, weekStart, nowIso);
  if (problem) return [code, `unavailable: ${problem}`];
  const days = {};
  for (const record of records) { const day = String(record.data.timestamp).slice(0, 10); days[day] = (days[day] ?? 0) + 1; }
  return [code, { total: records.length, days }];
}));

// 3. Server errors, 7 days.
{
  const { records, problem } = vercelLogs("requests", "httpStatus >= 500", weekStart, nowIso, ["--environment", "production"]);
  evidence.http5xx7d = problem ? `unavailable: ${problem}` : { total: records.length, byRoute: records.reduce((acc, record) => { const key = `${record.data.httpStatus} ${record.data.route ?? record.data.requestPath?.split("?")[0]}`; acc[key] = (acc[key] ?? 0) + 1; return acc; }, {}) };
}
process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
