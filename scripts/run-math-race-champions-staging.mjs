/**
 * Math Race Champions — STAGING database activation (never production).
 *
 * Launched by scripts/invoke-math-race-champions-staging.ps1, which loads only
 * the staging entries of the credential vault into this process.
 *
 *   --stage=identify   read-only: the pooler database is the staging project,
 *                      which local migrations it has not applied, and the
 *                      current state of everything this game touches.
 *   --stage=migrate    applies the ONE next pending Math Race migration, after
 *                      a dry run, and refuses if anything else is pending. Then
 *                      runs verify and confirms unrelated rows did not move.
 *   --stage=verify     read-only: tables, RLS, grants, functions, the four
 *                      cars, the ten achievements, the catalog row and the
 *                      shared /join guard.
 *   --stage=privileges read-only: who holds what on this game's tables.
 *   --stage=smoke      the room contract through the service-role functions
 *                      with synthetic hashes; a browser key cannot reach any of
 *                      it. Everything it creates is deleted.
 *
 * The database is reached through the Supabase session pooler. The pooler user
 * carries the staging project ref, so this can only ever reach staging. Prints
 * redacted JSON evidence; secrets never reach stdout. Mirrors
 * scripts/run-polygon-showdown-staging.mjs.
 */
import { spawnSync } from "node:child_process";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

import { ACHIEVEMENTS, CARS, newRacerState } from "../apps/platform-web/public/internal-games/math-race-champions/src/engine/race.js";

const STAGING_PROJECT_REF = "gcmuhzxkwvfireyrearl";
// In order; `migrate` applies whichever single one is next.
const MIGRATIONS = Object.freeze(["20261112100000", "20261112110000"]);
const GAME_KEY = "math-race-champions";
const POOLER_HOSTS = ["aws-0-us-east-2.pooler.supabase.com", "aws-1-us-east-2.pooler.supabase.com"];
const TABLES = ["race_achievements", "race_cars", "race_garage", "race_ledger", "race_participants", "race_profiles", "race_rooms", "race_runs", "race_stage_progress", "race_wallets"];
const FUNCTIONS = ["race_bootstrap", "race_create_room", "race_equip", "race_host_command", "race_host_resume", "race_join_room", "race_leave", "race_player_commit", "race_player_load", "race_purchase", "race_run_commit", "race_run_finish", "race_run_load", "race_run_start"];

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

const counts = (sql) => sql(`select
  (select count(*) from public.game_catalog_entries)::int as catalog,
  (select count(*) from public.consumer_accounts)::int as accounts,
  (select count(*) from public.consumer_game_entitlements)::int as entitlements,
  (select count(*) from public.billing_subscriptions)::int as subscriptions,
  (select count(*) from auth.users)::int as auth_users,
  (select count(*) from public.bingo_rooms)::int as bingo_rooms,
  (select count(*) from public.polygon_rooms)::int as polygon_rooms,
  (select count(*) from public.polygon_wallets)::int as polygon_wallets,
  (select string_agg(stable_key || ':' || status, ',' order by stable_key) from public.game_catalog_entries where stable_key <> '${GAME_KEY}') as other_games`)[0];

async function identify() {
  const sql = querier(connect());
  const plan = pendingMigrations(sql);
  Object.assign(evidence, { pending: plan.pending, remoteOnly: plan.remoteOnly, remoteCount: plan.remoteCount });
  evidence.latestRemote = sql("select version from supabase_migrations.schema_migrations order by version desc limit 4").map((row) => String(row.version));
  evidence.rowCounts = counts(sql);
  evidence.raceBefore = sql(`select
    (select count(*) from information_schema.tables where table_schema = 'public' and table_name like 'race!_%' escape '!')::int as tables,
    (select count(*) from public.game_catalog_entries where stable_key = '${GAME_KEY}')::int as catalog_rows,
    (select pg_get_functiondef('public.live_room_game_for_code(text)'::regprocedure) like '%race_rooms%') as join_router_knows_race,
    exists (select 1 from pg_trigger where tgname = 'bingo_rooms_live_code_guard') as bingo_code_guard,
    exists (select 1 from pg_trigger where tgname = 'polygon_rooms_live_code_guard') as polygon_code_guard`)[0];
  evidence.compute = sql("select current_setting('max_connections') as max_connections, current_setting('shared_buffers') as shared_buffers")[0];
}

function verifyApplied(sql, { expectStatus = null } = {}) {
  const tables = sql(`select relname, relrowsecurity, relforcerowsecurity,
      has_table_privilege('anon', oid, 'SELECT') or has_table_privilege('anon', oid, 'INSERT') or has_table_privilege('anon', oid, 'UPDATE') or has_table_privilege('anon', oid, 'DELETE') as anon_any,
      has_table_privilege('authenticated', oid, 'SELECT') or has_table_privilege('authenticated', oid, 'INSERT') or has_table_privilege('authenticated', oid, 'UPDATE') or has_table_privilege('authenticated', oid, 'DELETE') as authenticated_any
    from pg_class where relnamespace = 'public'::regnamespace and relname in (${TABLES.map((name) => `'${name}'`).join(",")}) order by relname`);
  evidence.tables = tables;
  check(tables.length === TABLES.length && tables.every((row) => row.relrowsecurity && row.relforcerowsecurity && !row.anon_any && !row.authenticated_any), "race-tables-not-locked-down");

  const functions = sql(`select proname, prosecdef,
      has_function_privilege('anon', oid, 'EXECUTE') as anon_execute,
      has_function_privilege('authenticated', oid, 'EXECUTE') as browser_execute,
      has_function_privilege('service_role', oid, 'EXECUTE') as server_execute
    from pg_proc where pronamespace = 'public'::regnamespace and proname like 'race!_%' escape '!' order by proname`);
  evidence.functions = functions.map((row) => row.proname);
  check(FUNCTIONS.every((name) => evidence.functions.includes(name)), "race-function-missing");
  check(functions.every((row) => row.prosecdef && !row.anon_execute && !row.browser_execute && row.server_execute), "race-functions-not-locked-down");

  const privateHelpers = sql(`select count(*)::int as helpers,
      count(*) filter (where has_function_privilege('anon', oid, 'EXECUTE') or has_function_privilege('authenticated', oid, 'EXECUTE'))::int as browser_callable
    from pg_proc where pronamespace = 'private'::regnamespace and proname like 'race!_%' escape '!'`)[0];
  evidence.privateHelpers = privateHelpers;
  check(privateHelpers.helpers > 0 && privateHelpers.browser_callable === 0, "race-private-helpers-open");

  // The shop is the game's own four cars, at the owner's prices.
  const cars = sql("select car_key, name, price, top_speed, boost, decay_milli, active from public.race_cars order by sort");
  evidence.cars = cars.map((car) => `${car.car_key}:${car.price}:${car.top_speed}:${car.boost}:${car.decay_milli}`);
  check(JSON.stringify(evidence.cars) === JSON.stringify(CARS.map((car) => `${car.key}:${car.price}:${car.topSpeed}:${car.boost}:${Math.round(car.decay * 1000)}`)), "race-cars-differ-from-the-game");
  check(cars.every((car) => car.active) && JSON.stringify(cars.map((car) => car.price)) === JSON.stringify([0, 2000, 4000, 6000]), "race-car-prices-wrong");
  const achievements = sql("select count(*)::int as n, coalesce(sum(reward), 0)::int as total, string_agg(achievement_key, ',' order by achievement_key) as keys from public.race_achievements")[0];
  evidence.achievements = { count: achievements.n, total: achievements.total };
  check(achievements.n === ACHIEVEMENTS.length && achievements.keys === ACHIEVEMENTS.map((item) => item.key).sort().join(","), "race-achievements-differ-from-the-game");

  // The ledger's immutability is a privilege: even the application may only add lines.
  const ledger = sql(`select has_table_privilege('service_role', 'public.race_ledger', 'SELECT') as can_read,
      has_table_privilege('service_role', 'public.race_ledger', 'INSERT') as can_add,
      has_table_privilege('service_role', 'public.race_ledger', 'UPDATE') as can_update,
      has_table_privilege('service_role', 'public.race_ledger', 'DELETE') as can_delete,
      has_table_privilege('service_role', 'public.race_ledger', 'TRUNCATE') as can_truncate,
      has_table_privilege('service_role', 'public.race_cars', 'INSERT') or has_table_privilege('service_role', 'public.race_cars', 'UPDATE') or has_table_privilege('service_role', 'public.race_cars', 'DELETE') as can_change_cars,
      has_sequence_privilege('anon', 'public.race_ledger_id_seq', 'select,usage,update') or has_sequence_privilege('authenticated', 'public.race_ledger_id_seq', 'select,usage,update') as browser_sequence`)[0];
  evidence.ledgerPrivileges = ledger;
  check(ledger.can_read && ledger.can_add && !ledger.can_update && !ledger.can_delete && !ledger.can_truncate && !ledger.can_change_cars && !ledger.browser_sequence, "race-ledger-not-append-only");

  const router = sql(`select
      (to_regprocedure('public.live_room_game_for_code(text)') is not null) as join_router,
      (select pg_get_functiondef('public.live_room_game_for_code(text)'::regprocedure) like '%race_rooms%') as router_knows_race,
      exists (select 1 from pg_trigger where tgname = 'bingo_rooms_live_code_guard') as bingo_code_guard,
      exists (select 1 from pg_trigger where tgname = 'polygon_rooms_live_code_guard') as polygon_code_guard,
      exists (select 1 from pg_trigger where tgname = 'race_rooms_live_code_guard') as race_code_guard,
      has_function_privilege('anon', 'public.live_room_game_for_code(text)', 'EXECUTE') or has_function_privilege('authenticated', 'public.live_room_game_for_code(text)', 'EXECUTE') as router_browser_execute`)[0];
  evidence.joinRouting = router;
  check(router.join_router && router.router_knows_race && router.bingo_code_guard && router.polygon_code_guard && router.race_code_guard && !router.router_browser_execute, "shared-join-routing-missing-or-open");

  const catalog = sql(`select stable_key, slug, title, status, launch_type, thumbnail_reference, publication_metadata->>'internal_route' as internal_route from public.game_catalog_entries where stable_key = '${GAME_KEY}'`);
  evidence.catalog = catalog[0] ?? null;
  const allowed = expectStatus ? [expectStatus] : ["draft", "published", "archived"];
  check(catalog.length === 1 && allowed.includes(catalog[0].status) && catalog[0].launch_type === "internal" && catalog[0].internal_route === "/games/math-race-champions/play" && catalog[0].thumbnail_reference === "builtin:math-race-champions", "catalog-row-missing-or-wrong");
  evidence.rows = sql(`select (select count(*) from public.race_wallets)::int as wallets, (select count(*) from public.race_ledger)::int as ledger, (select count(*) from public.race_garage)::int as garage, (select count(*) from public.race_profiles)::int as profiles, (select count(*) from public.race_stage_progress)::int as stage_progress, (select count(*) from public.race_runs)::int as runs, (select count(*) from public.race_rooms)::int as rooms, (select count(*) from public.race_participants)::int as participants`)[0];
}

async function verify() {
  const sql = querier(connect());
  const recorded = sql(`select version from supabase_migrations.schema_migrations where version in (${MIGRATIONS.map((version) => `'${version}'`).join(",")}) order by version`).map((row) => String(row.version));
  evidence.releaseRecorded = recorded;
  check(JSON.stringify(recorded) === JSON.stringify(MIGRATIONS), "migrations-not-applied");
  verifyApplied(sql);
}

/** Read-only: exactly who holds what on this game's tables. */
async function privileges() {
  const sql = querier(connect());
  evidence.tablePrivileges = sql(`select c.relname, a.grantee::regrole::text as grantee, string_agg(a.privilege_type, ',' order by a.privilege_type) as privileges
    from pg_class c cross join lateral aclexplode(c.relacl) a(grantor, grantee, privilege_type, is_grantable)
    where c.relnamespace = 'public'::regnamespace and c.relname like 'race!_%' escape '!' and c.relkind = 'r' and a.grantee <> 0
    group by 1, 2 order by 1, 2`);
  evidence.owner = sql("select pg_get_userbyid(relowner) as owner from pg_class where oid = 'public.race_ledger'::regclass")[0];
  evidence.compute = sql("select current_setting('max_connections') as max_connections, current_setting('shared_buffers') as shared_buffers, version() as version")[0];
}

async function migrate() {
  const url = connect();
  const sql = querier(url);
  const { pending, remoteOnly } = pendingMigrations(sql);
  evidence.pendingBefore = pending;
  evidence.remoteOnly = remoteOnly;
  // Everything pending must be this game's, in order; nothing else is ever applied from here.
  const next = pending[0];
  check(pending.length > 0 && pending.every((version) => MIGRATIONS.includes(version)) && JSON.stringify(pending) === JSON.stringify(MIGRATIONS.slice(MIGRATIONS.indexOf(next))), `refusing: pending migrations are ${JSON.stringify(pending)}`);
  evidence.applying = next;
  const before = counts(sql);

  const workRoot = mkdtempSync(join(tmpdir(), "mathnexa-race-staging-"));
  try {
    cpSync(resolve("supabase"), join(workRoot, "supabase"), { recursive: true });
    // Staging holds migrations from branches that are not in this one. The CLI
    // refuses to push while the remote has a version the local folder lacks, so
    // each gets a placeholder file in the temporary folder only. A placeholder
    // is never run: its version is already recorded as applied.
    for (const { version, name } of remoteOnly) {
      writeFileSync(join(workRoot, "supabase", "migrations", `${version}_${String(name ?? "staging_only").replace(/[^a-z0-9_]/gi, "_")}.sql`), "-- Applied to staging by another branch; recorded here only so the history lines up.\n");
    }
    // Only the next file is visible to the CLI, so one run can never apply two.
    for (const later of pending.slice(1)) {
      const file = localFiles().find((name) => name.startsWith(later));
      if (file && existsSync(join(workRoot, "supabase", "migrations", file))) rmSync(join(workRoot, "supabase", "migrations", file));
    }
    const dry = cli(["db", "push", "--db-url", url, "--include-all", "--dry-run"], workRoot);
    check(dry.ok, `dry-run-failed:${redact(dry.output).slice(-500)}`);
    evidence.dryRun = [...new Set([...dry.output.matchAll(/\b(20\d{12})_/g)].map((match) => match[1]))];
    check(evidence.dryRun.length === 1 && evidence.dryRun[0] === next, `refusing: dry run would apply ${JSON.stringify(evidence.dryRun)}`);
    const pushed = cli(["db", "push", "--db-url", url, "--include-all"], workRoot);
    evidence.pushOutput = redact(pushed.output).split("\n").map((line) => line.trim()).filter((line) => /2026111|Applying|Finished|up to date|error/i.test(line)).slice(-8);
    check(pushed.ok, `push-failed:${redact(pushed.output).slice(-800)}`);
  } finally {
    rmSync(workRoot, { recursive: true, force: true });
  }

  const recorded = sql(`select version from supabase_migrations.schema_migrations where version in (${MIGRATIONS.map((version) => `'${version}'`).join(",")}) order by version`).map((row) => String(row.version));
  evidence.releaseRecorded = recorded;
  check(recorded.includes(next), "migration-version-not-recorded");
  const after = counts(sql);
  evidence.rowCountsBefore = before;
  evidence.rowCountsAfter = after;
  check(after.catalog - before.catalog === (next === MIGRATIONS[0] ? 1 : 0), "catalog-row-count-changed-unexpectedly");
  for (const key of ["accounts", "entitlements", "subscriptions", "auth_users", "bingo_rooms", "polygon_rooms", "polygon_wallets", "other_games"]) check(after[key] === before[key], `unrelated-rows-changed:${key}`);
  if (next === MIGRATIONS[0]) {
    const catalog = sql(`select status from public.game_catalog_entries where stable_key = '${GAME_KEY}'`);
    check(catalog.length === 1 && catalog[0].status === "draft", "catalog-row-not-draft-after-registration");
    evidence.catalog = catalog[0];
  } else {
    verifyApplied(sql);
  }
}

async function smoke() {
  const secretKey = required("SUPABASE_SECRET_KEY", /^.{20,}$/);
  const client = createClient(`https://${STAGING_PROJECT_REF}.supabase.co`, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const hash = (value) => createHash("sha256").update(value).digest("hex");
  const owner = hash(`race-staging-smoke-${randomBytes(8).toString("hex")}`);
  const hostToken = hash(randomBytes(32).toString("hex"));
  const creatorToken = hash(randomBytes(32).toString("hex"));
  const playerToken = hash(randomBytes(32).toString("hex"));
  const subject = hash(randomBytes(16).toString("hex"));
  const code = String(randomInt(100_000, 1_000_000));
  const settings = { categories: ["percent-to-decimal", "decimal-to-percent"], difficulty: "easy" };
  const rpc = async (fn, args) => {
    const { data, error } = await client.rpc(fn, args);
    check(!error, `${fn}-failed:${redact(error?.message)}`);
    return data;
  };
  let roomId = null;
  try {
    const created = await rpc("race_create_room", { p_code: code, p_owner_hash: owner, p_host_token_hash: hostToken, p_player_token_hash: creatorToken, p_user: null, p_name: "Smoke Creator", p_emoji: null, p_colour: "gold", p_settings: settings, p_seed: randomBytes(16).toString("hex"), p_state: newRacerState() });
    roomId = created.id ?? created.room?.id ?? null;
    const routed = await rpc("live_room_game_for_code", { p_code: code });
    const ava = await rpc("race_join_room", { p_code: code, p_name: "Smoke Ava", p_emoji: null, p_colour: "pink", p_token_hash: playerToken, p_subject_hash: subject, p_user: null, p_state: newRacerState() });
    const wrong = await rpc("race_join_room", { p_code: "100000", p_name: "Nobody", p_emoji: null, p_colour: "pink", p_token_hash: hash("nobody"), p_subject_hash: subject, p_user: null, p_state: newRacerState() });
    const seat = await rpc("race_player_load", { p_token_hash: playerToken });
    const stranger = await rpc("race_host_command", { p_owner_hash: hash("someone-else"), p_token_hash: hostToken, p_command: "lock", p_args: {} });
    const closed = await rpc("race_host_command", { p_owner_hash: owner, p_token_hash: hostToken, p_command: "close", p_args: {} });
    const gone = await rpc("race_player_load", { p_token_hash: playerToken });
    const unrouted = await rpc("live_room_game_for_code", { p_code: code });
    evidence.smoke = { created: created.result, routedTo: routed, joined: ava.result, unknownCode: wrong.result, seatPhase: seat.phase ?? seat.room?.phase ?? seat.result, strangerCommand: stranger.result, closed: closed.result ?? closed.status ?? closed.phase, seatAfterClose: gone.result, routedAfterClose: unrouted };
    check(created.result === "created" && routed === "math_race_champions" && ava.result === "joined" && wrong.result === "not-found" && stranger.result === "not-found" && gone.result !== "ok" && unrouted === null, "smoke-contract-failed");
    const publishable = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
    if (publishable) {
      secrets.push(publishable);
      const anon = createClient(`https://${STAGING_PROJECT_REF}.supabase.co`, publishable, { auth: { persistSession: false } });
      const browser = {};
      for (const table of TABLES) {
        const read = await anon.from(table).select("*").limit(1);
        browser[table] = read.error ? "refused" : `rows:${read.data?.length ?? 0}`;
        check(read.error || (read.data?.length ?? 0) === 0, `browser-identity-can-read-${table}`);
      }
      const call = await anon.rpc("race_player_load", { p_token_hash: playerToken });
      browser.rpc = call.error ? "refused" : "allowed";
      check(call.error, "browser-identity-can-call-room-functions");
      const lookup = await anon.rpc("live_room_game_for_code", { p_code: code });
      browser.router = lookup.error ? "refused" : "allowed";
      check(lookup.error, "browser-identity-can-call-the-code-router");
      evidence.browserIdentity = browser;
    } else {
      evidence.browserIdentity = "skipped (no publishable key in the vault)";
    }
  } finally {
    await client.from("race_rooms").delete().eq("code", code).eq("host_token_hash", hostToken);
    if (roomId) await client.from("race_rooms").delete().eq("id", roomId);
    await client.from("bingo_join_failures").delete().eq("subject_hash", subject);
  }
  const left = await client.from("race_rooms").select("id", { count: "exact", head: true }).eq("code", code);
  evidence.smokeRoomsLeft = left.count ?? null;
  check(left.count === 0, "smoke-room-not-removed");
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
