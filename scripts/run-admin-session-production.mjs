/**
 * Phase 2B two-hour Super Admin session — PRODUCTION database stages for
 * migration 20260930100000_admin_two_hour_session.sql.
 *
 * Launched by scripts/invoke-admin-session-production.ps1 (production project
 * ref, database password and service key only).
 *
 *   --stage=audit    READ ONLY. Production identity (pooler user, REST == pooler,
 *                    production quiz fingerprint); the old 30-minute ceiling and
 *                    three-reason end rule exist exactly once; the new columns
 *                    and functions are absent; exactly this migration is pending;
 *                    before-state counts and digests.
 *   --stage=migrate  OWNER-GATED (ADMIN_SESSION_OWNER_APPROVED=yes). Re-runs the
 *                    audit, dry-runs `supabase db push` (must list exactly this
 *                    file), applies it, verifies the schema and privileges, and
 *                    proves no account, billing, entitlement, operation, audit or
 *                    admin row changed.
 *   --stage=verify   READ ONLY post-migration checks.
 */
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

const STAGING_PROJECT_REF = "gcmuhzxkwvfireyrearl";
const RELEASE = "20260930100000";
const RELEASE_FILE = "20260930100000_admin_two_hour_session.sql";
const RELEASE_STATEMENTS = 27;
const PRODUCTION_QUIZ_ID_PREFIXES = Object.freeze(["83d9252f", "42215d2a", "5b8bdc39", "1d80b325", "e01a72e2", "3e25faa1", "339aa712", "7654e5e9"]);
const POOLER_HOSTS = ["aws-0-us-east-2.pooler.supabase.com", "aws-1-us-east-2.pooler.supabase.com"];
const NEW_FUNCTIONS = ["public.touch_admin_session(text)", "public.record_admin_step_up(uuid,uuid,text,text)", "public.begin_admin_account_operation(uuid,uuid,uuid,text,text,text)"];
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
    encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1" }
  });
  return { ok: result.status === 0, output: `${result.stdout ?? ""}\n${result.stderr ?? ""}` };
}
function parseRows(output) {
  const starts = [output.indexOf("["), output.indexOf("{")].filter((index) => index !== -1);
  check(starts.length > 0, `query-output-unreadable:${redact(output).slice(-300)}`);
  const parsed = JSON.parse(output.slice(Math.min(...starts), Math.max(output.lastIndexOf("]"), output.lastIndexOf("}")) + 1));
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
  (select count(*) from public.billing_customers)::int as billing_customers,
  (select count(*) from public.billing_subscriptions)::int as subscriptions,
  (select count(*) from public.billing_webhook_events)::int as webhook_events,
  (select count(*) from public.admin_account_operations)::int as operations,
  (select count(*) from public.admin_audit_log)::int as audit_rows,
  (select count(*) from public.admin_users)::int as admin_users,
  (select count(*) from public.admin_sessions)::int as admin_sessions,
  (select count(*) from public.admin_sessions where ended_at is null and revoked_at is null and expires_at > now())::int as live_admin_sessions,
  (select count(*) from auth.users)::int as auth_users,
  (select count(*) from supabase_migrations.schema_migrations)::int as history,
  (select string_agg(version || ':' || coalesce(array_length(statements,1),0), ',' order by version) from supabase_migrations.schema_migrations where version <> '${RELEASE}') as history_digest,
  (select md5(coalesce(string_agg(id::text || admin_user_id::text || started_at::text || expires_at::text || coalesce(ended_at::text,'') || coalesce(end_reason,''), ',' order by id), '')) from public.admin_sessions) as sessions_digest,
  (select md5(coalesce(string_agg(id::text || operation || operation_state, ',' order by id), '')) from public.admin_account_operations) as operations_digest`;
const UNCHANGED_KEYS = ["accounts", "entitlements", "billing_customers", "subscriptions", "webhook_events", "operations", "audit_rows", "admin_users", "admin_sessions", "auth_users", "sessions_digest", "operations_digest"];

async function identify(sql) {
  const database = sql(`select (select count(*) from public.consumer_accounts)::int as accounts,
    (select string_agg(stable_key || ':' || status, ',' order by stable_key) from public.game_catalog_entries) as games,
    (select count(*) from public.content_resources where resource_type in ('quiz','quiz_pdf') and left(id::text, 8) in (${PRODUCTION_QUIZ_ID_PREFIXES.map((prefix) => `'${prefix}'`).join(",")}))::int as production_quizzes`)[0];
  const secretKey = required("SUPABASE_PRODUCTION_SECRET_KEY", /^(sb_secret_|eyJ).{16,}/);
  const client = createClient(`https://${ref}.supabase.co`, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const accounts = await client.from("consumer_accounts").select("user_id", { count: "exact", head: true });
  const games = await client.from("game_catalog_entries").select("stable_key,status").order("stable_key");
  check(!accounts.error && !games.error, "production-api-rejected-the-vault-service-key");
  evidence.identity = {
    refWellFormedAndNotStaging: true,
    poolerAuthenticatedAs: `postgres.${ref}@${evidence.pooler}`,
    apiMatchesDatabase: database.accounts === accounts.count && database.games === games.data.map((row) => `${row.stable_key}:${row.status}`).join(","),
    productionQuizFingerprint: `${database.production_quizzes}/${PRODUCTION_QUIZ_ID_PREFIXES.length}`
  };
  check(evidence.identity.apiMatchesDatabase, "pooler-database-and-production-api-differ");
  check(database.production_quizzes === PRODUCTION_QUIZ_ID_PREFIXES.length, "production-quiz-fingerprint-missing-refusing");
  evidence.environment = "PRODUCTION";
}

function readShape(sql) {
  return sql(`select
    (select string_agg(conname, ',' order by conname) from pg_constraint where conrelid='public.admin_sessions'::regclass and contype='c' and pg_get_constraintdef(oid) like '%''00:30:00''::interval%') as thirty_minute_rules,
    (select string_agg(conname, ',' order by conname) from pg_constraint where conrelid='public.admin_sessions'::regclass and contype='c' and pg_get_constraintdef(oid) like '%''signed-out''::text%') as end_reason_rules,
    (select count(*) from pg_constraint where conrelid='public.admin_sessions'::regclass and conname in ('admin_sessions_absolute_lifetime_check','admin_sessions_activity_window_check','admin_sessions_step_up_window_check') and convalidated)::int as new_rules,
    (select pg_get_constraintdef(oid) like '%''idle-expired''::text%' from pg_constraint where conrelid='public.admin_sessions'::regclass and conname='admin_sessions_end_reason_check') as idle_reason,
    (select count(*) from information_schema.columns where table_schema='public' and table_name='admin_sessions' and column_name in ('last_activity_at','step_up_at') and is_nullable='NO')::int as new_columns,
    (select count(*) from pg_trigger where tgrelid='public.admin_sessions'::regclass and tgname='admin_sessions_default_activity')::int as trigger,
    ${NEW_FUNCTIONS.map((signature, index) => `(to_regprocedure('${signature}') is not null) as function_${index}`).join(",\n    ")}`)[0];
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
  evidence.shapeBefore = readShape(sql);
  evidence.snapshotBefore = sql(SNAPSHOT_SQL)[0];
  evidence.liveSessionsLongestMinutes = sql("select coalesce(max(extract(epoch from expires_at - started_at) / 60), 0)::int as minutes from public.admin_sessions where ended_at is null and revoked_at is null and expires_at > now()")[0].minutes;
  const plan = pendingPlan(sql);
  evidence.checks = {
    thirtyMinuteRuleExistsOnce: typeof evidence.shapeBefore.thirty_minute_rules === "string" && !evidence.shapeBefore.thirty_minute_rules.includes(","),
    endReasonRuleExistsOnce: typeof evidence.shapeBefore.end_reason_rules === "string" && !evidence.shapeBefore.end_reason_rules.includes(","),
    newObjectsAbsent: evidence.shapeBefore.new_columns === 0 && NEW_FUNCTIONS.every((_, index) => evidence.shapeBefore[`function_${index}`] === false),
    onlyThisMigrationPending: JSON.stringify(plan.pending) === JSON.stringify([RELEASE]),
    noRemoteOnlyMigrations: plan.remoteOnly.length === 0,
    migrationNewerThanRemoteHead: plan.remote.every((version) => version < RELEASE)
  };
  return { url, sql };
}

function verifyApplied(sql) {
  evidence.recorded = sql(`select version, coalesce(array_length(statements,1),0) as statements from supabase_migrations.schema_migrations where version='${RELEASE}'`)[0] ?? null;
  check(evidence.recorded?.statements === RELEASE_STATEMENTS, "migration-not-recorded");
  evidence.shapeAfter = readShape(sql);
  const shape = evidence.shapeAfter;
  check(!shape.thirty_minute_rules && shape.new_rules === 3 && shape.idle_reason === true && shape.new_columns === 2 && shape.trigger === 1, "session-schema-wrong");
  check(NEW_FUNCTIONS.every((_, index) => shape[`function_${index}`] === true), "session-functions-missing");
  evidence.privileges = sql(`select signature,
      has_function_privilege('anon', signature, 'EXECUTE') as anon,
      has_function_privilege('authenticated', signature, 'EXECUTE') as authenticated,
      has_function_privilege('service_role', signature, 'EXECUTE') as service_role,
      (select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid = signature::regprocedure) as definer_pinned
    from (values ${NEW_FUNCTIONS.map((signature) => `('${signature}')`).join(",")}) functions(signature) order by signature`);
  check(evidence.privileges.every((row) => !row.anon && !row.authenticated && row.service_role && row.definer_pinned), "session-function-privileges-wrong");
  check(sql("select not has_table_privilege('service_role','public.admin_sessions','UPDATE') as ok")[0].ok, "service-role-can-update-sessions");
}

async function migrate() {
  check(process.env.ADMIN_SESSION_OWNER_APPROVED === "yes", "refusing: migrate needs ADMIN_SESSION_OWNER_APPROVED=yes (owner approval in chat)");
  const { url, sql } = await audit();
  check(Object.values(evidence.checks).every(Boolean), `audit-refused:${Object.entries(evidence.checks).filter(([, value]) => !value).map(([key]) => key).join(",")}`);
  const before = evidence.snapshotBefore;
  const workRoot = mkdtempSync(join(tmpdir(), "mathnexa-admin-session-production-"));
  try {
    cpSync(resolve("supabase"), join(workRoot, "supabase"), { recursive: true });
    const dry = cli(["db", "push", "--db-url", url, "--dry-run"], workRoot);
    check(dry.ok, `dry-run-failed:${redact(dry.output).slice(-600)}`);
    const listed = [...new Set(redact(dry.output).match(/\d{14}_[a-z0-9_]+\.sql/g) ?? [])];
    evidence.dryRunWouldApply = listed;
    check(JSON.stringify(listed) === JSON.stringify([RELEASE_FILE]), "refusing: the dry run would apply something other than this migration");
    const pushed = cli(["db", "push", "--db-url", url], workRoot);
    evidence.pushOutput = redact(pushed.output).split("\n").map((line) => line.trim()).filter((line) => /20260930|Applying|Finished|up to date|error/i.test(line)).slice(-8);
    check(pushed.ok, `push-failed:${redact(pushed.output).slice(-800)}`);
  } finally {
    rmSync(workRoot, { recursive: true, force: true });
  }
  verifyApplied(sql);
  const after = sql(SNAPSHOT_SQL)[0];
  evidence.snapshotAfter = after;
  check(after.history === before.history + 1 && after.history_digest === before.history_digest, "other-history-rows-changed");
  for (const key of UNCHANGED_KEYS) check(after[key] === before[key], `unrelated-data-changed:${key}`);
  evidence.customerBillingAndAdminDataUnchanged = true;
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
if (evidenceDir) writeFileSync(join(evidenceDir, `admin-session-production-${stage}-${Date.now()}.json`), text);
process.stdout.write(`${text}\n`);
