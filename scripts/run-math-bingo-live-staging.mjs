/**
 * Math Bingo Live — STAGING database activation (never production).
 *
 * Launched by scripts/invoke-math-bingo-live-staging.ps1, which loads only the
 * staging entries of the credential vault into this process.
 *
 *   --stage=identify read-only: the pooler database is the staging project,
 *                    and which local migrations staging has not applied yet.
 *   --stage=migrate  applies the ONE pending Math Bingo Live migration
 *                    (20261103100000_math_bingo_live.sql, then
 *                    20261106100000_math_bingo_live_room_speed.sql) to the
 *                    staging project (refuses if anything else is pending
 *                    there), then verifies the tables, RLS, grants, functions
 *                    and the catalog row, and that unrelated row counts did not
 *                    move.
 *   --stage=smoke    create/join/state/close through the service-role
 *                    functions with synthetic tokens; a browser key cannot
 *                    reach rooms; the synthetic room is closed and deleted.
 *
 * The database is reached through the Supabase session pooler with the
 * staging database password (the direct host is IPv6-only). The pooler user
 * carries the staging project ref, so this can only ever reach staging.
 * Prints redacted JSON evidence; secrets never reach stdout.
 */
import { spawnSync } from "node:child_process";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { cpSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

const STAGING_PROJECT_REF = "gcmuhzxkwvfireyrearl";
// Bingo migrations in order; `migrate` applies whichever single one is pending.
const BINGO_MIGRATIONS = Object.freeze(["20261103100000", "20261106100000"]);
const FIRST_MIGRATION = BINGO_MIGRATIONS[0];
// Applied to staging only by the PH2-07 security-observability branch (not on
// main yet). The CLI refuses to push while the remote has a version the local
// folder lacks, so its file is placed in the temporary push folder only; it is
// already recorded on staging and is never re-applied.
const STAGING_ONLY = Object.freeze({ "20260909010000": { commit: "588b355", file: "20260909010000_security_observability_read_path.sql" } });
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

function pendingMigrations(sql) {
  const local = readdirSync(resolve("supabase/migrations")).filter((file) => file.endsWith(".sql")).map((file) => file.slice(0, 14)).sort();
  const remote = sql("select version from supabase_migrations.schema_migrations order by version").map((row) => String(row.version));
  return { pending: local.filter((version) => !remote.includes(version)), remoteOnly: remote.filter((version) => !local.includes(version)) };
}

const counts = (sql) => sql("select (select count(*) from public.game_catalog_entries)::int as catalog, (select count(*) from public.consumer_accounts)::int as accounts, (select count(*) from public.consumer_game_entitlements)::int as entitlements, (select count(*) from public.billing_subscriptions)::int as subscriptions, (select string_agg(stable_key || ':' || status, ',' order by stable_key) from public.game_catalog_entries where stable_key <> 'math-bingo-live') as other_games")[0];

async function identify() {
  const sql = querier(connect());
  const { pending, remoteOnly } = pendingMigrations(sql);
  evidence.pending = pending;
  evidence.remoteOnly = remoteOnly;
  evidence.latestRemote = sql("select version from supabase_migrations.schema_migrations order by version desc limit 3").map((row) => String(row.version));
  evidence.rowCounts = counts(sql);
  evidence.bingoObjectsPresent = sql("select (to_regclass('public.bingo_rooms') is not null) as bingo_rooms, exists(select 1 from public.game_catalog_entries where stable_key='math-bingo-live') as catalog_row")[0];
}

async function migrate() {
  const url = connect();
  const sql = querier(url);
  const { pending, remoteOnly } = pendingMigrations(sql);
  evidence.pendingBefore = pending;
  check(remoteOnly.every((version) => STAGING_ONLY[version]), `refusing: staging has unknown migrations this branch does not: ${JSON.stringify(remoteOnly)}`);
  evidence.stagingOnlyRecorded = remoteOnly;
  check(pending.length === 1 && BINGO_MIGRATIONS.includes(pending[0]), `refusing: pending migrations are ${JSON.stringify(pending)}`);
  const MIGRATION = pending[0];
  evidence.applying = MIGRATION;
  const before = counts(sql);
  const catalogBefore = sql("select status, lock_version from public.game_catalog_entries where stable_key='math-bingo-live'")[0] ?? null;

  const workRoot = mkdtempSync(join(tmpdir(), "mathnexa-bingo-staging-"));
  try {
    cpSync(resolve("supabase"), join(workRoot, "supabase"), { recursive: true });
    for (const version of remoteOnly) {
      const { commit, file } = STAGING_ONLY[version];
      const shown = spawnSync("git", ["show", `${commit}:supabase/migrations/${file}`], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
      check(shown.status === 0 && shown.stdout.length > 0, `staging-only-migration-unreadable:${version}`);
      writeFileSync(join(workRoot, "supabase", "migrations", file), shown.stdout);
    }
    const dry = cli(["db", "push", "--db-url", url, "--include-all", "--dry-run"], workRoot);
    check(dry.ok, `dry-run-failed:${redact(dry.output).slice(-400)}`);
    const wouldApply = [...dry.output.matchAll(/\b(20\d{12})_/g)].map((match) => match[1]);
    evidence.dryRun = [...new Set(wouldApply)];
    check(evidence.dryRun.length === 1 && evidence.dryRun[0] === MIGRATION, "refusing: dry run would apply other migrations");
    const pushed = cli(["db", "push", "--db-url", url, "--include-all"], workRoot);
    check(pushed.ok, `push-failed:${redact(pushed.output).slice(-600)}`);
    evidence.pushOutput = redact(pushed.output).split("\n").filter((line) => /2026110|Applying|Finished|up to date/i.test(line)).slice(-6);
  } finally {
    rmSync(workRoot, { recursive: true, force: true });
  }

  const after = counts(sql);
  evidence.latestVersionsAfter = sql("select version from supabase_migrations.schema_migrations order by version desc limit 2").map((row) => String(row.version));
  check(evidence.latestVersionsAfter[0] === MIGRATION, "migration-version-not-recorded");
  const catalog = sql("select stable_key, status, launch_type, recommended_grade_min, recommended_grade_max from public.game_catalog_entries where stable_key='math-bingo-live'");
  evidence.catalog = catalog[0];
  if (MIGRATION === FIRST_MIGRATION) check(catalog[0]?.status === "draft", "catalog-row-missing-or-not-draft");
  else check(catalogBefore && catalog[0]?.status === catalogBefore.status, "catalog-row-changed");
  const tables = sql("select relname, relrowsecurity, relforcerowsecurity, has_table_privilege('anon', oid, 'SELECT') as anon_select, has_table_privilege('authenticated', oid, 'SELECT') as authenticated_select from pg_class where relname in ('bingo_rooms','bingo_participants','bingo_join_failures') and relnamespace='public'::regnamespace order by relname");
  evidence.tables = tables;
  check(tables.length === 3 && tables.every((row) => row.relrowsecurity && row.relforcerowsecurity && !row.anon_select && !row.authenticated_select), "bingo-tables-not-locked-down");
  const functions = sql("select proname, prosecdef, has_function_privilege('anon', oid, 'EXECUTE') as anon_execute, has_function_privilege('authenticated', oid, 'EXECUTE') as browser_execute, has_function_privilege('service_role', oid, 'EXECUTE') as server_execute from pg_proc where pronamespace='public'::regnamespace and proname like 'bingo!_%' escape '!' order by proname");
  evidence.functions = functions.map((row) => row.proname);
  check(functions.length >= 10 && functions.every((row) => row.prosecdef && !row.anon_execute && !row.browser_execute && row.server_execute), "bingo-functions-not-locked-down");
  evidence.rowCountsBefore = before;
  evidence.rowCountsAfter = after;
  check(after.catalog - before.catalog === (MIGRATION === FIRST_MIGRATION ? 1 : 0), "catalog-row-count-changed-unexpectedly");
  if (MIGRATION !== FIRST_MIGRATION) {
    evidence.speedFunctions = sql("select (to_regprocedure('public.bingo_host_state(text,text,bigint,bigint)') is not null) as host_state_with_progress, (to_regprocedure('private.bingo_progress(uuid)') is not null) as progress_helper, has_function_privilege('anon','private.bingo_progress(uuid)','EXECUTE') or has_function_privilege('authenticated','private.bingo_progress(uuid)','EXECUTE') as progress_browser_execute")[0];
    check(evidence.speedFunctions.host_state_with_progress && evidence.speedFunctions.progress_helper && !evidence.speedFunctions.progress_browser_execute, "room-speed-functions-missing-or-open");
  }
  check(after.accounts === before.accounts && after.entitlements === before.entitlements && after.subscriptions === before.subscriptions
    && after.other_games === before.other_games, "unrelated-rows-changed");
}

async function smoke() {
  const secretKey = required("SUPABASE_SECRET_KEY", /^.{20,}$/);
  const client = createClient(`https://${STAGING_PROJECT_REF}.supabase.co`, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const hash = (value) => createHash("sha256").update(value).digest("hex");
  const owner = hash(`bingo-staging-smoke-${randomBytes(8).toString("hex")}`);
  const hostToken = hash(randomBytes(32).toString("hex"));
  const players = [hash(randomBytes(32).toString("hex")), hash(randomBytes(32).toString("hex"))];
  const subject = hash(randomBytes(16).toString("hex"));
  const code = String(randomInt(100_000, 1_000_000));
  const settings = { mode: "addition", level: "facts-10", questionSeconds: 0, revealSeconds: 0, patterns: { rows: true, columns: true, diagonals: false }, winners: 3, freeSpace: true, music: "host", celebration: "host", equivalentFractions: false };
  const rpc = async (fn, args) => {
    const { data, error } = await client.rpc(fn, args);
    check(!error, `${fn}-failed:${redact(error?.message)}`);
    return data;
  };
  try {
    const created = await rpc("bingo_create_room", { p_code: code, p_owner_hash: owner, p_host_token_hash: hostToken, p_settings: settings });
    const ava = await rpc("bingo_join_room", { p_code: code, p_name: "Smoke Ava", p_token_hash: players[0], p_subject_hash: subject });
    const again = await rpc("bingo_join_room", { p_code: code, p_name: "smoke ava", p_token_hash: players[1], p_subject_hash: subject });
    const wrong = await rpc("bingo_join_room", { p_code: "100000", p_name: "Nobody", p_token_hash: hash("nobody"), p_subject_hash: subject });
    const hostView = await rpc("bingo_host_state", { p_owner_hash: owner, p_token_hash: hostToken, p_since_version: null });
    const stranger = await rpc("bingo_host_state", { p_owner_hash: hash("someone-else"), p_token_hash: hostToken, p_since_version: null });
    const playerView = await rpc("bingo_player_state", { p_token_hash: players[0], p_since_version: null, p_since_me: null });
    const closed = await rpc("bingo_host_command", { p_owner_hash: owner, p_token_hash: hostToken, p_command: "close", p_args: {} });
    const gone = await rpc("bingo_player_state", { p_token_hash: players[0], p_since_version: null, p_since_me: null });
    evidence.smoke = {
      created: created.result, joined: ava.result, duplicateName: again.me?.name, unknownCode: wrong.result,
      hostPhase: hostView.phase, hostPatterns: hostView.settings?.patterns, strangerHost: stranger.result,
      playerPhase: playerView.phase, closed: closed.status, seatAfterClose: gone.result
    };
    check(created.result === "created" && ava.result === "joined" && again.me?.name === "smoke ava 2" && wrong.result === "not-found"
      && hostView.phase === "LOBBY" && hostView.settings?.patterns?.diagonals === false && stranger.result === "not-found"
      && playerView.phase === "LOBBY" && closed.status === "closed" && gone.result === "not-found", "smoke-contract-failed");
    const publishable = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
    if (publishable) {
      const anon = createClient(`https://${STAGING_PROJECT_REF}.supabase.co`, publishable, { auth: { persistSession: false } });
      const browserRead = await anon.from("bingo_rooms").select("code").limit(1);
      const browserCall = await anon.rpc("bingo_player_state", { p_token_hash: players[0], p_since_version: null, p_since_me: null });
      evidence.browserRead = browserRead.error ? "refused" : `rows:${browserRead.data?.length ?? 0}`;
      evidence.browserRpc = browserCall.error ? "refused" : "allowed";
      check((browserRead.error || (browserRead.data?.length ?? 0) === 0) && browserCall.error, "browser-identity-can-reach-rooms");
    } else {
      evidence.browserChecks = "skipped (no publishable key in the vault)";
    }
  } finally {
    await client.from("bingo_rooms").delete().eq("code", code).eq("host_token_hash", hostToken);
    await client.from("bingo_join_failures").delete().eq("subject_hash", subject);
  }
}

try {
  if (stage === "identify") await identify();
  else if (stage === "migrate") await migrate();
  else if (stage === "smoke") await smoke();
  else throw new Error(`unknown stage ${stage}`);
  evidence.result = "PASS";
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  evidence.result = "FAIL";
  evidence.error = redact(error instanceof Error ? error.message : String(error));
  console.log(JSON.stringify(evidence, null, 2));
  process.exitCode = 1;
}
