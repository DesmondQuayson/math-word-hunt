/**
 * Polygon Showdown — STAGING database activation (never production).
 *
 * Launched by scripts/invoke-polygon-showdown-staging.ps1, which loads only the
 * staging entries of the credential vault into this process.
 *
 *   --stage=identify read-only: the pooler database is the staging project,
 *                    which local migrations it has not applied, and the current
 *                    state of everything this game touches.
 *   --stage=migrate  applies the ONE pending Polygon migration, after a dry run,
 *                    and refuses if anything else is pending. Then runs verify
 *                    and confirms unrelated rows did not move.
 *   --stage=privileges read-only: who holds what on this game's tables.
 *   --stage=verify   read-only: tables, RLS, grants, functions, the 153 shop
 *                    items, the Draft catalog row and the shared /join guard.
 *   --stage=smoke    the room contract through the service-role functions with
 *                    synthetic hashes; a browser key cannot reach any of it.
 *                    Everything it creates is deleted.
 *
 * The database is reached through the Supabase session pooler. The pooler user
 * carries the staging project ref, so this can only ever reach staging. Prints
 * redacted JSON evidence; secrets never reach stdout.
 */
import { spawnSync } from "node:child_process";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { cpSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

import { ITEMS } from "../apps/platform-web/public/internal-games/polygon-showdown/src/engine/catalog.js";
import { CONFIG, encodeBoard, newGameState, SCHEDULES, startingBoard } from "../apps/platform-web/public/internal-games/polygon-showdown/src/engine/game.js";

const STAGING_PROJECT_REF = "gcmuhzxkwvfireyrearl";
// In order; `migrate` applies whichever single one is pending.
const MIGRATIONS = Object.freeze(["20261109100000", "20261109110000"]);
const GAME_KEY = "polygon-showdown";
// Applied to staging only by the PH2-07 security-observability branch. The CLI
// refuses to push while the remote has a version the local folder lacks, so its
// file is placed in the temporary push folder only; it is never re-applied.
const STAGING_ONLY = Object.freeze({ "20260909010000": { commit: "588b355", file: "20260909010000_security_observability_read_path.sql" } });
const POOLER_HOSTS = ["aws-0-us-east-2.pooler.supabase.com", "aws-1-us-east-2.pooler.supabase.com"];
const TABLES = ["polygon_inventory", "polygon_ledger", "polygon_participants", "polygon_profiles", "polygon_rooms", "polygon_shop_items", "polygon_solo_runs", "polygon_wallets"];
const FUNCTIONS = ["polygon_avatar_save", "polygon_bootstrap", "polygon_create_room", "polygon_host_command", "polygon_host_resume", "polygon_join_room", "polygon_leave", "polygon_player_commit", "polygon_player_load", "polygon_purchase", "polygon_solo_commit", "polygon_solo_load", "polygon_solo_open", "polygon_solo_start"];

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
  return { pending: local.filter((version) => !remote.includes(version)), remoteOnly: remote.filter((version) => !local.includes(version)), remoteCount: remote.length };
}

const counts = (sql) => sql(`select
  (select count(*) from public.game_catalog_entries)::int as catalog,
  (select count(*) from public.consumer_accounts)::int as accounts,
  (select count(*) from public.consumer_game_entitlements)::int as entitlements,
  (select count(*) from public.billing_subscriptions)::int as subscriptions,
  (select count(*) from auth.users)::int as auth_users,
  (select count(*) from public.bingo_rooms)::int as bingo_rooms,
  (select string_agg(stable_key || ':' || status, ',' order by stable_key) from public.game_catalog_entries where stable_key <> '${GAME_KEY}') as other_games`)[0];

async function identify() {
  const sql = querier(connect());
  const plan = pendingMigrations(sql);
  Object.assign(evidence, { pending: plan.pending, remoteOnly: plan.remoteOnly, remoteCount: plan.remoteCount });
  evidence.latestRemote = sql("select version from supabase_migrations.schema_migrations order by version desc limit 3").map((row) => String(row.version));
  evidence.rowCounts = counts(sql);
  evidence.polygonBefore = sql(`select
    (select count(*) from information_schema.tables where table_schema = 'public' and table_name like 'polygon!_%' escape '!')::int as tables,
    (select count(*) from public.game_catalog_entries where stable_key = '${GAME_KEY}')::int as catalog_rows,
    (to_regprocedure('public.live_room_game_for_code(text)') is not null) as join_router,
    exists (select 1 from pg_trigger where tgname = 'bingo_rooms_live_code_guard') as bingo_code_guard`)[0];
}

function verifyApplied(sql) {
  const tables = sql(`select relname, relrowsecurity, relforcerowsecurity,
      has_table_privilege('anon', oid, 'SELECT') or has_table_privilege('anon', oid, 'INSERT') or has_table_privilege('anon', oid, 'UPDATE') or has_table_privilege('anon', oid, 'DELETE') as anon_any,
      has_table_privilege('authenticated', oid, 'SELECT') or has_table_privilege('authenticated', oid, 'INSERT') or has_table_privilege('authenticated', oid, 'UPDATE') or has_table_privilege('authenticated', oid, 'DELETE') as authenticated_any
    from pg_class where relnamespace = 'public'::regnamespace and relname in (${TABLES.map((name) => `'${name}'`).join(",")}) order by relname`);
  evidence.tables = tables;
  check(tables.length === TABLES.length && tables.every((row) => row.relrowsecurity && row.relforcerowsecurity && !row.anon_any && !row.authenticated_any), "polygon-tables-not-locked-down");

  const functions = sql(`select proname, prosecdef,
      has_function_privilege('anon', oid, 'EXECUTE') as anon_execute,
      has_function_privilege('authenticated', oid, 'EXECUTE') as browser_execute,
      has_function_privilege('service_role', oid, 'EXECUTE') as server_execute
    from pg_proc where pronamespace = 'public'::regnamespace and proname like 'polygon!_%' escape '!' order by proname`);
  evidence.functions = functions.map((row) => row.proname);
  check(FUNCTIONS.every((name) => evidence.functions.includes(name)), "polygon-function-missing");
  check(functions.every((row) => row.prosecdef && !row.anon_execute && !row.browser_execute && row.server_execute), "polygon-functions-not-locked-down");

  const privateHelpers = sql(`select count(*)::int as helpers,
      count(*) filter (where has_function_privilege('anon', oid, 'EXECUTE') or has_function_privilege('authenticated', oid, 'EXECUTE'))::int as browser_callable
    from pg_proc where pronamespace = 'private'::regnamespace and proname like 'polygon!_%' escape '!'`)[0];
  evidence.privateHelpers = privateHelpers;
  check(privateHelpers.helpers > 0 && privateHelpers.browser_callable === 0, "polygon-private-helpers-open");

  const shop = sql("select count(*)::int as items, count(*) filter (where price = 0)::int as free, sum(price)::int as total, md5(string_agg(item_key || ':' || price || ':' || slot || ':' || tier, ',' order by item_key)) as digest from public.polygon_shop_items")[0];
  const expected = ITEMS.slice().sort((a, b) => (a.id < b.id ? -1 : 1));
  const local = createHash("md5").update(expected.map((item) => `${item.id}:${item.price}:${item.slot}:${item.tier}`).join(",")).digest("hex");
  evidence.shop = { items: shop.items, free: shop.free, total: shop.total, matchesGameCatalog: shop.digest === local };
  check(shop.items === 153 && shop.digest === local, "polygon-shop-catalog-differs-from-the-game");

  // The ledger's immutability is a privilege: even the application may only add lines.
  const ledger = sql(`select has_table_privilege('service_role', 'public.polygon_ledger', 'SELECT') as can_read,
      has_table_privilege('service_role', 'public.polygon_ledger', 'INSERT') as can_add,
      has_table_privilege('service_role', 'public.polygon_ledger', 'UPDATE') as can_update,
      has_table_privilege('service_role', 'public.polygon_ledger', 'DELETE') as can_delete`)[0];
  evidence.ledgerPrivileges = ledger;
  check(ledger.can_read && ledger.can_add && !ledger.can_update && !ledger.can_delete, "polygon-ledger-not-immutable");

  const router = sql(`select
      (to_regprocedure('public.live_room_game_for_code(text)') is not null) as join_router,
      exists (select 1 from pg_trigger where tgname = 'bingo_rooms_live_code_guard') as bingo_code_guard,
      has_function_privilege('anon', 'public.live_room_game_for_code(text)', 'EXECUTE') or has_function_privilege('authenticated', 'public.live_room_game_for_code(text)', 'EXECUTE') as router_browser_execute`)[0];
  evidence.joinRouting = router;
  check(router.join_router && router.bingo_code_guard && !router.router_browser_execute, "shared-join-routing-missing-or-open");

  const catalog = sql(`select stable_key, status, launch_type from public.game_catalog_entries where stable_key = '${GAME_KEY}'`);
  evidence.catalog = catalog[0] ?? null;
  check(catalog.length === 1 && catalog[0].status === "draft", "catalog-row-missing-or-not-draft");
}

async function verify() {
  const sql = querier(connect());
  evidence.latestVersions = sql("select version from supabase_migrations.schema_migrations order by version desc limit 2").map((row) => String(row.version));
  check(evidence.latestVersions[0] === MIGRATIONS.at(-1), "migration-not-applied");
  verifyApplied(sql);
}

/** Read-only: exactly who holds what on this game's tables, and the defaults new tables inherit. */
async function privileges() {
  const sql = querier(connect());
  evidence.tablePrivileges = sql(`select c.relname, grantee::regrole::text as grantee, string_agg(a.privilege_type, ',' order by a.privilege_type) as privileges
    from pg_class c cross join lateral aclexplode(c.relacl) a(grantor, grantee, privilege_type, is_grantable)
    where c.relnamespace = 'public'::regnamespace and c.relname like 'polygon!_%' escape '!' and a.grantee <> 0
    group by 1, 2 order by 1, 2`);
  evidence.defaultPrivileges = sql(`select pg_get_userbyid(d.defaclrole) as owner, d.defaclnamespace::regnamespace::text as schema, d.defaclobjtype as type, d.defaclacl::text as acl from pg_default_acl d where d.defaclnamespace = 'public'::regnamespace order by 1, 3`);
  evidence.owner = sql("select pg_get_userbyid(relowner) as owner from pg_class where oid = 'public.polygon_ledger'::regclass")[0];
  evidence.compute = sql("select current_setting('max_connections') as max_connections, current_setting('shared_buffers') as shared_buffers, version() as version")[0];
}

async function migrate() {
  const url = connect();
  const sql = querier(url);
  const { pending, remoteOnly } = pendingMigrations(sql);
  evidence.pendingBefore = pending;
  check(remoteOnly.every((version) => STAGING_ONLY[version]), `refusing: staging has unknown migrations this branch does not: ${JSON.stringify(remoteOnly)}`);
  evidence.stagingOnlyRecorded = remoteOnly;
  check(pending.length === 1 && MIGRATIONS.includes(pending[0]), `refusing: pending migrations are ${JSON.stringify(pending)}`);
  const MIGRATION = pending[0];
  evidence.applying = MIGRATION;
  const before = counts(sql);

  const workRoot = mkdtempSync(join(tmpdir(), "mathnexa-polygon-staging-"));
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
    evidence.dryRun = [...new Set([...dry.output.matchAll(/\b(20\d{12})_/g)].map((match) => match[1]))];
    check(evidence.dryRun.length === 1 && evidence.dryRun[0] === MIGRATION, "refusing: dry run would apply other migrations");
    const pushed = cli(["db", "push", "--db-url", url, "--include-all"], workRoot);
    check(pushed.ok, `push-failed:${redact(pushed.output).slice(-600)}`);
    evidence.pushOutput = redact(pushed.output).split("\n").filter((line) => /2026110|Applying|Finished|up to date/i.test(line)).slice(-6);
  } finally {
    rmSync(workRoot, { recursive: true, force: true });
  }

  evidence.latestVersionsAfter = sql("select version from supabase_migrations.schema_migrations order by version desc limit 2").map((row) => String(row.version));
  check(evidence.latestVersionsAfter[0] === MIGRATION, "migration-version-not-recorded");
  verifyApplied(sql);
  const after = counts(sql);
  evidence.rowCountsBefore = before;
  evidence.rowCountsAfter = after;
  check(after.catalog - before.catalog === (MIGRATION === MIGRATIONS[0] ? 1 : 0), "catalog-row-count-changed-unexpectedly");
  check(after.accounts === before.accounts && after.entitlements === before.entitlements && after.subscriptions === before.subscriptions && after.auth_users === before.auth_users && after.bingo_rooms === before.bingo_rooms && after.other_games === before.other_games, "unrelated-rows-changed");
}

async function smoke() {
  const secretKey = required("SUPABASE_SECRET_KEY", /^.{20,}$/);
  const client = createClient(`https://${STAGING_PROJECT_REF}.supabase.co`, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const hash = (value) => createHash("sha256").update(value).digest("hex");
  const owner = hash(`polygon-staging-smoke-${randomBytes(8).toString("hex")}`);
  const hostToken = hash(randomBytes(32).toString("hex"));
  const creatorToken = hash(randomBytes(32).toString("hex"));
  const playerToken = hash(randomBytes(32).toString("hex"));
  const subject = hash(randomBytes(16).toString("hex"));
  const code = String(randomInt(100_000, 1_000_000));
  const seed = randomBytes(16).toString("hex");
  const opening = newGameState(encodeBoard(startingBoard(seed)), CONFIG, SCHEDULES.standard);
  const rpc = async (fn, args) => {
    const { data, error } = await client.rpc(fn, args);
    check(!error, `${fn}-failed:${redact(error?.message)}`);
    return data;
  };
  let roomId = null;
  try {
    const created = await rpc("polygon_create_room", { p_code: code, p_owner_hash: owner, p_host_token_hash: hostToken, p_player_token_hash: creatorToken, p_user: null, p_name: "Smoke Creator", p_emoji: null, p_duration: 300, p_seed: seed, p_state: opening });
    roomId = created.id ?? null;
    const routed = await rpc("live_room_game_for_code", { p_code: code });
    const ava = await rpc("polygon_join_room", { p_code: code, p_name: "Smoke Ava", p_emoji: null, p_token_hash: playerToken, p_subject_hash: subject, p_user: null });
    const wrong = await rpc("polygon_join_room", { p_code: "100000", p_name: "Nobody", p_emoji: null, p_token_hash: hash("nobody"), p_subject_hash: subject, p_user: null });
    const seat = await rpc("polygon_player_load", { p_token_hash: playerToken });
    const stranger = await rpc("polygon_host_command", { p_owner_hash: hash("someone-else"), p_token_hash: hostToken, p_command: "lock", p_args: {} });
    const closed = await rpc("polygon_host_command", { p_owner_hash: owner, p_token_hash: hostToken, p_command: "close", p_args: {} });
    const gone = await rpc("polygon_player_load", { p_token_hash: playerToken });
    evidence.smoke = { created: created.result, routedTo: routed, joined: ava.result, unknownCode: wrong.result, seatPhase: seat.phase, seedHiddenFromSeatPayloadKeys: Object.keys(seat).filter((key) => key.includes("Hash")), strangerCommand: stranger.result, closed: closed.result ?? closed.status, seatAfterClose: gone.result };
    check(routed === "polygon_showdown", "code-did-not-route-to-this-game");
    check(ava.result === "joined" && wrong.result === "not-found" && seat.phase === "LOBBY" && stranger.result === "not-found" && gone.result !== "ok", "smoke-contract-failed");
    const publishable = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
    if (publishable) {
      const anon = createClient(`https://${STAGING_PROJECT_REF}.supabase.co`, publishable, { auth: { persistSession: false } });
      const browser = {};
      for (const table of ["polygon_wallets", "polygon_ledger", "polygon_rooms", "polygon_participants", "polygon_solo_runs", "polygon_inventory", "polygon_profiles"]) {
        const read = await anon.from(table).select("*").limit(1);
        browser[table] = read.error ? "refused" : `rows:${read.data?.length ?? 0}`;
        check(read.error || (read.data?.length ?? 0) === 0, `browser-identity-can-read-${table}`);
      }
      const call = await anon.rpc("polygon_player_load", { p_token_hash: playerToken });
      browser.rpc = call.error ? "refused" : "allowed";
      check(call.error, "browser-identity-can-call-room-functions");
      evidence.browserIdentity = browser;
    } else {
      evidence.browserIdentity = "skipped (no publishable key in the vault)";
    }
  } finally {
    await client.from("polygon_rooms").delete().eq("code", code).eq("host_token_hash", hostToken);
    if (roomId) await client.from("polygon_rooms").delete().eq("id", roomId);
  }
  const left = await client.from("polygon_rooms").select("id", { count: "exact", head: true }).eq("code", code);
  evidence.smokeRoomsLeft = left.count ?? null;
  check(left.count === 0, "smoke-room-not-removed");
}

try {
  if (stage === "identify") await identify();
  else if (stage === "migrate") await migrate();
  else if (stage === "verify") await verify();
  else if (stage === "privileges") await privileges();
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
