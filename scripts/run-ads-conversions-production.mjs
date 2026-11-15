/**
 * Google Ads conversion measurement — PRODUCTION database release (owner
 * approved on 2026-11-15, after the staging review).
 *
 * Launched by scripts/invoke-ads-conversions-production.ps1, which loads only
 * the production project ref, the production database password and the
 * production service key from the credential vault. One stage per run:
 *
 *   --stage=audit    READ ONLY. Proves the target is production, lists the
 *                    migration history, proves the only thing pending is this
 *                    feature's one migration, and snapshots unrelated rows.
 *   --stage=migrate  Applies ONLY that migration: dry run first (must list
 *                    exactly that file), then `supabase db push`, then checks
 *                    the history, the tables, RLS, grants, triggers, functions
 *                    and every unrelated count.
 *   --stage=verify   READ ONLY. The same checks, and how many conversions and
 *                    clicks are recorded (counts only, no identities).
 *
 * No synthetic account is ever created in production: the ledger rules are
 * proven locally and on staging. Mirrors
 * scripts/run-math-race-champions-production.mjs. Reached through the IPv4
 * session pooler; the pooler user carries the production project ref. Output is
 * redacted JSON evidence; no secret reaches stdout.
 */
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

const STAGING_PROJECT_REF = "gcmuhzxkwvfireyrearl";
const MIGRATION = Object.freeze({ version: "20261114100000", file: "20261114100000_ads_conversion_attribution.sql" });
// Grade 6 quizzes published to PRODUCTION on 2026-09-26 (v1.2.13); staging holds different ids.
const PRODUCTION_QUIZ_ID_PREFIXES = Object.freeze(["83d9252f", "42215d2a", "5b8bdc39", "1d80b325", "e01a72e2", "3e25faa1", "339aa712", "7654e5e9"]);
const POOLER_HOSTS = ["aws-0-us-east-2.pooler.supabase.com", "aws-1-us-east-2.pooler.supabase.com"];
const TABLES = ["ad_click_attributions", "ads_conversion_events", "ads_conversion_settings"];
const FUNCTIONS = [
  "public.store_ad_click_attribution(uuid,text,text,text,timestamptz,text)",
  "public.erase_ad_click_attribution(uuid)",
  "public.record_consumer_subscription_conversions(uuid,text,text,text,timestamptz,timestamptz,integer)",
  "public.list_reportable_ads_conversions(timestamptz,text)"
];
const TRIGGERS = ["record_account_created_conversion", "erase_ad_click_on_deletion_request"];
const supabaseCli = resolve("node_modules/supabase/dist/supabase.js");
const stage = (process.argv.find((argument) => argument.startsWith("--stage=")) ?? "").slice("--stage=".length);
const secrets = [];
const evidence = { stage, startedAt: new Date().toISOString() };
const quoted = (names) => names.map((name) => `'${name}'`).join(",");

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
  check(!/^MVH_STAGING|^STAGING_|_STAGING$|^SUPABASE_DB_PASSWORD$|^SUPABASE_SECRET_KEY$|^VERCEL_AUTOMATION_BYPASS_SECRET$/.test(name), `refusing: staging variable ${name} is present in this process`);
}
const ref = required("SUPABASE_PRODUCTION_PROJECT_REF", /^[A-Za-z]{20}$/).toLowerCase();
check(ref !== STAGING_PROJECT_REF, "refusing: the production project ref is the staging project");
// The ref is not secret, but release evidence is stored redacted, as in earlier releases.
secrets.push(ref);
evidence.projectRef = "[production ref]";

function cli(commandArgs, workdir) {
  const result = spawnSync(process.execPath, [supabaseCli, ...commandArgs, ...(workdir ? ["--workdir", workdir] : []), "--yes"], {
    encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1" }
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
function api() {
  const secretKey = required("SUPABASE_PRODUCTION_SECRET_KEY", /^(sb_secret_|eyJ).{16,}/);
  return createClient(`https://${ref}.supabase.co`, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
}
const localVersions = () => readdirSync(resolve("supabase/migrations")).filter((file) => /^\d{14}_.+\.sql$/.test(file)).map((file) => file.slice(0, 14)).sort();

// Everything this migration must leave exactly as it was. The definitions of
// the billing synchronizer and the account provisioner are fingerprinted too:
// the migration adds beside them and must not replace them.
const SNAPSHOT_SQL = `select
  (select count(*) from auth.users)::int as auth_users,
  (select count(*) from public.consumer_accounts)::int as accounts,
  (select count(*) from public.consumer_game_entitlements)::int as entitlements,
  (select count(*) from public.billing_customers)::int as customers,
  (select count(*) from public.billing_subscriptions)::int as subscriptions,
  (select count(*) from public.billing_webhook_events)::int as webhook_events,
  (select count(*) from public.consumer_commercial_acceptances)::int as acceptances,
  (select count(*) from public.game_catalog_entries)::int as catalog,
  (select count(*) from public.content_resources)::int as resources,
  (select string_agg(subscription_status || ':' || count, ',' order by subscription_status) from (select subscription_status, count(*) from public.billing_subscriptions group by 1) s) as subscription_states,
  (select string_agg(entitlement_state || ':' || count, ',' order by entitlement_state) from (select entitlement_state, count(*) from public.consumer_game_entitlements group by 1) e) as entitlement_states,
  (select md5(string_agg(pg_get_functiondef(p.oid), '|' order by p.oid::regprocedure::text)) from pg_proc p where p.pronamespace in ('public'::regnamespace,'private'::regnamespace) and p.proname in ('synchronize_consumer_billing_subscription','provision_consumer_account','claim_consumer_trial_redemption')) as billing_function_digest,
  (select count(*) from pg_trigger t where t.tgrelid = 'public.consumer_accounts'::regclass and not t.tgisinternal and t.tgname not in (${quoted(TRIGGERS)}))::int as other_account_triggers,
  (select count(*) from supabase_migrations.schema_migrations)::int as history,
  (select string_agg(version || ':' || coalesce(array_length(statements,1),0), ',' order by version) from supabase_migrations.schema_migrations where version <> '${MIGRATION.version}') as history_digest`;

/**
 * Independent production identity signals: the vault ref is well formed and is
 * not staging; the pooler authenticated postgres.<ref>; the REST API with the
 * production service key reports the same catalog and account count as the
 * pooler database; the database holds the production-only Grade 6 quizzes.
 */
async function identify(sql) {
  const database = sql(`select (select count(*) from public.consumer_accounts)::int as accounts,
    (select string_agg(stable_key || ':' || status, ',' order by stable_key) from public.game_catalog_entries) as games,
    (select count(*) from public.content_resources where resource_type in ('quiz','quiz_pdf') and left(id::text, 8) in (${quoted(PRODUCTION_QUIZ_ID_PREFIXES)}))::int as production_quizzes`)[0];
  const client = api();
  const accounts = await client.from("consumer_accounts").select("user_id", { count: "exact", head: true });
  const games = await client.from("game_catalog_entries").select("stable_key,status").order("stable_key");
  check(!accounts.error && !games.error, "production-api-rejected-the-vault-service-key");
  const apiGames = games.data.map((row) => `${row.stable_key}:${row.status}`).join(",");
  evidence.identity = {
    refWellFormedAndNotStaging: true,
    poolerAuthenticatedAs: `postgres.[production ref]@${evidence.pooler}`,
    apiMatchesDatabase: database.accounts === accounts.count && database.games === apiGames,
    productionQuizFingerprint: `${database.production_quizzes}/${PRODUCTION_QUIZ_ID_PREFIXES.length}`,
    accounts: database.accounts
  };
  check(evidence.identity.apiMatchesDatabase, "pooler-database-and-production-api-differ");
  check(database.production_quizzes === PRODUCTION_QUIZ_ID_PREFIXES.length, "production-quiz-fingerprint-missing-refusing");
  evidence.environment = "PRODUCTION";
}

function pendingPlan(sql) {
  const remote = sql("select version from supabase_migrations.schema_migrations order by version").map((row) => String(row.version));
  const local = localVersions();
  const pending = local.filter((version) => !remote.includes(version));
  const remoteOnly = remote.filter((version) => !local.includes(version));
  evidence.history = { remoteCount: remote.length, remoteTail: remote.slice(-4), localCount: local.length, pending, remoteOnly };
  return { remote, pending, remoteOnly };
}

const objectState = (sql) => sql(`select
  (select count(*) from information_schema.tables where table_schema='public' and table_name in (${quoted(TABLES)}))::int as tables,
  (select count(*) from pg_trigger where tgname in (${quoted(TRIGGERS)}) and not tgisinternal)::int as triggers,
  (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in ('store_ad_click_attribution','erase_ad_click_attribution','record_consumer_subscription_conversions','list_reportable_ads_conversions'))::int as functions`)[0];

async function audit() {
  const url = connect();
  const sql = sqlFor(url);
  await identify(sql);
  const plan = pendingPlan(sql);
  evidence.objects = objectState(sql);
  evidence.snapshotBefore = sql(SNAPSHOT_SQL)[0];
  evidence.checks = {
    onlyThisMigrationIsPending: JSON.stringify(plan.pending) === JSON.stringify([MIGRATION.version]),
    noRemoteOnlyMigrations: plan.remoteOnly.length === 0,
    releaseNewerThanRemoteHead: plan.remote.every((version) => version < MIGRATION.version),
    nothingOfItExistsYet: evidence.objects.tables === 0 && evidence.objects.triggers === 0 && evidence.objects.functions === 0
  };
  check(Object.values(evidence.checks).every(Boolean), `audit-refused:${Object.entries(evidence.checks).filter(([, value]) => !value).map(([key]) => key).join(",")}`);
  return { url, sql };
}

function verifyApplied(sql) {
  const shape = objectState(sql);
  evidence.objects = shape;
  check(shape.tables === TABLES.length && shape.triggers === TRIGGERS.length && shape.functions === FUNCTIONS.length, "tables-triggers-or-functions-missing");

  const security = sql(`select c.relname, c.relrowsecurity as rls, c.relforcerowsecurity as forced,
      (select count(*) from pg_policies p where p.schemaname='public' and p.tablename=c.relname)::int as policies
    from pg_class c where c.relnamespace='public'::regnamespace and c.relname in (${quoted(TABLES)}) order by 1`);
  evidence.rowSecurity = security;
  check(security.length === TABLES.length && security.every((row) => row.rls && row.forced && row.policies === 0), "row-security-not-closed");

  // Hosted default privileges give service_role ALL on new tables unless it is
  // revoked first, so the grants are read back, never assumed.
  const grants = sql(`select grantee, table_name, string_agg(privilege_type, ',' order by privilege_type) as privileges
    from information_schema.role_table_grants
    where table_schema='public' and table_name in (${quoted(TABLES)}) and grantee in ('anon','authenticated','service_role','PUBLIC')
    group by 1, 2 order by 1, 2`);
  evidence.tableGrants = grants;
  check(grants.length === TABLES.length && grants.every((row) => row.grantee === "service_role" && row.privileges === "SELECT"), "table-grants-wider-than-service-role-select");

  const functions = sql(`select signature,
      has_function_privilege('anon', signature, 'EXECUTE') as anon,
      has_function_privilege('authenticated', signature, 'EXECUTE') as authenticated,
      has_function_privilege('service_role', signature, 'EXECUTE') as service_role,
      (select prosecdef from pg_proc where oid = signature::regprocedure) as security_definer,
      (select proconfig::text from pg_proc where oid = signature::regprocedure) as config
    from unnest(array[${quoted(FUNCTIONS)}]) as signature`);
  evidence.functions = functions.map((row) => ({ signature: row.signature.split("(")[0], browserExecute: row.anon || row.authenticated, serviceRole: row.service_role, securityDefiner: row.security_definer }));
  check(functions.length === FUNCTIONS.length && functions.every((row) => !row.anon && !row.authenticated && row.service_role && row.security_definer && String(row.config).includes("search_path=")), "function-privileges-wrong");

  const measurement = sql("select count(*)::int as rows, min(tracking_started_at) as tracking_started_at from public.ads_conversion_settings")[0];
  evidence.measurement = measurement;
  check(measurement.rows === 1 && measurement.tracking_started_at, "measurement-epoch-missing");
  // Counts only. account_created appears as accounts confirm; nothing here names anyone.
  evidence.ledger = sql(`select
    (select count(*) from public.ad_click_attributions)::int as clicks,
    (select count(*) from public.ads_conversion_events)::int as conversions,
    (select string_agg(event_name || ':' || count, ',' order by event_name) from (select event_name, count(*) from public.ads_conversion_events group by 1) e) as by_event`)[0];
}

async function migrate() {
  const { url, sql } = await audit();
  evidence.applying = MIGRATION.file;
  const before = evidence.snapshotBefore;
  const workRoot = mkdtempSync(join(tmpdir(), "mathnexa-ads-production-"));
  try {
    cpSync(resolve("supabase"), join(workRoot, "supabase"), { recursive: true });
    const dry = cli(["db", "push", "--db-url", url, "--dry-run"], workRoot);
    check(dry.ok, `dry-run-failed:${redact(dry.output).slice(-600)}`);
    const listed = [...new Set(redact(dry.output).match(/\d{14}_[a-z0-9_]+\.sql/g) ?? [])];
    evidence.dryRunWouldApply = listed;
    check(JSON.stringify(listed) === JSON.stringify([MIGRATION.file]), "refusing: the dry run would apply something other than this migration");
    const pushed = cli(["db", "push", "--db-url", url], workRoot);
    evidence.pushOutput = redact(pushed.output).split("\n").map((line) => line.trim()).filter((line) => /2026111|Applying|Finished|up to date|error/i.test(line)).slice(-6).map((line) => line.slice(0, 200));
    check(pushed.ok, `push-failed:${redact(pushed.output).slice(-800)}`);
  } finally {
    rmSync(workRoot, { recursive: true, force: true });
  }
  evidence.appliedAt = new Date().toISOString();
  const after = sql(SNAPSHOT_SQL)[0];
  evidence.snapshotAfter = after;
  evidence.recorded = sql(`select version, name, coalesce(array_length(statements,1),0) as statements from supabase_migrations.schema_migrations where version='${MIGRATION.version}'`);
  check(evidence.recorded.length === 1 && evidence.recorded[0].statements > 0, "history-row-missing");
  check(after.history === before.history + 1 && after.history_digest === before.history_digest, "other-history-rows-changed");
  check(after.billing_function_digest === before.billing_function_digest, "existing-billing-functions-changed");
  check(after.other_account_triggers === before.other_account_triggers, "existing-account-triggers-changed");
  // Live rows can move on their own between the two snapshots (a real sign-up or
  // webhook); anything that did is reported, and only a loss is refused.
  const moved = Object.keys(before).filter((key) => !["history", "history_digest"].includes(key) && after[key] !== before[key]);
  evidence.rowsMovedDuringMigration = moved;
  for (const key of ["auth_users", "accounts", "entitlements", "customers", "subscriptions", "webhook_events", "acceptances", "catalog", "resources"]) {
    check(after[key] >= before[key], `rows-lost:${key}`);
  }
  verifyApplied(sql);
}

async function verify() {
  const sql = sqlFor(connect());
  await identify(sql);
  const recorded = sql(`select version from supabase_migrations.schema_migrations where version='${MIGRATION.version}'`);
  check(recorded.length === 1, "migration-not-applied");
  evidence.snapshot = sql(SNAPSHOT_SQL)[0];
  verifyApplied(sql);
}

try {
  if (stage === "audit") await audit();
  else if (stage === "migrate") await migrate();
  else if (stage === "verify") await verify();
  else throw new Error("usage: --stage=audit|migrate|verify");
  evidence.result = "PASS";
  console.log(redact(JSON.stringify(evidence, null, 2)));
} catch (error) {
  evidence.result = "FAIL";
  evidence.error = redact(error instanceof Error ? error.message : String(error));
  console.log(redact(JSON.stringify(evidence, null, 2)));
  process.exitCode = 1;
}
