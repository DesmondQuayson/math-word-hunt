/**
 * Super Admin "Sync with Stripe" CHECK fix — PRODUCTION database stages.
 *
 * Launched by scripts/invoke-admin-sync-billing-production.ps1, which loads only
 * the production project ref, the production database password and the
 * production service key from the credential vault. One stage per run:
 *
 *   --stage=audit    READ ONLY. Proves the target is production with several
 *                    independent signals, reads the live operation CHECK and
 *                    the live prepare_admin_account_operation allow-list, and
 *                    reports whether they disagree on 'sync-billing'. Lists the
 *                    migration history and proves that exactly 20260929100000
 *                    is pending. Snapshots operation counts (by operation and
 *                    state only — no identities) and billing row counts as
 *                    the before-state. Writes nothing.
 *   --stage=migrate  OWNER-GATED. Re-runs every audit check, dry-runs
 *                    `supabase db push` (must list exactly the one file),
 *                    applies it, then proves the CHECK accepts sync-billing,
 *                    still lists the eleven earlier values, and that no billing,
 *                    entitlement, account or operation row count changed.
 *   --stage=verify   READ ONLY. The post-migration checks alone.
 *
 * No stage calls Stripe, prepares an operation, or touches a customer row.
 * The database is reached through the IPv4 session pooler. Output is redacted.
 */
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

const STAGING_PROJECT_REF = "gcmuhzxkwvfireyrearl";
const RELEASE = "20260929100000";
const RELEASE_FILE = "20260929100000_admin_sync_billing_operation.sql";
const EARLIER_OPERATIONS = Object.freeze([
  "resend-confirmation", "revoke-sessions", "suspend", "restore", "open-portal",
  "cancel-at-period-end", "submit-refund-review", "deny-refund-review",
  "grant-complimentary", "remove-complimentary", "emergency-revoke"
]);
// Grade 6 quizzes published to PRODUCTION on 2026-09-26 (v1.2.13); staging holds different ids.
const PRODUCTION_QUIZ_ID_PREFIXES = Object.freeze(["83d9252f", "42215d2a", "5b8bdc39", "1d80b325", "e01a72e2", "3e25faa1", "339aa712", "7654e5e9"]);
const POOLER_HOSTS = ["aws-0-us-east-2.pooler.supabase.com", "aws-1-us-east-2.pooler.supabase.com"];
const supabaseCli = resolve("node_modules/supabase/dist/supabase.js");
const stage = (process.argv.find((argument) => argument.startsWith("--stage=")) ?? "").slice("--stage=".length);
const secrets = [];
const evidence = { stage, startedAt: new Date().toISOString() };

function redact(text) {
  let value = String(text ?? "");
  for (const secret of secrets) if (secret) value = value.split(secret).join("[redacted]");
  return value.replace(/postgresql:\/\/\S+/g, "postgresql://[redacted]").replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, "[sbkey]");
}
function check(condition, message) {
  if (!condition) throw new Error(message);
}
function required(name, pattern) {
  const value = (process.env[name] ?? "").trim();
  check(pattern.test(value), `missing-or-malformed-${name}`);
  secrets.push(value, encodeURIComponent(value));
  return value;
}
for (const name of Object.keys(process.env)) {
  check(!/^MVH_STAGING|^STAGING_|_STAGING$|^SUPABASE_DB_PASSWORD$|^VERCEL_AUTOMATION_BYPASS_SECRET$|^STRIPE_/.test(name), `refusing: variable ${name} is present in this process`);
}
const ref = required("SUPABASE_PRODUCTION_PROJECT_REF", /^[A-Za-z]{20}$/).toLowerCase();
check(ref !== STAGING_PROJECT_REF, "refusing: the production project ref is the staging project");
evidence.projectRef = ref;

function cli(commandArgs, workdir) {
  const result = spawnSync(process.execPath, [supabaseCli, ...commandArgs, ...(workdir ? ["--workdir", workdir] : []), "--yes"], {
    encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "true" }
  });
  return { ok: result.status === 0, output: `${result.stdout ?? ""}\n${result.stderr ?? ""}` };
}
function parseRows(output) {
  const starts = [output.indexOf("["), output.indexOf("{")].filter((index) => index !== -1);
  check(starts.length > 0, `query-output-unreadable:${redact(output).slice(-300)}`);
  const from = Math.min(...starts);
  const to = Math.max(output.lastIndexOf("]"), output.lastIndexOf("}"));
  const parsed = JSON.parse(output.slice(from, to + 1));
  return Array.isArray(parsed) ? parsed : parsed.rows ?? parsed.result ?? parsed.data ?? [];
}
function connect() {
  const password = required("SUPABASE_PRODUCTION_DB_PASSWORD", /^.{12,}$/);
  for (const host of POOLER_HOSTS) {
    const url = `postgresql://postgres.${ref}:${encodeURIComponent(password)}@${host}:5432/postgres`;
    const probe = cli(["db", "query", "--db-url", url, "-o", "json", "select current_database() as database"]);
    if (probe.ok) {
      secrets.push(url);
      evidence.pooler = host;
      return url;
    }
    evidence[`probe_${host}`] = redact(probe.output).split("\n").filter(Boolean).slice(-2);
  }
  throw new Error("production-database-unreachable");
}
function sqlFor(url) {
  return (query) => {
    const result = cli(["db", "query", "--db-url", url, "-o", "json", query]);
    check(result.ok, `query-failed:${redact(result.output).slice(-400)}`);
    return parseRows(result.output);
  };
}
const localVersions = () => readdirSync(resolve("supabase/migrations")).filter((file) => /^\d{14}_.+\.sql$/.test(file)).map((file) => file.slice(0, 14)).sort();

const SNAPSHOT_SQL = `select
  (select count(*) from public.consumer_accounts)::int as accounts,
  (select count(*) from public.consumer_game_entitlements)::int as entitlements,
  (select count(*) from public.consumer_complimentary_entitlements)::int as complimentary,
  (select count(*) from public.billing_customers)::int as billing_customers,
  (select count(*) from public.billing_subscriptions)::int as subscriptions,
  (select count(*) from public.billing_webhook_events)::int as webhook_events,
  (select count(*) from public.admin_account_operations)::int as operations,
  (select count(*) from auth.users)::int as auth_users,
  (select count(*) from supabase_migrations.schema_migrations)::int as history,
  (select string_agg(version || ':' || coalesce(array_length(statements,1),0), ',' order by version) from supabase_migrations.schema_migrations where version <> '${RELEASE}') as history_digest,
  (select md5(coalesce(string_agg(id::text || operation || operation_state, ',' order by id), '')) from public.admin_account_operations) as operations_digest`;

/**
 * Independent production identity signals (same contract as the v1.2.16
 * release tooling): the vault ref is well formed and not staging; the pooler
 * authenticated as postgres.<ref>; the REST API of <ref>.supabase.co with the
 * production service key reports the same account count and catalog as the
 * pooler database; the eight production Grade 6 quiz ids are present.
 */
async function identify(sql) {
  const database = sql(`select (select count(*) from public.consumer_accounts)::int as accounts,
    (select string_agg(stable_key || ':' || status, ',' order by stable_key) from public.game_catalog_entries) as games,
    (select count(*) from public.content_resources where resource_type in ('quiz','quiz_pdf') and left(id::text, 8) in (${PRODUCTION_QUIZ_ID_PREFIXES.map((prefix) => `'${prefix}'`).join(",")}))::int as production_quizzes`)[0];
  const secretKey = required("SUPABASE_PRODUCTION_SECRET_KEY", /^(sb_secret_|eyJ).{16,}/);
  const client = createClient(`https://${ref}.supabase.co`, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const accounts = await client.from("consumer_accounts").select("user_id", { count: "exact", head: true });
  const games = await client.from("game_catalog_entries").select("stable_key,status").order("stable_key");
  check(!accounts.error && !games.error, "production-api-rejected-the-vault-service-key");
  const apiGames = games.data.map((row) => `${row.stable_key}:${row.status}`).join(",");
  evidence.identity = {
    refWellFormedAndNotStaging: true,
    poolerAuthenticatedAs: `postgres.${ref}@${evidence.pooler}`,
    apiMatchesDatabase: database.accounts === accounts.count && database.games === apiGames,
    productionQuizFingerprint: `${database.production_quizzes}/${PRODUCTION_QUIZ_ID_PREFIXES.length}`
  };
  check(evidence.identity.apiMatchesDatabase, "pooler-database-and-production-api-differ");
  check(database.production_quizzes === PRODUCTION_QUIZ_ID_PREFIXES.length, "production-quiz-fingerprint-missing-refusing");
  evidence.environment = "PRODUCTION";
}

function readRule(sql) {
  const constraints = sql(`select conname, convalidated, pg_get_constraintdef(oid) as definition from pg_constraint
    where conrelid='public.admin_account_operations'::regclass and contype='c' and pg_get_constraintdef(oid) like '%operation = ANY%' order by conname`);
  const prepare = sql("select pg_get_functiondef('public.prepare_admin_account_operation(uuid,uuid,uuid,text,text,text)'::regprocedure) as body")[0].body;
  const allowList = /if p_operation not in \(([^)]*)\)/.exec(prepare)?.[1] ?? "";
  const listed = (text) => [...text.matchAll(/'([a-z-]+)'/g)].map((match) => match[1]);
  const checkValues = constraints.length === 1 ? listed(constraints[0].definition) : [];
  return {
    constraintNames: constraints.map((row) => row.conname),
    constraintValidated: constraints[0]?.convalidated ?? null,
    checkValues,
    prepareAllowList: listed(allowList),
    checkAcceptsSyncBilling: checkValues.includes("sync-billing"),
    prepareAcceptsSyncBilling: listed(allowList).includes("sync-billing"),
    checkKeepsEarlierValues: EARLIER_OPERATIONS.every((value) => checkValues.includes(value))
  };
}

function pendingPlan(sql) {
  const remote = sql("select version from supabase_migrations.schema_migrations order by version").map((row) => String(row.version));
  const local = localVersions();
  const pending = local.filter((version) => !remote.includes(version));
  const remoteOnly = remote.filter((version) => !local.includes(version));
  evidence.history = { remoteCount: remote.length, remoteTail: remote.slice(-3), localCount: local.length, pending, remoteOnly };
  return { remote, pending, remoteOnly };
}

async function audit() {
  const url = connect();
  const sql = sqlFor(url);
  await identify(sql);
  evidence.ruleBefore = readRule(sql);
  evidence.operationsByKind = sql("select operation, operation_state, count(*)::int as rows from public.admin_account_operations group by 1,2 order by 1,2");
  evidence.snapshotBefore = sql(SNAPSHOT_SQL)[0];
  const plan = pendingPlan(sql);
  evidence.findingConfirmed = evidence.ruleBefore.prepareAcceptsSyncBilling && !evidence.ruleBefore.checkAcceptsSyncBilling;
  evidence.checks = {
    oneOperationCheck: evidence.ruleBefore.constraintNames.length === 1 && evidence.ruleBefore.constraintNames[0] === "admin_account_operations_operation_check",
    checkHasTheElevenEarlierValues: evidence.ruleBefore.checkKeepsEarlierValues && evidence.ruleBefore.checkValues.length === EARLIER_OPERATIONS.length,
    onlyTheFixIsPending: JSON.stringify(plan.pending) === JSON.stringify([RELEASE]),
    noRemoteOnlyMigrations: plan.remoteOnly.length === 0,
    fixNewerThanRemoteHead: plan.remote.every((version) => version < RELEASE)
  };
  return { url, sql };
}

function verifyApplied(sql) {
  const recorded = sql(`select version from supabase_migrations.schema_migrations where version='${RELEASE}'`);
  evidence.releaseRecorded = recorded.length === 1;
  evidence.ruleAfter = readRule(sql);
  check(evidence.releaseRecorded, "fix-migration-not-recorded");
  check(evidence.ruleAfter.constraintNames.length === 1 && evidence.ruleAfter.constraintValidated === true, "operation-check-missing-or-not-validated");
  check(evidence.ruleAfter.checkAcceptsSyncBilling && evidence.ruleAfter.checkKeepsEarlierValues && evidence.ruleAfter.checkValues.length === EARLIER_OPERATIONS.length + 1, "operation-check-values-wrong");
  check(evidence.ruleAfter.prepareAcceptsSyncBilling, "prepare-function-changed-unexpectedly");
}

async function migrate() {
  check(process.env.ADMIN_SYNC_BILLING_OWNER_APPROVED === "yes", "refusing: migrate needs ADMIN_SYNC_BILLING_OWNER_APPROVED=yes (owner approval in chat)");
  const { url, sql } = await audit();
  check(Object.values(evidence.checks).every(Boolean), `audit-refused:${Object.entries(evidence.checks).filter(([, value]) => !value).map(([key]) => key).join(",")}`);
  check(evidence.findingConfirmed, "refusing: production does not show the audited mismatch");
  const before = evidence.snapshotBefore;
  const workRoot = mkdtempSync(join(tmpdir(), "mathnexa-sync-billing-production-"));
  try {
    cpSync(resolve("supabase"), join(workRoot, "supabase"), { recursive: true });
    const dry = cli(["db", "push", "--db-url", url, "--dry-run"], workRoot);
    check(dry.ok, `dry-run-failed:${redact(dry.output).slice(-600)}`);
    const listed = [...new Set(redact(dry.output).match(/\d{14}_[a-z0-9_]+\.sql/g) ?? [])];
    evidence.dryRunWouldApply = listed;
    check(JSON.stringify(listed) === JSON.stringify([RELEASE_FILE]), "refusing: the dry run would apply something other than the fix migration");
    const pushed = cli(["db", "push", "--db-url", url], workRoot);
    evidence.pushOutput = redact(pushed.output).split("\n").map((line) => line.trim()).filter((line) => /20260929|Applying|Finished|up to date|error/i.test(line)).slice(-8);
    check(pushed.ok, `push-failed:${redact(pushed.output).slice(-800)}`);
  } finally {
    rmSync(workRoot, { recursive: true, force: true });
  }
  verifyApplied(sql);
  const after = sql(SNAPSHOT_SQL)[0];
  evidence.snapshotAfter = after;
  check(after.history === before.history + 1 && after.history_digest === before.history_digest, "other-history-rows-changed");
  for (const key of ["accounts", "entitlements", "complimentary", "billing_customers", "subscriptions", "webhook_events", "operations", "auth_users", "operations_digest"]) {
    check(after[key] === before[key], `unrelated-data-changed:${key}`);
  }
  evidence.customerAndBillingDataUnchanged = true;
}

async function verify() {
  const url = connect();
  const sql = sqlFor(url);
  await identify(sql);
  verifyApplied(sql);
  evidence.snapshot = sql(SNAPSHOT_SQL)[0];
}

try {
  if (stage === "audit") await audit();
  else if (stage === "migrate") await migrate();
  else if (stage === "verify") await verify();
  else throw new Error("usage: --stage=audit|migrate|verify");
  evidence.result = "PASS";
} catch (error) {
  evidence.result = "FAIL";
  evidence.error = redact(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
evidence.finishedAt = new Date().toISOString();
const text = redact(JSON.stringify(evidence, null, 2));
const evidenceDir = (process.env.RELEASE_EVIDENCE_DIR ?? "").trim();
if (evidenceDir) writeFileSync(join(evidenceDir, `admin-sync-billing-production-${stage}-${Date.now()}.json`), text);
process.stdout.write(`${text}\n`);
