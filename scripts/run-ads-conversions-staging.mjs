/**
 * Google Ads conversion measurement — STAGING database activation (never production).
 *
 * Launched by scripts/invoke-ads-conversions-staging.ps1, which loads only the
 * staging entries of the credential vault into this process.
 *
 *   --stage=identify    read-only: the pooler database is the staging project,
 *                       which local migrations it has not applied, and whether
 *                       this feature's objects exist yet.
 *   --stage=migrate     applies the ONE ads-conversion migration, after a dry
 *                       run, and refuses if anything else is pending. Then runs
 *                       verify and confirms unrelated rows did not move.
 *   --stage=verify      read-only: tables, RLS, grants, triggers and functions.
 *   --stage=privileges  read-only: who holds what on this feature's tables.
 *   --stage=smoke       the contract through the service-role functions with one
 *                       synthetic account (confirmation, click, trial, first
 *                       payment, replay, report, deletion); a browser key cannot
 *                       reach any of it. Everything it creates is deleted.
 *
 * The database is reached through the Supabase session pooler. The pooler user
 * carries the staging project ref, so this can only ever reach staging. Prints
 * redacted JSON evidence; secrets never reach stdout. Mirrors
 * scripts/run-math-race-champions-staging.mjs.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { cpSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

const STAGING_PROJECT_REF = "gcmuhzxkwvfireyrearl";
const MIGRATION = "20261114100000";
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
const evidence = { stage, project: STAGING_PROJECT_REF, startedAt: new Date().toISOString() };

function redact(text) {
  let value = String(text ?? "");
  for (const secret of secrets) if (secret) value = value.split(secret).join("[redacted]");
  return value.replace(/postgresql:\/\/\S+/g, "postgresql://[redacted]").replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, "[sbkey]");
}
function check(condition, message) {
  if (!condition) throw new Error(message);
}
function required(name, pattern) {
  const value = process.env[name] ?? "";
  check(pattern.test(value), `missing-or-malformed-${name}`);
  secrets.push(value, encodeURIComponent(value));
  return value;
}
for (const name of Object.keys(process.env)) {
  check(!/_LIVE_|_PRODUCTION_|_READONLY_/.test(name), `refusing: ${name} is present in this process`);
}

function cli(commandArgs, workdir) {
  const result = spawnSync(process.execPath, [supabaseCli, ...commandArgs, ...(workdir ? ["--workdir", workdir] : []), "--yes"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
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
  const password = required("SUPABASE_DB_PASSWORD", /^.{16,}$/);
  for (const host of POOLER_HOSTS) {
    const url = `postgresql://postgres.${STAGING_PROJECT_REF}:${encodeURIComponent(password)}@${host}:5432/postgres`;
    const probe = cli(["db", "query", "--db-url", url, "-o", "json", "select current_database() as database"]);
    if (probe.ok) {
      secrets.push(url);
      evidence.pooler = host;
      return url;
    }
    evidence[`probe_${host}`] = redact(probe.output).split("\n").filter(Boolean).slice(-2);
  }
  throw new Error("staging-database-unreachable");
}

function querier(url) {
  return (query) => {
    const result = cli(["db", "query", "--db-url", url, "-o", "json", query]);
    check(result.ok, `query-failed:${redact(result.output).slice(-400)}`);
    return parseRows(result.output);
  };
}

const localFiles = () => readdirSync(resolve("supabase/migrations")).filter((file) => /^\d{14}_.+\.sql$/.test(file)).sort();

function pendingMigrations(sql) {
  const local = localFiles().map((file) => file.slice(0, 14));
  const remote = sql("select version, name from supabase_migrations.schema_migrations order by version");
  const remoteVersions = remote.map((row) => String(row.version));
  return {
    pending: local.filter((version) => !remoteVersions.includes(version)),
    remoteOnly: remote.filter((row) => !local.includes(String(row.version))).map((row) => ({ version: String(row.version), name: row.name })),
    remoteCount: remote.length
  };
}

// Rows this migration must not move.
const counts = (sql) => sql(`select
  (select count(*) from auth.users)::int as auth_users,
  (select count(*) from public.consumer_accounts)::int as accounts,
  (select count(*) from public.consumer_game_entitlements)::int as entitlements,
  (select count(*) from public.billing_customers)::int as customers,
  (select count(*) from public.billing_subscriptions)::int as subscriptions,
  (select count(*) from public.billing_webhook_events)::int as webhook_events,
  (select count(*) from public.game_catalog_entries)::int as catalog`)[0];

const present = (sql) => sql(`select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name in (${TABLES.map((name) => `'${name}'`).join(",")}))::int as tables,
  (select count(*) from pg_trigger where tgname in (${TRIGGERS.map((name) => `'${name}'`).join(",")}) and not tgisinternal)::int as triggers`)[0];

async function identify() {
  const sql = querier(connect());
  const plan = pendingMigrations(sql);
  Object.assign(evidence, { pending: plan.pending, remoteOnly: plan.remoteOnly, remoteCount: plan.remoteCount });
  evidence.latestRemote = sql("select version from supabase_migrations.schema_migrations order by version desc limit 4").map((row) => String(row.version));
  evidence.rowCounts = counts(sql);
  evidence.present = present(sql);
}

function verifyApplied(sql) {
  const shape = present(sql);
  evidence.present = shape;
  check(shape.tables === TABLES.length && shape.triggers === TRIGGERS.length, "tables-or-triggers-missing");

  const security = sql(`select c.relname, c.relrowsecurity as rls, c.relforcerowsecurity as forced,
      (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)::int as policies
    from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname in (${TABLES.map((name) => `'${name}'`).join(",")}) order by 1`);
  evidence.rowSecurity = security;
  check(security.length === TABLES.length && security.every((row) => row.rls && row.forced && row.policies === 0), "row-security-not-closed");

  // Hosted default privileges give service_role ALL on new tables unless it is
  // revoked first, so the grants are read back, never assumed.
  const grants = sql(`select grantee, table_name, string_agg(privilege_type, ',' order by privilege_type) as privileges
    from information_schema.role_table_grants
    where table_schema = 'public' and table_name in (${TABLES.map((name) => `'${name}'`).join(",")}) and grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
    group by 1, 2 order by 1, 2`);
  evidence.tableGrants = grants;
  check(grants.every((row) => row.grantee === "service_role" && row.privileges === "SELECT") && grants.length === TABLES.length, "table-grants-wider-than-service-role-select");

  const functions = sql(`select signature,
      has_function_privilege('anon', signature, 'EXECUTE') as anon,
      has_function_privilege('authenticated', signature, 'EXECUTE') as authenticated,
      has_function_privilege('service_role', signature, 'EXECUTE') as service_role,
      (select prosecdef from pg_proc where oid = signature::regprocedure) as security_definer,
      (select proconfig::text from pg_proc where oid = signature::regprocedure) as config
    from unnest(array[${FUNCTIONS.map((name) => `'${name}'`).join(",")}]) as signature`);
  evidence.functions = functions;
  check(functions.length === FUNCTIONS.length && functions.every((row) => !row.anon && !row.authenticated && row.service_role && row.security_definer && String(row.config).includes("search_path=")), "function-privileges-wrong");

  const settings = sql("select count(*)::int as rows, min(tracking_started_at) as tracking_started_at from public.ads_conversion_settings")[0];
  evidence.measurement = settings;
  check(settings.rows === 1 && settings.tracking_started_at, "measurement-epoch-missing");
  evidence.rows = sql(`select (select count(*) from public.ad_click_attributions)::int as clicks, (select count(*) from public.ads_conversion_events)::int as conversions`)[0];
}

async function verify() {
  const sql = querier(connect());
  const recorded = sql(`select version from supabase_migrations.schema_migrations where version = '${MIGRATION}'`).map((row) => String(row.version));
  evidence.releaseRecorded = recorded;
  check(recorded.length === 1, "migration-not-applied");
  verifyApplied(sql);
}

/** Read-only: exactly who holds what on this feature's tables. */
async function privileges() {
  const sql = querier(connect());
  evidence.tablePrivileges = sql(`select c.relname, a.grantee::regrole::text as grantee, string_agg(a.privilege_type, ',' order by a.privilege_type) as privileges
    from pg_class c cross join lateral aclexplode(c.relacl) a(grantor, grantee, privilege_type, is_grantable)
    where c.relnamespace = 'public'::regnamespace and c.relname in (${TABLES.map((name) => `'${name}'`).join(",")}) and c.relkind = 'r' and a.grantee <> 0
    group by 1, 2 order by 1, 2`);
  evidence.owner = sql("select pg_get_userbyid(relowner) as owner from pg_class where oid = 'public.ads_conversion_events'::regclass")[0];
}

async function migrate() {
  const url = connect();
  const sql = querier(url);
  const { pending, remoteOnly } = pendingMigrations(sql);
  evidence.pendingBefore = pending;
  evidence.remoteOnly = remoteOnly;
  // The only thing this may ever apply is this feature's one migration.
  check(JSON.stringify(pending) === JSON.stringify([MIGRATION]), `refusing: pending migrations are ${JSON.stringify(pending)}`);
  const before = counts(sql);

  const workRoot = mkdtempSync(join(tmpdir(), "mathnexa-ads-staging-"));
  try {
    cpSync(resolve("supabase"), join(workRoot, "supabase"), { recursive: true });
    // Staging holds migrations from branches that are not in this one. The CLI
    // refuses to push while the remote has a version the local folder lacks, so
    // each gets a placeholder file in the temporary folder only. A placeholder
    // is never run: its version is already recorded as applied.
    for (const { version, name } of remoteOnly) {
      writeFileSync(join(workRoot, "supabase", "migrations", `${version}_${String(name ?? "staging_only").replace(/[^a-z0-9_]/gi, "_")}.sql`), "-- Applied to staging by another branch; recorded here only so the history lines up.\n");
    }
    const dry = cli(["db", "push", "--db-url", url, "--include-all", "--dry-run"], workRoot);
    check(dry.ok, `dry-run-failed:${redact(dry.output).slice(-500)}`);
    evidence.dryRun = [...new Set([...dry.output.matchAll(/\b(20\d{12})_/g)].map((match) => match[1]))];
    check(evidence.dryRun.length === 1 && evidence.dryRun[0] === MIGRATION, `refusing: dry run would apply ${JSON.stringify(evidence.dryRun)}`);
    const pushed = cli(["db", "push", "--db-url", url, "--include-all"], workRoot);
    evidence.pushOutput = redact(pushed.output).split("\n").map((line) => line.trim()).filter((line) => /2026111|Applying|Finished|up to date|error/i.test(line)).slice(-8);
    check(pushed.ok, `push-failed:${redact(pushed.output).slice(-800)}`);
  } finally {
    rmSync(workRoot, { recursive: true, force: true });
  }

  const recorded = sql(`select version from supabase_migrations.schema_migrations where version = '${MIGRATION}'`).map((row) => String(row.version));
  evidence.releaseRecorded = recorded;
  check(recorded.length === 1, "migration-version-not-recorded");
  const after = counts(sql);
  evidence.rowCountsBefore = before;
  evidence.rowCountsAfter = after;
  for (const key of Object.keys(before)) check(after[key] === before[key], `unrelated-rows-changed:${key}`);
  verifyApplied(sql);
}

/**
 * One synthetic account through every rule, with the service-role functions the
 * application uses. Billing rows are written only for this account and removed
 * with it; no provider is contacted.
 */
async function smoke() {
  const sql = querier(connect());
  const secretKey = required("SUPABASE_SECRET_KEY", /^.{20,}$/);
  const publishable = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
  if (publishable) secrets.push(publishable);
  const client = createClient(`https://${STAGING_PROJECT_REF}.supabase.co`, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const tag = randomBytes(6).toString("hex");
  const email = `ads-smoke-${tag}@example.invalid`;
  const gclid = `Cj0KCQjw-SMOKE_${tag}_staging`;
  const subscriptionId = `sub_AdsSmoke${tag}`;
  const customerId = `cus_AdsSmoke${tag}`;
  let userId = null;
  const call = async (name, args) => {
    const { data, error } = await client.rpc(name, args);
    check(!error, `${name}-failed:${error?.message ?? ""}`);
    return data;
  };
  const before = counts(sql);
  try {
    const created = await client.auth.admin.createUser({ email, password: `${randomBytes(18).toString("base64url")}aA1!`, email_confirm: false });
    check(!created.error && created.data.user, `create-user-failed:${created.error?.message ?? ""}`);
    userId = created.data.user.id;
    const names = async () => (await client.from("ads_conversion_events").select("event_name").eq("user_id", userId)).data?.map((row) => row.event_name).sort() ?? [];
    check((await names()).length === 0, "unconfirmed-account-was-recorded");
    const confirmed = await client.auth.admin.updateUserById(userId, { email_confirm: true });
    check(!confirmed.error, "confirm-failed");
    check(JSON.stringify(await names()) === JSON.stringify(["account_created"]), "account-created-not-recorded-once");

    const clickedAt = new Date(Date.now() - 60_000).toISOString();
    check(await call("store_ad_click_attribution", { p_user_id: userId, p_gclid: gclid, p_gbraid: null, p_wbraid: null, p_clicked_at: clickedAt, p_capture_point: "checkout" }) === "stored", "click-not-stored");
    check(await call("store_ad_click_attribution", { p_user_id: userId, p_gclid: `${gclid}_later`, p_gbraid: null, p_wbraid: null, p_clicked_at: clickedAt, p_capture_point: "checkout" }) === "exists", "later-click-replaced-first");
    check(await call("store_ad_click_attribution", { p_user_id: userId, p_gclid: "bad value", p_gbraid: null, p_wbraid: null, p_clicked_at: clickedAt, p_capture_point: "checkout" }) !== "stored", "malformed-click-stored");

    // A subscription row, through the canonical synchronizer, exactly as billing writes it.
    const customer = await client.from("billing_customers").insert({ owner_consumer_id: userId, stripe_environment: "test", stripe_customer_id: customerId });
    check(!customer.error, `customer-insert-failed:${customer.error?.message ?? ""}`);
    const trialStart = new Date(Date.now() - 30_000);
    const trialEnd = new Date(trialStart.getTime() + 24 * 60 * 60 * 1000);
    const projected = await call("synchronize_consumer_billing_subscription", {
      p_source: "reconciliation", p_event_record_id: null, p_event_type: null, p_owner_user_id: userId, p_stripe_environment: "test",
      p_stripe_customer_id: customerId, p_stripe_subscription_id: subscriptionId, p_stripe_price_id: "price_AdsSmoke", p_subscription_status: "trialing",
      p_current_period_start: trialStart.toISOString(), p_current_period_end: trialEnd.toISOString(), p_cancel_at_period_end: false, p_canceled_at: null, p_ended_at: null,
      p_trial_start: trialStart.toISOString(), p_trial_end: trialEnd.toISOString(), p_latest_invoice_id: null, p_latest_invoice_paid_at: null,
      p_observed_at: new Date().toISOString(), p_grace_days: 7, p_emergency_default_deny: false
    });
    evidence.projectedTrial = projected;
    const record = (status, trial, paidAt, amount) => call("record_consumer_subscription_conversions", {
      p_owner_user_id: userId, p_stripe_environment: "test", p_stripe_subscription_id: subscriptionId, p_subscription_status: status,
      p_trial_start: trial, p_paid_at: paidAt, p_amount_paid_minor_units: amount
    });
    const paidAt = new Date().toISOString();
    const steps = {
      trial: await record("trialing", trialStart.toISOString(), null, null),
      trialReplay: await record("trialing", trialStart.toISOString(), null, null),
      zeroInvoice: await record("trialing", trialStart.toISOString(), paidAt, 0),
      firstPayment: await record("active", null, paidAt, 599),
      renewal: await record("active", null, new Date(Date.now() + 1000).toISOString(), 599),
      liveMode: await record("active", null, paidAt, 599).then(() => call("record_consumer_subscription_conversions", {
        p_owner_user_id: userId, p_stripe_environment: "live", p_stripe_subscription_id: subscriptionId, p_subscription_status: "active",
        p_trial_start: null, p_paid_at: paidAt, p_amount_paid_minor_units: 599
      }))
    };
    evidence.recorded = steps;
    check(JSON.stringify(steps) === JSON.stringify({ trial: ["trial_started"], trialReplay: [], zeroInvoice: [], firstPayment: ["subscription_started"], renewal: [], liveMode: [] }), "ledger-rules-not-met");
    check(JSON.stringify(await names()) === JSON.stringify(["account_created", "subscription_started", "trial_started"]), "ledger-rows-wrong");

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const reportable = (await call("list_reportable_ads_conversions", { p_since: since, p_stripe_environment: "test" })).filter((row) => row.gclid === gclid);
    evidence.reportable = reportable.map((row) => ({ event_name: row.event_name, value_minor_units: row.value_minor_units, currency: row.currency }));
    // account_created happened before this click, so only what followed it is reportable.
    check(JSON.stringify(reportable.map((row) => row.event_name).sort()) === JSON.stringify(["subscription_started", "trial_started"]), "reportable-rows-wrong");
    check(reportable.find((row) => row.event_name === "subscription_started")?.value_minor_units === 599, "first-payment-value-wrong");
    const live = (await call("list_reportable_ads_conversions", { p_since: since, p_stripe_environment: "live" })).filter((row) => row.gclid === gclid);
    check(live.length === 0, "test-mode-conversion-in-live-report");

    if (publishable) {
      const anon = createClient(`https://${STAGING_PROJECT_REF}.supabase.co`, publishable, { auth: { persistSession: false } });
      const browser = {};
      for (const table of TABLES) {
        const read = await anon.from(table).select("*").limit(1);
        browser[table] = read.error ? `refused (${read.error.code ?? "error"})` : `${read.data.length} rows`;
        check(Boolean(read.error) || read.data.length === 0, `browser-key-read-${table}`);
      }
      const listed = await anon.rpc("list_reportable_ads_conversions", { p_since: since, p_stripe_environment: "test" });
      const stored = await anon.rpc("store_ad_click_attribution", { p_user_id: userId, p_gclid: `${gclid}_anon`, p_gbraid: null, p_wbraid: null, p_clicked_at: clickedAt, p_capture_point: "sign-up" });
      browser.list = listed.error ? `refused (${listed.error.code ?? "error"})` : "ALLOWED";
      browser.store = stored.error ? `refused (${stored.error.code ?? "error"})` : "ALLOWED";
      check(Boolean(listed.error) && Boolean(stored.error), "browser-key-reached-a-function");
      evidence.browserKey = browser;
    } else {
      evidence.browserKey = "skipped (no publishable key in the vault)";
    }

    check(await call("erase_ad_click_attribution", { p_user_id: userId }) === true, "erase-failed");
    const afterErase = (await call("list_reportable_ads_conversions", { p_since: since, p_stripe_environment: "test" })).filter((row) => row.gclid === gclid);
    check(afterErase.length === 0, "reported-after-erase");
  } finally {
    if (userId) {
      await client.from("billing_subscriptions").delete().eq("owner_consumer_id", userId);
      await client.from("consumer_game_entitlements").delete().eq("user_id", userId);
      await client.from("billing_customers").delete().eq("owner_consumer_id", userId);
      const deleted = await client.auth.admin.deleteUser(userId);
      evidence.cleanup = deleted.error ? `delete-user-failed:${deleted.error.message}` : "synthetic account deleted";
    }
  }
  const left = sql(`select
    (select count(*) from auth.users where email = '${email}')::int as users,
    (select count(*) from public.ad_click_attributions where gclid like 'Cj0KCQjw-SMOKE_${tag}%')::int as clicks,
    (select count(*) from public.billing_subscriptions where stripe_subscription_id = '${subscriptionId}')::int as subscriptions,
    (select count(*) from public.billing_customers where stripe_customer_id = '${customerId}')::int as customers`)[0];
  evidence.left = left;
  check(Object.values(left).every((value) => value === 0), "smoke-rows-left-behind");
  const after = counts(sql);
  for (const key of Object.keys(before)) check(after[key] === before[key], `row-count-changed:${key}`);
}

try {
  if (stage === "identify") await identify();
  else if (stage === "migrate") await migrate();
  else if (stage === "verify") await verify();
  else if (stage === "privileges") await privileges();
  else if (stage === "smoke") await smoke();
  else throw new Error("usage: --stage=identify|migrate|verify|privileges|smoke");
  evidence.result = "PASS";
  console.log(redact(JSON.stringify(evidence, null, 2)));
} catch (error) {
  evidence.result = "FAIL";
  evidence.error = redact(error instanceof Error ? error.message : String(error));
  console.log(redact(JSON.stringify(evidence, null, 2)));
  process.exitCode = 1;
}
