// PRODUCTION pipeline for the owner-approved subscription lifecycle repair.
// One stage per invocation, every stage auditable, every output redacted.
//
//   --stage=preflight       identify the production Vercel deployment and the
//                           production database, capture the migration head, the
//                           pending set, billing row counts, host behaviour and
//                           the rollback target. Reads only.
//   --stage=migrate         apply migration 20260907130000 to the PRODUCTION
//                           database through the IPv4 session pooler. Refuses
//                           unless it is the ONLY pending migration and the
//                           rollback file exists.
//   --stage=verify          dump the production public schema (no data) and
//                           verify the synchronizer, throttle, wrapper, admin
//                           dependency, columns, constraints, RLS and indexes.
//   --stage=deploy-preview  upload the EXACT certified runtime to the production
//                           project as a NON-aliased preview.
//   --stage=probe-preview   webhook/health/security probes against that preview.
//   --stage=promote         move the production alias to the certified deployment.
//   --stage=probe-live      probe the configured live webhook host and the apex.
//   --stage=cron-secret     create the production-only scheduler secret.
//
// No stage charges, refunds, cancels, or writes customer data. The customer
// repair runs separately through scripts/invoke-consumer-billing-reconcile.ps1.
// The staging project and the ShowMe/MAP Prep projects are never addressed.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const PRODUCTION_VERCEL_PROJECT = "mathnexa-platform-production";
const PRODUCTION_ORIGIN = "https://mathnexa.com";
const PRODUCTION_VERCEL_HOST = "mathnexa-platform-production.vercel.app";
const SCOPE = "bright-path-ed-tech";
const CERTIFIED_CANDIDATE_COMMIT = "1e707ee";
const MIGRATION_VERSION = "20260907130000";
const STAGING_PROJECT_REF = "gcmuhzxkwvfireyrearl";
const FORBIDDEN_PROJECTS = ["showme-map-prep-production", "showme-map-prep-staging", "mathnexa-platform-staging", "mathnexa-production"];
const BILLING_TABLES = ["billing_customers", "billing_subscriptions", "consumer_game_entitlements", "billing_webhook_events", "consumer_accounts"];
const BACKEND_USER_AGENT = "mathnexa-production-repair/1.0 (backend script)";

const args = new Map(process.argv.slice(2).map((arg) => { const [key, value = "true"] = arg.split("=", 2); return [key, value]; }));
const stage = args.get("--stage") ?? "preflight";
const repositoryRoot = resolve(process.cwd());
const supabaseCli = resolve("node_modules/supabase/dist/supabase.js");
const logFile = args.get("--log") ?? process.env.LIFECYCLE_LOG_FILE?.trim() ?? "";

const secrets = [];
function redact(value) {
  let safe = String(value ?? "");
  for (const secret of secrets) if (secret) { safe = safe.replaceAll(secret, "[REDACTED]"); const encoded = encodeURIComponent(secret); if (encoded !== secret) safe = safe.replaceAll(encoded, "[REDACTED]"); }
  return safe
    .replace(/(?:sk|rk|pk)_(?:test|live)_[A-Za-z0-9_]+/g, "[key]")
    .replace(/sbp_[A-Za-z0-9_-]+/g, "[token]")
    .replace(/whsec_[A-Za-z0-9]+/g, "[whsec]")
    .replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, "[sbkey]")
    .replace(/postgresql:\/\/\S+/g, "postgresql://[REDACTED]");
}
if (logFile) {
  const { appendFileSync } = await import("node:fs");
  for (const method of ["log", "error"]) {
    const original = console[method].bind(console);
    console[method] = (...parts) => { original(...parts); try { appendFileSync(logFile, `${new Date().toISOString()} ${redact(parts.map(String).join(" "))}\n`); } catch { /* best effort */ } };
  }
}
const step = (label) => console.log(`STEP ${new Date().toISOString()} ${label}`);
function required(name, pattern = /\S/) {
  const value = process.env[name]?.trim() ?? "";
  if (!pattern.test(value)) throw new Error(`missing-${name.toLowerCase().replaceAll("_", "-")}`);
  return value;
}
function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, { cwd: options.cwd ?? repositoryRoot, encoding: "utf8", env: options.env ?? process.env, input: options.input, stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"], shell: options.shell ?? false, maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0 && !options.allowFailure) throw new Error(`command-failed:${redact(`${result.stdout}\n${result.stderr}`).slice(-3000)}`);
  return options.allowFailure ? { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" } : result.stdout.trim();
}
function check(condition, code) { if (!condition) throw new Error(code); }
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const evidence = { stage, startedAt: new Date().toISOString() };

// --- production database ------------------------------------------------------
// The production project is not visible to the personal access token, and its
// direct host is IPv6-only while this machine has IPv4 egress only, so the
// migration travels over the IPv4 session pooler. The connection string is
// assembled here, registered as a secret, and never printed.
function productionDatabaseUrl() {
  // Supabase project refs are canonically lowercase. The vault copy was typed by
  // hand and PowerShell's -match is case-insensitive, so it can be mixed case;
  // DNS tolerates that but the pooler username (postgres.<ref>) does not.
  const ref = required("SUPABASE_PRODUCTION_PROJECT_REF", /^[A-Za-z]{20}$/).toLowerCase();
  check(ref !== STAGING_PROJECT_REF, "production-ref-is-staging-refusing");
  const password = required("SUPABASE_PRODUCTION_DB_PASSWORD", /^.{12,}$/);
  const region = process.env.SUPABASE_PRODUCTION_REGION?.trim() || "us-east-2";
  const poolerHost = process.env.SUPABASE_PRODUCTION_POOLER_HOST?.trim() || `aws-0-${region}.pooler.supabase.com`;
  secrets.push(password, encodeURIComponent(password));
  const url = `postgresql://postgres.${ref}:${encodeURIComponent(password)}@${poolerHost}:5432/postgres`;
  secrets.push(url);
  return { url, ref, poolerHost };
}
function supabase(commandArgs, workdir, options = {}) {
  return run(process.execPath, [supabaseCli, ...commandArgs, "--workdir", workdir, "--yes"], {
    env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "true" }, ...options
  });
}
function withWorkdir(action) {
  const workRoot = mkdtempSync(join(tmpdir(), "mathnexa-lifecycle-production-"));
  try {
    cpSync(resolve("supabase"), join(workRoot, "supabase"), { recursive: true });
    return action(workRoot);
  } finally {
    rmSync(workRoot, { recursive: true, force: true });
  }
}
/**
 * Remote migration versions, newest last. Read-only.
 *
 * The CLI detects an agent session and emits JSON
 * ({"migrations":[{local,remote,time}...]}) instead of the ASCII table; an entry
 * whose `remote` is empty is pending. The table form is still parsed as a
 * fallback so this does not depend on that detection.
 */
function remoteMigrations(url, workRoot) {
  const listed = supabase(["migration", "list", "--db-url", url], workRoot, { allowFailure: true });
  const text = redact(`${listed.stdout}\n${listed.stderr}`);
  check(listed.status === 0, `production-database-unreachable:${text.slice(-500)}`);
  const remote = [];
  const local = [];
  const jsonLine = text.split("\n").map((line) => line.trim()).find((line) => line.startsWith("{") && line.includes("\"migrations\""));
  if (jsonLine) {
    const parsed = JSON.parse(jsonLine);
    for (const entry of parsed.migrations ?? []) {
      if (entry.local) local.push(String(entry.local));
      if (entry.remote) remote.push(String(entry.remote));
    }
    check(local.length > 0 || remote.length > 0, "migration-list-returned-no-rows");
    return { remote, local, text, format: "json" };
  }
  for (const line of text.split("\n")) {
    const match = line.match(/^\s*(\d{14})?\s*\|\s*(\d{14})?\s*\|/);
    if (!match) continue;
    if (match[1]) local.push(match[1]);
    if (match[2]) remote.push(match[2]);
  }
  check(local.length > 0 || remote.length > 0, "migration-list-unparseable");
  return { remote, local, text, format: "table" };
}
function localMigrationVersions() {
  return run("git", ["ls-files", "supabase/migrations"]).split("\n")
    .map((line) => line.trim().split("/").pop() ?? "")
    .map((name) => name.slice(0, 14))
    .filter((version) => /^\d{14}$/.test(version));
}
async function restCount(ref, table) {
  const key = required("SUPABASE_PRODUCTION_SECRET_KEY", /^(sb_secret_|eyJ)/);
  secrets.push(key);
  const headers = { apikey: key, Prefer: "count=exact", "User-Agent": BACKEND_USER_AGENT };
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;
  const response = await fetch(`https://${ref}.supabase.co/rest/v1/${table}?select=*&limit=0`, { method: "HEAD", headers });
  const range = response.headers.get("content-range");
  return response.ok && range ? Number(range.split("/").pop()) : `HTTP ${response.status}`;
}

// --- Vercel ------------------------------------------------------------------
function vercelBinary() { return process.env.LIFECYCLE_VERCEL_CLI?.trim() || "npx"; }
function vercel(commandArgs, options = {}) {
  const binary = vercelBinary();
  return binary === "npx"
    ? run("npx", ["--no-install", "vercel", ...commandArgs], { shell: true, ...options })
    : run(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", binary, ...commandArgs], options);
}
function inspectField(text, field) {
  const line = text.split("\n").map((entry) => entry.trim()).find((entry) => new RegExp(`^${field}\\s`).test(entry));
  return line ? line.split(/\s+/).slice(1).join(" ").trim() : null;
}
function inspectDeployment(target) {
  const output = vercel(["inspect", target, "--scope", SCOPE], { allowFailure: true });
  const text = `${output.stdout}\n${output.stderr}`;
  return {
    id: inspectField(text, "id"), name: inspectField(text, "name"), target: inspectField(text, "target"),
    status: inspectField(text, "status"), url: inspectField(text, "url"), created: inspectField(text, "created"),
    aliases: text.split("\n").map((line) => line.trim()).filter((line) => line.startsWith("╶ https://")).map((line) => line.replace("╶ ", "").trim())
  };
}
async function probe(url, options = {}) {
  const response = await fetch(url, { redirect: "manual", headers: { "User-Agent": BACKEND_USER_AGENT, ...(options.headers ?? {}) }, ...options });
  const body = await response.text();
  return { status: response.status, location: response.headers.get("location"), cacheControl: response.headers.get("cache-control"), matchedPath: response.headers.get("x-matched-path"), body: body.slice(0, 160) };
}
function assertRuntimeIsCertified() {
  const certified = run("git", ["rev-parse", CERTIFIED_CANDIDATE_COMMIT]);
  const diff = run("git", ["diff", "--stat", certified, "HEAD", "--", "apps", "packages", "supabase", "package.json", "package-lock.json", "turbo.json", "tsconfig.json"]);
  check(diff === "", `runtime-differs-from-certified-candidate:${diff.slice(-600)}`);
  check(run("git", ["status", "--porcelain", "--", "apps", "packages", "supabase", "package.json", "package-lock.json"]) === "", "runtime-working-tree-dirty");
  return certified;
}

// --- stages ------------------------------------------------------------------
async function preflight() {
  step("vercel production identity");
  const live = inspectDeployment(PRODUCTION_ORIGIN);
  evidence.currentProductionDeployment = live;
  check(live.name === PRODUCTION_VERCEL_PROJECT, `apex-served-by-unexpected-project:${live.name}`);
  check(!FORBIDDEN_PROJECTS.includes(live.name ?? ""), "apex-served-by-a-project-this-repair-must-not-touch");
  check(live.target === "production", `apex-deployment-not-production-target:${live.target}`);
  check((live.aliases ?? []).includes(PRODUCTION_ORIGIN), "apex-alias-missing-from-deployment");
  evidence.rollbackTarget = { id: live.id, url: live.url, retained: true };

  step("production health and host behaviour");
  evidence.health = await probe(`${PRODUCTION_ORIGIN}/api/health`);
  evidence.webhookApexBefore = await probe(`${PRODUCTION_ORIGIN}/api/billing/webhook`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  evidence.webhookConfiguredHostBefore = await probe(`https://${PRODUCTION_VERCEL_HOST}/api/billing/webhook`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });

  step("production database identity, head and row counts");
  const { ref, poolerHost, url } = productionDatabaseUrl();
  evidence.productionDatabase = { ref, poolerHost };
  withWorkdir((workRoot) => {
    const { remote, text } = remoteMigrations(url, workRoot);
    evidence.remoteMigrationCount = remote.length;
    evidence.remoteMigrationHead = remote.slice(-3);
    evidence.migrationAlreadyApplied = remote.includes(MIGRATION_VERSION);
    const local = localMigrationVersions();
    evidence.localMigrationCount = local.length;
    evidence.pendingMigrations = local.filter((version) => !remote.includes(version));
    evidence.migrationListLines = text.split("\n").filter((line) => /\d{14}/.test(line)).length;
  });
  evidence.rowCountsBefore = {};
  for (const table of BILLING_TABLES) evidence.rowCountsBefore[table] = await restCount(ref, table);
  evidence.rollbackFilePresent = run("git", ["ls-files", "supabase/rollback"]).includes("subscription_lifecycle_reconciliation.sql");
  console.log(`PREFLIGHT ${redact(JSON.stringify(evidence, null, 2))}`);
}

function migrate() {
  step("production migration preflight");
  const { url } = productionDatabaseUrl();
  withWorkdir((workRoot) => {
    const { remote } = remoteMigrations(url, workRoot);
    evidence.appliedBefore = remote.length;
    check(!remote.includes(MIGRATION_VERSION) || args.has("--allow-reapply"), "migration-already-applied");
    const pending = localMigrationVersions().filter((version) => !remote.includes(version));
    evidence.migrationsToApply = pending;
    check(pending.length === 1 && pending[0] === MIGRATION_VERSION, `unexpected-pending-migrations:${pending.join(",") || "none"}`);
    check(run("git", ["ls-files", "supabase/rollback"]).includes("subscription_lifecycle_reconciliation.sql"), "rollback-file-missing");
    evidence.rollbackFile = "supabase/rollback/subscription_lifecycle_reconciliation.sql";

    step("dry run");
    const dry = supabase(["db", "push", "--db-url", url, "--dry-run"], workRoot);
    evidence.dryRun = redact(dry).split("\n").map((line) => line.trim()).filter(Boolean).slice(-6);

    step("applying migration to production");
    const pushed = supabase(["db", "push", "--db-url", url], workRoot);
    evidence.pushOutput = redact(pushed).split("\n").map((line) => line.trim()).filter((line) => /2026090713|Applying|Finished|up to date/i.test(line)).slice(-6);

    const after = remoteMigrations(url, workRoot);
    evidence.appliedAfter = after.remote.length;
    evidence.migrationHeadAfter = after.remote.slice(-3);
    check(after.remote.includes(MIGRATION_VERSION), "migration-version-not-recorded");
  });
  console.log(`MIGRATE ${redact(JSON.stringify(evidence, null, 2))}`);
}

async function verify() {
  step("dumping the production public schema (no data) for verification");
  const { url, ref } = productionDatabaseUrl();
  let dump = "";
  withWorkdir((workRoot) => {
    const target = join(workRoot, "production-schema.sql");
    supabase(["db", "dump", "--db-url", url, "--schema", "public", "-f", target], workRoot);
    dump = readFileSync(target, "utf8");
  });
  // pg_dump quotes every identifier ("public"."name"), so each check tolerates
  // optional quotes rather than assuming the bare form.
  const has = (needle) => dump.includes(needle);
  const q = (name) => `"?${name}"?`;
  const definesFunction = (name) => new RegExp(`CREATE (?:OR REPLACE )?FUNCTION ${q("public")}\\.${q(name)}`).test(dump);
  const rlsFor = (table, mode) => new RegExp(`ALTER TABLE (?:ONLY )?${q("public")}\\.${q(table)} ${mode} ROW LEVEL SECURITY`).test(dump);
  const results = {
    synchronizer: definesFunction("synchronize_consumer_billing_subscription"),
    throttle: definesFunction("mark_consumer_billing_reconciliation_attempt"),
    wrapper: definesFunction("apply_consumer_billing_projection"),
    wrapperDelegatesToSynchronizer: /apply_consumer_billing_projection[\s\S]{0,2000}synchronize_consumer_billing_subscription/.test(dump),
    adminSyncBilling: /prepare_admin_account_operation[\s\S]{0,6000}sync-billing/.test(dump),
    columnEndedAt: new RegExp(`${q("ended_at")} timestamp`).test(dump),
    columnLatestInvoiceId: has("latest_invoice_id"),
    columnLastSynchronizedAt: has("last_synchronized_at"),
    columnLastSynchronizationSource: has("last_synchronization_source"),
    columnLastReconciliationAttemptAt: has("last_reconciliation_attempt_at"),
    eventAlias: has("invoice.payment_succeeded"),
    failureClasses: has("conflicting_current_subscription") && has("invoice_state_conflict") && has("trial_shape_conflict"),
    staleGuard: has("stale_ignored") && has("superseded_ignored"),
    rlsEnabled: BILLING_TABLES.filter((table) => rlsFor(table, "ENABLE")),
    rlsForced: BILLING_TABLES.filter((table) => rlsFor(table, "FORCE")),
    policies: (dump.match(/CREATE POLICY/g) ?? []).length,
    indexes: (dump.match(/CREATE (UNIQUE )?INDEX/g) ?? []).length,
    // The synchronizer takes 21 parameters, so its GRANT line is very long: match
    // the whole line rather than a fixed window after the function name.
    serviceRoleGrant: dump.split("\n").some((line) =>
      /^GRANT (?:ALL|EXECUTE) ON FUNCTION "?public"?\."?synchronize_consumer_billing_subscription/.test(line.trim()) && line.includes("service_role")),
    throttleGrant: dump.split("\n").some((line) =>
      /^GRANT (?:ALL|EXECUTE) ON FUNCTION "?public"?\."?mark_consumer_billing_reconciliation_attempt/.test(line.trim()) && line.includes("service_role")),
    synchronizerRevokedFromAnon: dump.split("\n").some((line) =>
      /^REVOKE ALL ON FUNCTION "?public"?\."?synchronize_consumer_billing_subscription/.test(line.trim())),
    dumpBytes: dump.length
  };
  evidence.verification = results;
  evidence.rowCountsAfter = {};
  for (const table of BILLING_TABLES) evidence.rowCountsAfter[table] = await restCount(ref, table);
  const pass = results.synchronizer && results.throttle && results.wrapper && results.wrapperDelegatesToSynchronizer &&
    results.adminSyncBilling && results.columnEndedAt &&
    results.columnLatestInvoiceId && results.columnLastSynchronizedAt && results.columnLastSynchronizationSource &&
    results.columnLastReconciliationAttemptAt && results.eventAlias && results.failureClasses && results.staleGuard &&
    results.rlsEnabled.length === BILLING_TABLES.length &&
    results.serviceRoleGrant && results.throttleGrant && results.synchronizerRevokedFromAnon &&
    results.policies > 0 && results.indexes > 0;
  evidence.verificationPass = pass;
  console.log(`VERIFY ${JSON.stringify({ ...results, rowCountsAfter: evidence.rowCountsAfter }, null, 2)}`);
  check(pass, "production-schema-verification-failed");
}

async function deployPreview() {
  step("uploading the certified runtime as a non-aliased preview");
  const certified = assertRuntimeIsCertified();
  const tree = run("git", ["rev-parse", "HEAD^{tree}"]);
  const commit = run("git", ["rev-parse", "HEAD"]);
  evidence.certifiedRuntime = certified; evidence.candidateTree = tree; evidence.candidateCommit = commit;
  // --prod --skip-domain builds with the PRODUCTION environment (every variable
  // on this project targets Production only, so a plain preview would run
  // unconfigured) while leaving every domain, including the Stripe-configured
  // mathnexa-platform-production.vercel.app host, on the current deployment.
  // Traffic and webhook delivery are untouched until the promote stage.
  const output = vercel(["deploy", ".", "--project", PRODUCTION_VERCEL_PROJECT, "--scope", SCOPE, "--yes", "--prod", "--skip-domain",
    "--meta", `certifiedRuntime=${certified}`, "--meta", `candidateTree=${tree}`, "--meta", "repair=subscription-lifecycle"]);
  const urls = output.match(/https:\/\/[a-z0-9-]+\.vercel\.app/g) ?? [];
  const url = urls.filter((candidate) => new RegExp(`^https://${PRODUCTION_VERCEL_PROJECT}-[a-z0-9]+-${SCOPE}\\.vercel\\.app$`).test(candidate)).pop() ?? null;
  check(url, `deployment-url-missing:${redact(output).slice(-500)}`);
  evidence.previewUrl = url;
  const deployment = inspectDeployment(url);
  evidence.previewDeployment = deployment;
  check(!(deployment.aliases ?? []).includes(PRODUCTION_ORIGIN), "staged-deployment-must-not-hold-the-production-alias");
  check(!(deployment.aliases ?? []).includes(`https://${PRODUCTION_VERCEL_HOST}`), "staged-deployment-must-not-hold-the-configured-webhook-host");
  const stillLive = inspectDeployment(PRODUCTION_ORIGIN);
  check(stillLive.id !== deployment.id, "production-alias-moved-during-a-staged-deploy");
  evidence.aliasUnchangedDuringStaging = stillLive.id;
  // Deployment-specific URLs on this project sit behind Vercel deployment
  // protection (SSO), and no automation bypass secret is configured, so
  // readiness is taken from the deployment record rather than an HTTP probe.
  const deadline = Date.now() + 420_000;
  let ready = deployment;
  while (Date.now() < deadline && !/Ready/.test(ready.status ?? "")) {
    await sleep(5000);
    ready = inspectDeployment(url);
  }
  evidence.previewReadyState = ready.status;
  check(/Ready/.test(ready.status ?? ""), `staged-deployment-not-ready:${ready.status}`);
  const health = await probe(`${url}/api/health`);
  evidence.previewHealth = health;
  evidence.previewHostProtected = health.status === 401 || (health.status === 302 && (health.location ?? "").includes("vercel.com/sso-api"));
  console.log(`PREVIEW ${JSON.stringify({ previewUrl: url, deploymentId: deployment.id, certifiedRuntime: certified, health: evidence.previewHealth })}`);
}

async function probePreview() {
  const url = args.get("--url") ?? required("LIFECYCLE_PREVIEW_URL");
  step(`probing ${url}`);
  // This deployment carries the production environment, so its own *.vercel.app
  // host behaves exactly like the Stripe-configured host will after promotion:
  // the two machine endpoints answer directly and every browser path still 308s
  // to the apex. That is the precise failure mode being repaired, proven before
  // any traffic moves.
  const results = {};
  results.health = await probe(`${url}/api/health`);
  results.webhookUnsigned = await probe(`${url}/api/billing/webhook`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  results.account = await probe(`${url}/account`);
  results.pricing = await probe(`${url}/pricing`);
  results.gameRuntime = await probe(`${url}/game/runtime/index.html`);
  results.forgedAccess = await probe(`${url}/play?access=active&trialEndsAt=2099-01-01`);
  evidence.previewProbes = results;
  const redirectsToApex = (result) => [307, 308].includes(result.status) && (result.location ?? "").startsWith(PRODUCTION_ORIGIN);
  const pass = results.health.status === 200 && /"status":"ready"/.test(results.health.body) &&
    results.webhookUnsigned.status === 400 && /invalid-signature/.test(results.webhookUnsigned.body) &&
    redirectsToApex(results.account) && redirectsToApex(results.pricing) &&
    results.gameRuntime.status !== 200 && !/\/game\/runtime/.test(results.forgedAccess.location ?? "");
  evidence.previewProbesPass = pass;
  evidence.exemptionProvenOnVercelHost = results.health.status === 200 && results.webhookUnsigned.status === 400;
  console.log(`PREVIEW_PROBES ${JSON.stringify(results, null, 2)}`);
  check(pass, "preview-certification-failed");
}

async function promote() {
  const url = args.get("--url") ?? required("LIFECYCLE_PREVIEW_URL");
  step(`promoting ${url} to the production alias`);
  assertRuntimeIsCertified();
  const before = inspectDeployment(PRODUCTION_ORIGIN);
  const candidate = inspectDeployment(url);
  evidence.aliasBefore = { id: before.id, url: before.url };
  check(candidate.name === PRODUCTION_VERCEL_PROJECT, `candidate-in-unexpected-project:${candidate.name}`);
  check(/Ready/.test(candidate.status ?? ""), `candidate-not-ready:${candidate.status}`);
  check(candidate.id !== before.id, "candidate-already-serves-the-alias");
  vercel(["promote", url, "--scope", SCOPE, "--yes"]);
  const deadline = Date.now() + 300_000;
  let after = null;
  while (Date.now() < deadline) {
    after = inspectDeployment(PRODUCTION_ORIGIN);
    if (after.id === candidate.id) break;
    await sleep(5000);
  }
  evidence.aliasAfter = { id: after?.id, url: after?.url };
  check(after?.id === candidate.id, `alias-did-not-move:${after?.id}`);
  evidence.rollbackTarget = { id: before.id, url: before.url, retained: true };
  console.log(`PROMOTED ${JSON.stringify({ promoted: candidate.id, previous: before.id })}`);
}

async function probeLive() {
  step("probing the live hosts");
  const expected = args.get("--expect-deployment") ?? null;
  const serving = inspectDeployment(PRODUCTION_ORIGIN);
  evidence.aliasServes = { id: serving.id, url: serving.url };
  if (expected) check(serving.id === expected, `alias-serves-unexpected-deployment:${serving.id}`);
  const results = {};
  results.configuredWebhookHost = await probe(`https://${PRODUCTION_VERCEL_HOST}/api/billing/webhook`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  results.apexWebhook = await probe(`${PRODUCTION_ORIGIN}/api/billing/webhook`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  results.wwwWebhook = await probe("https://www.mathnexa.com/api/billing/webhook", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  results.health = await probe(`${PRODUCTION_ORIGIN}/api/health`);
  results.configuredHostHealth = await probe(`https://${PRODUCTION_VERCEL_HOST}/api/health`);
  results.browserHostStillRedirects = await probe(`https://${PRODUCTION_VERCEL_HOST}/pricing`);
  results.scheduler = await probe(`${PRODUCTION_ORIGIN}/api/internal/billing/reconcile`);
  results.fixtureRoute = await probe(`${PRODUCTION_ORIGIN}/api/internal/billing/fixture`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "read-subscription", subscriptionId: "sub_x" }) });
  evidence.liveProbes = results;
  // www.mathnexa.com redirects at the VERCEL DOMAIN level (its 308 carries no
  // application headers: no CSP, no x-matched-path), so no application change can
  // stop it and no Stripe endpoint is configured there. Either behaviour is
  // acceptable for www; the load-bearing hosts are the Stripe-configured
  // *.vercel.app host and the apex, which must answer the handler directly.
  const wwwAcceptable = results.wwwWebhook.status === 400 ||
    ([307, 308].includes(results.wwwWebhook.status) && (results.wwwWebhook.location ?? "").startsWith(PRODUCTION_ORIGIN));
  const pass = results.configuredWebhookHost.status === 400 && /invalid-signature/.test(results.configuredWebhookHost.body) &&
    results.configuredWebhookHost.matchedPath === "/api/billing/webhook" &&
    results.apexWebhook.status === 400 && /invalid-signature/.test(results.apexWebhook.body) &&
    wwwAcceptable && results.health.status === 200 && results.configuredHostHealth.status === 200 &&
    [307, 308].includes(results.browserHostStillRedirects.status) &&
    [401, 503].includes(results.scheduler.status) && results.fixtureRoute.status === 404;
  evidence.liveProbesPass = pass;
  evidence.redirectDefectRepaired = results.configuredWebhookHost.status === 400 && results.configuredWebhookHost.matchedPath === "/api/billing/webhook";
  evidence.wwwRedirectIsDomainLevel = [307, 308].includes(results.wwwWebhook.status);
  console.log(`LIVE_PROBES ${JSON.stringify(results, null, 2)}`);
  check(pass, "live-webhook-host-certification-failed");
}

function cronSecret() {
  step("production scheduler secret");
  const existing = process.env.CRON_SECRET_PRODUCTION?.trim();
  const staging = process.env.CRON_SECRET_STAGING?.trim();
  const value = existing && existing.length >= 32 ? existing : randomBytes(32).toString("base64url");
  secrets.push(value);
  check(!staging || value !== staging, "production-cron-secret-must-differ-from-staging");
  vercel(["env", "rm", "CRON_SECRET", "production", "--yes", "--project", PRODUCTION_VERCEL_PROJECT, "--scope", SCOPE], { allowFailure: true });
  vercel(["env", "add", "CRON_SECRET", "production", "--sensitive", "--project", PRODUCTION_VERCEL_PROJECT, "--scope", SCOPE], { input: `${value}\n` });
  const script = process.env.LIFECYCLE_VAULT_SET_SCRIPT?.trim();
  check(script, "vault-set-script-unavailable");
  run("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-Name", "CRON_SECRET_PRODUCTION"], { env: { ...process.env, LIFECYCLE_VAULT_SECRET_VALUE: value } });
  evidence.cronSecret = { generated: !existing, length: value.length, storedInVault: true, reusedStaging: false, redeployRequired: true };
  console.log(`CRON_SECRET ${JSON.stringify(evidence.cronSecret)}`);
}

try {
  check(!Object.entries(process.env).some(([name, value]) => name.startsWith("MVH_STAGING") && value), "staging-variables-loaded-refusing");
  if (stage === "preflight") await preflight();
  else if (stage === "migrate") migrate();
  else if (stage === "verify") await verify();
  else if (stage === "deploy-preview") await deployPreview();
  else if (stage === "probe-preview") await probePreview();
  else if (stage === "promote") await promote();
  else if (stage === "probe-live") await probeLive();
  else if (stage === "cron-secret") cronSecret();
  else throw new Error(`unknown-stage:${stage}`);
  evidence.finishedAt = new Date().toISOString();
  const evidencePath = join(tmpdir(), `mathnexa-production-${stage}-${Date.now()}.json`);
  writeFileSync(evidencePath, redact(JSON.stringify(evidence, null, 2)));
  console.log(`EVIDENCE_FILE ${evidencePath}`);
} catch (error) {
  console.error(`FAILED ${redact(error instanceof Error ? error.message : String(error))}`);
  console.error(`PARTIAL ${redact(JSON.stringify(evidence))}`);
  process.exitCode = 1;
}
