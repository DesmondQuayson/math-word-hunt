// Rotates the STAGING Vercel "Protection Bypass for Automation" secret (project mathnexa-platform-staging only).
//
// Launched by scripts/rotate-staging-protection-bypass.ps1, which loads the vault's current value into this process.
//   plan   (default) read-only: confirms the staging project and that the vault holds its one automation-bypass entry.
//   apply  revokes the vault's current secret and has Vercel generate a new one (one PATCH through the authenticated
//          Vercel CLI, body on stdin), stores the new value in the DPAPI vault through scripts/update-phase7d-vault.ps1
//          (value handed over in that child's environment only), then proves the project and the vault agree and,
//          with ROTATE_VERIFY_ORIGIN, that a staging preview accepts the new secret and refuses the old one.
//   resync recovery: stores the project's single current secret in the vault (if a vault write failed after apply).
// No secret is ever printed, put on a command line or URL, or written anywhere but the vault.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

import { PHASE7D_VERCEL_PROJECT_ID as PROJECT_ID, PHASE7D_VERCEL_PROJECT_NAME as PROJECT_NAME, PHASE7D_VERCEL_SCOPE as SCOPE, PHASE7D_VERCEL_TEAM_ID as TEAM_ID } from "./phase7d-hosted-contract.mjs";
import { createProtectionBypass } from "./vercel-protection-bypass.mjs";

const mode = process.env.ROTATE_BYPASS_MODE ?? "plan";
if (!["plan", "apply", "resync"].includes(mode)) throw new Error("ROTATE_BYPASS_MODE must be plan, apply or resync");
const vercelCli = process.env.ROTATE_VERCEL_CLI ?? "";
const vaultUpdate = process.env.ROTATE_VAULT_UPDATE_SCRIPT ?? "";
const verifyOrigin = (process.env.ROTATE_VERIFY_ORIGIN ?? "").trim().replace(/\/$/, "");
const current = (process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "").trim();
if (!vercelCli || !existsSync(vercelCli)) throw new Error("authenticated Vercel CLI unavailable");
if (mode !== "plan" && (!vaultUpdate || !existsSync(vaultUpdate))) throw new Error("vault update script unavailable");
if (verifyOrigin && !/^https:\/\/mathnexa-platform-staging-[a-z0-9]+-bright-path-ed-tech\.vercel\.app$/.test(verifyOrigin)) {
  throw new Error("ROTATE_VERIFY_ORIGIN must be a mathnexa-platform-staging preview URL");
}

const secrets = current ? [current] : [];
const redact = (text) => secrets.reduce((out, secret) => out.split(secret).join("[bypass-secret]"), String(text));
const say = (line) => process.stdout.write(`${redact(line)}\n`);

function vercel(args, body) {
  const full = [...args, "--scope", SCOPE];
  const executable = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : vercelCli;
  const invocation = process.platform === "win32" ? ["/d", "/s", "/c", vercelCli, ...full] : full;
  const result = spawnSync(executable, invocation, {
    encoding: "utf8",
    input: body,
    stdio: [body === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    env: { ...process.env, VERCEL_TELEMETRY_DISABLED: "1" },
    maxBuffer: 16 * 1024 * 1024
  });
  const stdout = String(result.stdout ?? "");
  const start = stdout.indexOf("{");
  let parsed = null;
  try { parsed = start >= 0 ? JSON.parse(stdout.slice(start)) : null; } catch { parsed = null; }
  if (parsed?.protectionBypass) for (const secret of Object.keys(parsed.protectionBypass)) if (!secrets.includes(secret)) secrets.push(secret);
  if (result.status !== 0 || !parsed) throw new Error(`vercel api failed (${result.status}): ${redact(`${result.stderr ?? ""}`).trim().slice(-300)}`);
  return parsed;
}

function readProject() {
  const project = vercel(["api", `/v9/projects/${PROJECT_ID}`, "--raw"]);
  if (project.id !== PROJECT_ID || project.name !== PROJECT_NAME || project.accountId !== TEAM_ID) throw new Error("refusing: not the staging project");
  const entries = Object.entries(project.protectionBypass ?? {}).filter(([, meta]) => meta?.scope === "automation-bypass");
  return { entries, envVar: entries.filter(([, meta]) => meta?.isEnvVar === true).map(([secret]) => secret) };
}

function saveVault(value) {
  const result = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", vaultUpdate, "-Name", "VERCEL_AUTOMATION_BYPASS_SECRET"], {
    encoding: "utf8",
    env: { ...process.env, PHASE7D_VAULT_SECRET_VALUE: value },
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (result.status !== 0) throw new Error("vault update failed (run with -Resync to store the project's current secret)");
}

async function verifyOnPreview(fresh, old) {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  try {
    const accepted = await browser.newContext();
    await createProtectionBypass({ origin: verifyOrigin, secret: fresh }).install(accepted);
    say(`verify: ${verifyOrigin} accepts the new secret`);
    if (old) {
      const refused = await browser.newContext();
      const outcome = await createProtectionBypass({ origin: verifyOrigin, secret: old }).install(refused).then(() => "accepted", () => "refused");
      if (outcome !== "refused") throw new Error("the revoked secret still opens the preview");
      say(`verify: ${verifyOrigin} refuses the revoked secret`);
    }
  } finally {
    await browser.close();
  }
}

const before = readProject();
say(`project ${PROJECT_NAME} (${PROJECT_ID}, team ${TEAM_ID}); automation-bypass entries: ${before.entries.length}; ` +
  `vault value is an entry: ${before.entries.some(([secret]) => secret === current) ? "yes" : "no"}; ` +
  `vault value is the deployment env-var entry: ${before.envVar.includes(current) ? "yes" : "no"}`);

if (mode === "plan") {
  say("plan only: -Apply would revoke the vault's current secret, have Vercel generate a new one, store it in the vault and verify. Nothing was changed.");
} else if (mode === "resync") {
  if (before.entries.length !== 1) throw new Error(`resync needs exactly one automation-bypass entry (found ${before.entries.length})`);
  saveVault(before.entries[0][0]);
  say("resync: the project's current secret is stored in the vault");
  if (verifyOrigin) await verifyOnPreview(before.entries[0][0], null);
} else {
  if (!current || !before.entries.some(([secret]) => secret === current)) throw new Error("refusing: the vault's secret is not an entry of the staging project (rotate in the Vercel dashboard, then -Resync)");
  vercel(["api", `/v1/projects/${PROJECT_ID}/protection-bypass`, "-X", "PATCH", "--input", "-", "--raw"], JSON.stringify({ revoke: { secret: current, regenerate: true } }));
  let after = readProject();
  if (after.entries.some(([secret]) => secret === current)) throw new Error("the old secret is still an entry after the revoke");
  const fresh = after.entries.map(([secret]) => secret);
  if (fresh.length !== 1) throw new Error(`expected exactly one new automation-bypass entry, found ${fresh.length}`);
  if (!after.envVar.includes(fresh[0])) {
    vercel(["api", `/v1/projects/${PROJECT_ID}/protection-bypass`, "-X", "PATCH", "--input", "-", "--raw"], JSON.stringify({ update: { secret: fresh[0], isEnvVar: true } }));
    after = readProject();
    if (!after.envVar.includes(fresh[0])) throw new Error("the new secret is not the deployment env-var entry");
  }
  saveVault(fresh[0]);
  say("rotated: the old secret is revoked; the new secret is stored in the vault (never printed)");
  if (verifyOrigin) await verifyOnPreview(fresh[0], current);
}
