/**
 * Math Tug of War — STAGING database activation (never production).
 *
 * Launched by scripts/invoke-math-tug-of-war-staging.ps1, which loads only the
 * staging entries of the credential vault into this process.
 *
 *   --stage=migrate  applies supabase/migrations/20260927100000_math_tug_of_war.sql
 *                    to the staging project (refuses if any OTHER migration is
 *                    pending there), then verifies tables, RLS, grants,
 *                    functions and the catalog card, and that unrelated row
 *                    counts did not move.
 *   --stage=smoke    exercises create/join/answer/replay/leave through the
 *                    service-role functions with synthetic tokens, checks that
 *                    a browser key cannot reach rooms, then deletes the
 *                    synthetic room.
 *
 * The database is reached through the Supabase session pooler with the
 * staging database password (the direct host is IPv6-only). The pooler user
 * carries the staging project ref, so this can only ever reach staging.
 * Prints redacted JSON evidence; secrets never reach stdout.
 */
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

const STAGING_PROJECT_REF = "gcmuhzxkwvfireyrearl";
const MIGRATION = "20260927100000";
const POOLER_HOSTS = ["aws-0-us-east-2.pooler.supabase.com", "aws-1-us-east-2.pooler.supabase.com"];
const supabaseCli = resolve("node_modules/supabase/dist/supabase.js");
const stage = (process.argv.find((argument) => argument.startsWith("--stage=")) ?? "").slice("--stage=".length);
const secrets = [];
const evidence = { stage, project: STAGING_PROJECT_REF };

function redact(text) {
  let value = String(text ?? "");
  for (const secret of secrets) if (secret) value = value.split(secret).join("[redacted]");
  return value;
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
    env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "true" }
  });
  return { ok: result.status === 0, output: `${result.stdout ?? ""}\n${result.stderr ?? ""}` };
}

function databaseUrl(host, password) {
  return `postgresql://postgres.${STAGING_PROJECT_REF}:${encodeURIComponent(password)}@${host}:5432/postgres`;
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
    const url = databaseUrl(host, password);
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

async function migrate() {
  const url = connect();
  const sql = (query) => {
    const result = cli(["db", "query", "--db-url", url, "-o", "json", query]);
    check(result.ok, `query-failed:${redact(result.output).slice(-400)}`);
    return parseRows(result.output);
  };

  const local = readdirSync(resolve("supabase/migrations")).filter((file) => file.endsWith(".sql")).map((file) => file.slice(0, 14)).sort();
  const remote = sql("select version from supabase_migrations.schema_migrations order by version").map((row) => String(row.version));
  const pending = local.filter((version) => !remote.includes(version));
  evidence.pendingBefore = pending;
  check(pending.length === 1 && pending[0] === MIGRATION, `refusing: pending migrations are ${JSON.stringify(pending)}`);

  const counts = () => sql("select (select count(*) from public.game_catalog_entries) as catalog, (select count(*) from public.consumer_accounts) as accounts, (select count(*) from public.consumer_game_entitlements) as entitlements, (select count(*) from public.billing_subscriptions) as subscriptions")[0];
  const before = counts();

  const workRoot = mkdtempSync(join(tmpdir(), "mathnexa-tug-staging-"));
  try {
    cpSync(resolve("supabase"), join(workRoot, "supabase"), { recursive: true });
    const dry = cli(["db", "push", "--db-url", url, "--include-all", "--dry-run"], workRoot);
    check(dry.ok, `dry-run-failed:${redact(dry.output).slice(-400)}`);
    evidence.dryRun = redact(dry.output).split("\n").filter((line) => /2026|would|migration/i.test(line)).slice(-4);
    check(!/202609071|20260816|20260815/.test(dry.output), "refusing: dry run would apply other migrations");
    const pushed = cli(["db", "push", "--db-url", url, "--include-all"], workRoot);
    check(pushed.ok, `push-failed:${redact(pushed.output).slice(-600)}`);
    evidence.pushOutput = redact(pushed.output).split("\n").filter((line) => /20260927|Applying|Finished|up to date/i.test(line)).slice(-6);
  } finally {
    rmSync(workRoot, { recursive: true, force: true });
  }

  const after = counts();
  evidence.latestVersionsAfter = sql("select version from supabase_migrations.schema_migrations order by version desc limit 2").map((row) => String(row.version));
  check(evidence.latestVersionsAfter[0] === MIGRATION, "migration-version-not-recorded");
  const catalog = sql("select stable_key, status, version, display_order, thumbnail_reference from public.game_catalog_entries where stable_key='math-tug-of-war'");
  evidence.catalog = catalog[0];
  check(catalog[0]?.status === "published" && catalog[0]?.version === "1.0.0", "catalog-card-missing");
  const tables = sql("select relname, relrowsecurity, relforcerowsecurity, has_table_privilege('anon', oid, 'SELECT') as anon_select, has_table_privilege('authenticated', oid, 'SELECT') as authenticated_select from pg_class where relname in ('tug_rooms','tug_join_failures') and relnamespace='public'::regnamespace order by relname");
  evidence.tables = tables;
  check(tables.length === 2 && tables.every((row) => row.relrowsecurity && row.relforcerowsecurity && !row.anon_select && !row.authenticated_select), "room-tables-not-locked-down");
  const functions = sql("select proname, prosecdef, has_function_privilege('anon', oid, 'EXECUTE') as anon_execute, has_function_privilege('authenticated', oid, 'EXECUTE') as browser_execute, has_function_privilege('service_role', oid, 'EXECUTE') as server_execute from pg_proc where pronamespace='public'::regnamespace and proname like 'tug!_%' escape '!' order by proname");
  evidence.functions = functions;
  check(functions.length === 6 && functions.every((row) => row.prosecdef && !row.anon_execute && !row.browser_execute && row.server_execute), "room-functions-not-locked-down");
  evidence.rowCountsBefore = before;
  evidence.rowCountsAfter = after;
  check(Number(after.catalog) - Number(before.catalog) <= 1, "catalog-row-count-changed-unexpectedly");
  check(String(after.accounts) === String(before.accounts) && String(after.entitlements) === String(before.entitlements)
    && String(after.subscriptions) === String(before.subscriptions), "unrelated-row-counts-changed");
}

async function smoke() {
  const secretKey = required("SUPABASE_SECRET_KEY", /^.{20,}$/);
  const client = createClient(`https://${STAGING_PROJECT_REF}.supabase.co`, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const hash = (value) => createHash("sha256").update(value).digest("hex");
  const host = hash(randomBytes(32).toString("hex"));
  const guest = hash(randomBytes(32).toString("hex"));
  const owner = hash(`staging-smoke-${Date.now()}`);
  const code = Array.from({ length: 5 }, () => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 31)]).join("");
  const rpc = async (fn, args) => {
    const { data, error } = await client.rpc(fn, args);
    check(!error, `${fn}-failed:${redact(error?.message)}`);
    return data;
  };
  try {
    const created = await rpc("tug_create_room", { p_code: code, p_skill: "integers", p_seed: randomBytes(16).toString("hex"), p_host_name: "Smoke Host", p_host_token_hash: host, p_owner_hash: owner });
    const joined = await rpc("tug_join_room", { p_code: code, p_guest_name: "Smoke Guest", p_guest_token_hash: guest, p_owner_hash: owner });
    const pull = await rpc("tug_submit_answer", { p_code: code, p_token_hash: host, p_round: 1, p_question_index: 0, p_correct: true });
    const replay = await rpc("tug_submit_answer", { p_code: code, p_token_hash: host, p_round: 1, p_question_index: 0, p_correct: true });
    const wrong = await rpc("tug_submit_answer", { p_code: code, p_token_hash: guest, p_round: 1, p_question_index: 0, p_correct: false });
    const full = await rpc("tug_join_room", { p_code: code, p_guest_name: "Third", p_guest_token_hash: hash("third"), p_owner_hash: owner });
    const left = await rpc("tug_leave_room", { p_code: code, p_token_hash: guest });
    evidence.smoke = {
      created: created.result, joined: joined.result, pullPosition: pull.position, replay: replay.result,
      wrongPosition: wrong.position, full: full.result, left: left.status
    };
    check(created.result === "created" && joined.result === "joined" && pull.position === -1 && replay.result === "stale"
      && wrong.position === -1 && full.result === "full" && left.status === "closed", "smoke-contract-failed");
    const publishable = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
    if (publishable) {
      const anon = createClient(`https://${STAGING_PROJECT_REF}.supabase.co`, publishable, { auth: { persistSession: false } });
      const browserRead = await anon.from("tug_rooms").select("code").limit(1);
      const browserCall = await anon.rpc("tug_room_state", { p_code: code, p_token_hash: host });
      evidence.browserRead = browserRead.error ? "refused" : `rows:${browserRead.data?.length ?? 0}`;
      evidence.browserRpc = browserCall.error ? "refused" : "allowed";
      check((browserRead.error || (browserRead.data?.length ?? 0) === 0) && browserCall.error, "browser-identity-can-reach-rooms");
    } else {
      evidence.browserChecks = "skipped (no publishable key in the vault)";
    }
  } finally {
    await client.from("tug_rooms").delete().eq("code", code).eq("host_token_hash", host);
    await client.from("tug_join_failures").delete().eq("owner_hash", owner);
  }
}

try {
  if (stage === "migrate") await migrate();
  else if (stage === "smoke") await smoke();
  else throw new Error("usage: --stage=migrate|smoke");
  evidence.result = "PASS";
} catch (error) {
  evidence.result = "FAIL";
  evidence.error = redact(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
process.stdout.write(`${redact(JSON.stringify(evidence, null, 2))}\n`);
