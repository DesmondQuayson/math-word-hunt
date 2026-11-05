/**
 * Math Bingo Live — PRODUCTION database release (owner approved "Release as is",
 * 2026-11-05, after the staging review and the 50-player staging load test).
 *
 * Launched by scripts/invoke-math-bingo-live-production.ps1, which loads only
 * the production project ref, the production database password and the
 * production service key from the credential vault. One stage per run:
 *
 *   --stage=audit    READ ONLY. Proves the target is production with several
 *                    independent signals, lists the migration history, proves
 *                    that exactly 20261103100000 is pending (nothing else, no
 *                    remote-only versions), that no Math Bingo Live object
 *                    exists yet, and snapshots the catalog, history and row
 *                    counts as the rollback baseline.
 *   --stage=migrate  Re-runs every audit check, dry-runs `supabase db push`
 *                    (must list exactly the one file), applies it with the CLI
 *                    (which records the history row itself), then checks the
 *                    history, the DRAFT catalog row and every unrelated count.
 *   --stage=verify   Tables (RLS forced, no browser grants), functions
 *                    (SECURITY DEFINER, service_role only), the catalog row
 *                    (draft or published) and the other games, unchanged.
 *   --stage=smoke    Service-role room contract on production with synthetic
 *                    hashes only (no account): create, join, duplicate name,
 *                    unknown code, host view, a stranger's host view, player
 *                    view, close. A browser key cannot reach rooms. Every
 *                    synthetic row is deleted afterwards.
 *
 * Mirrors scripts/run-math-tug-of-war-production.mjs (v1.2.21 release) and
 * scripts/run-math-bingo-live-staging.mjs. The database is reached through the
 * IPv4 session pooler; the pooler user carries the production project ref.
 * Output is redacted JSON evidence; no secret reaches stdout.
 */
import { spawnSync } from "node:child_process";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { cpSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

const STAGING_PROJECT_REF = "gcmuhzxkwvfireyrearl";
const MIGRATION = "20261103100000";
const MIGRATION_FILE = "20261103100000_math_bingo_live.sql";
const GAME_KEY = "math-bingo-live";
// Grade 6 quizzes published to PRODUCTION on 2026-09-26 (v1.2.13); staging holds different ids.
const PRODUCTION_QUIZ_ID_PREFIXES = Object.freeze(["83d9252f", "42215d2a", "5b8bdc39", "1d80b325", "e01a72e2", "3e25faa1", "339aa712", "7654e5e9"]);
const POOLER_HOSTS = ["aws-0-us-east-2.pooler.supabase.com", "aws-1-us-east-2.pooler.supabase.com"];
const BINGO_TABLES = Object.freeze(["bingo_join_failures", "bingo_participants", "bingo_rooms"]);
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
  check(!/^MVH_STAGING|^STAGING_|_STAGING$|^SUPABASE_DB_PASSWORD$|^SUPABASE_SECRET_KEY$|^VERCEL_AUTOMATION_BYPASS_SECRET$/.test(name), `refusing: staging variable ${name} is present in this process`);
}
const ref = required("SUPABASE_PRODUCTION_PROJECT_REF", /^[A-Za-z]{20}$/).toLowerCase();
check(ref !== STAGING_PROJECT_REF, "refusing: the production project ref is the staging project");
evidence.projectRef = ref;

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

const SNAPSHOT_SQL = `select
  (select count(*) from public.game_catalog_entries)::int as catalog,
  (select count(*) from public.game_catalog_entry_versions)::int as catalog_versions,
  (select count(*) from public.consumer_accounts)::int as accounts,
  (select count(*) from public.consumer_game_entitlements)::int as entitlements,
  (select count(*) from public.billing_subscriptions)::int as subscriptions,
  (select count(*) from public.content_resources)::int as resources,
  (select count(*) from auth.users)::int as auth_users,
  (select count(*) from supabase_migrations.schema_migrations)::int as history,
  (select string_agg(version || ':' || coalesce(array_length(statements,1),0), ',' order by version) from supabase_migrations.schema_migrations where version <> '${MIGRATION}') as history_digest,
  (select string_agg(stable_key || ':' || status || ':' || coalesce(display_order::text,'-') || ':' || version || ':' || lock_version, ',' order by stable_key) from public.game_catalog_entries where stable_key <> '${GAME_KEY}') as other_games`;

/**
 * Independent production identity signals:
 *  1. the vault ref is well formed and is not the staging ref;
 *  2. the session pooler authenticated user postgres.<ref> (the pooler routes by ref);
 *  3. the REST API of <ref>.supabase.co, called with the production service key,
 *     reports the same catalog and account count as the pooler database;
 *  4. the database holds the eight Grade 6 quiz resources published to
 *     PRODUCTION on 2026-09-26 (staging holds different ids).
 */
async function identify(sql) {
  const database = sql(`select (select count(*) from public.consumer_accounts)::int as accounts,
    (select string_agg(stable_key || ':' || status, ',' order by stable_key) from public.game_catalog_entries) as games,
    (select count(*) from public.content_resources where resource_type in ('quiz','quiz_pdf') and left(id::text, 8) in (${PRODUCTION_QUIZ_ID_PREFIXES.map((prefix) => `'${prefix}'`).join(",")}))::int as production_quizzes`)[0];
  const client = api();
  const accounts = await client.from("consumer_accounts").select("user_id", { count: "exact", head: true });
  const games = await client.from("game_catalog_entries").select("stable_key,status").order("stable_key");
  check(!accounts.error && !games.error, "production-api-rejected-the-vault-service-key");
  const apiGames = games.data.map((row) => `${row.stable_key}:${row.status}`).join(",");
  evidence.identity = {
    refWellFormedAndNotStaging: true,
    poolerAuthenticatedAs: `postgres.${ref}@${evidence.pooler}`,
    apiMatchesDatabase: database.accounts === accounts.count && database.games === apiGames,
    productionQuizFingerprint: `${database.production_quizzes}/${PRODUCTION_QUIZ_ID_PREFIXES.length}`,
    accounts: database.accounts,
    games: database.games
  };
  check(evidence.identity.apiMatchesDatabase, "pooler-database-and-production-api-differ");
  check(database.production_quizzes === PRODUCTION_QUIZ_ID_PREFIXES.length, "production-quiz-fingerprint-missing-refusing");
  evidence.environment = "PRODUCTION";
  evidence.stagingSelected = false;
}

function pendingPlan(sql) {
  const remote = sql("select version from supabase_migrations.schema_migrations order by version").map((row) => String(row.version));
  const local = localVersions();
  const pending = local.filter((version) => !remote.includes(version));
  const remoteOnly = remote.filter((version) => !local.includes(version));
  evidence.history = { remoteCount: remote.length, remoteTail: remote.slice(-4), localCount: local.length, pending, remoteOnly,
    ph2_07_recorded: remote.includes("20260909010000"), ph2_07_in_repository: local.includes("20260909010000") };
  return { remote, local, pending, remoteOnly };
}

const bingoObjects = (sql) => sql(`select (to_regclass('public.bingo_rooms') is not null) as bingo_rooms,
  (to_regclass('public.bingo_participants') is not null) as bingo_participants,
  (to_regclass('public.bingo_join_failures') is not null) as bingo_join_failures,
  (select count(*) from pg_proc where proname like 'bingo!_%' escape '!')::int as bingo_functions,
  exists(select 1 from public.game_catalog_entries where stable_key='${GAME_KEY}' or slug='${GAME_KEY}') as catalog_row`)[0];

async function audit() {
  const url = connect();
  const sql = sqlFor(url);
  await identify(sql);
  const plan = pendingPlan(sql);
  evidence.bingoObjects = bingoObjects(sql);
  evidence.catalogBefore = sql("select stable_key, slug, status, display_order, version, lock_version, launch_type from public.game_catalog_entries order by display_order nulls last, stable_key");
  evidence.snapshotBefore = sql(SNAPSHOT_SQL)[0];
  evidence.checks = {
    exactlyTheReleaseMigrationPending: JSON.stringify(plan.pending) === JSON.stringify([MIGRATION]),
    noRemoteOnlyMigrations: plan.remoteOnly.length === 0,
    releaseNewerThanRemoteHead: plan.remote.every((version) => version < MIGRATION),
    bingoObjectsAbsent: !evidence.bingoObjects.bingo_rooms && !evidence.bingoObjects.bingo_participants && !evidence.bingoObjects.bingo_join_failures
      && evidence.bingoObjects.bingo_functions === 0 && !evidence.bingoObjects.catalog_row
  };
  check(Object.values(evidence.checks).every(Boolean), `audit-refused:${Object.entries(evidence.checks).filter(([, value]) => !value).map(([key]) => key).join(",")}`);
  return { url, sql };
}

async function migrate() {
  const { url, sql } = await audit();
  const before = evidence.snapshotBefore;
  const workRoot = mkdtempSync(join(tmpdir(), "mathnexa-bingo-production-"));
  try {
    cpSync(resolve("supabase"), join(workRoot, "supabase"), { recursive: true });
    const dry = cli(["db", "push", "--db-url", url, "--dry-run"], workRoot);
    check(dry.ok, `dry-run-failed:${redact(dry.output).slice(-600)}`);
    const listed = [...new Set(redact(dry.output).match(/\d{14}_[a-z0-9_]+\.sql/g) ?? [])];
    evidence.dryRunWouldApply = listed;
    check(JSON.stringify(listed) === JSON.stringify([MIGRATION_FILE]), "refusing: the dry run would apply something other than the release migration");
    const pushed = cli(["db", "push", "--db-url", url], workRoot);
    evidence.pushOutput = redact(pushed.output).split("\n").map((line) => line.trim()).filter((line) => /20261103|Applying|Finished|up to date|error/i.test(line)).slice(-8);
    check(pushed.ok, `push-failed:${redact(pushed.output).slice(-800)}`);
  } finally {
    rmSync(workRoot, { recursive: true, force: true });
  }
  const after = sql(SNAPSHOT_SQL)[0];
  evidence.snapshotAfter = after;
  evidence.recorded = sql(`select version, name, coalesce(array_length(statements,1),0) as statements from supabase_migrations.schema_migrations where version='${MIGRATION}'`);
  check(evidence.recorded.length === 1 && evidence.recorded[0].statements > 0, "history-row-missing");
  check(after.history === before.history + 1 && after.history_digest === before.history_digest, "other-history-rows-changed");
  check(after.other_games === before.other_games, "existing-games-changed");
  check(after.catalog === before.catalog + 1 && after.catalog_versions === before.catalog_versions + 1, "catalog-delta-not-exactly-one-card");
  for (const key of ["accounts", "entitlements", "subscriptions", "resources", "auth_users"]) check(after[key] === before[key], `unrelated-row-count-changed:${key}`);
  evidence.unrelatedDataUnchanged = true;
  verifyApplied(sql, { expectStatus: "draft" });
}

function verifyApplied(sql, { expectStatus } = {}) {
  const recorded = sql(`select version from supabase_migrations.schema_migrations where version='${MIGRATION}'`).map((row) => String(row.version));
  evidence.releaseRecorded = recorded;
  check(JSON.stringify(recorded) === JSON.stringify([MIGRATION]), "release-migration-not-recorded");
  evidence.catalog = sql(`select stable_key, slug, title, status, version, display_order, launch_type, thumbnail_reference, recommended_grade_min, recommended_grade_max,
    publication_metadata->>'internal_route' as internal_route,
    (select count(*) from public.game_catalog_entries g where g.stable_key='${GAME_KEY}' or g.slug='${GAME_KEY}')::int as identities
    from public.game_catalog_entries where stable_key='${GAME_KEY}'`)[0];
  const allowed = expectStatus ? [expectStatus] : ["draft", "published", "archived"];
  check(allowed.includes(evidence.catalog?.status) && evidence.catalog.identities === 1 && evidence.catalog.launch_type === "internal"
    && evidence.catalog.internal_route === "/games/math-bingo-live/host", "catalog-row-wrong");
  evidence.tables = sql(`select relname, relrowsecurity, relforcerowsecurity,
    has_table_privilege('anon', oid, 'SELECT') or has_table_privilege('anon', oid, 'INSERT') or has_table_privilege('anon', oid, 'UPDATE') or has_table_privilege('anon', oid, 'DELETE') as anon_any,
    has_table_privilege('authenticated', oid, 'SELECT') or has_table_privilege('authenticated', oid, 'INSERT') or has_table_privilege('authenticated', oid, 'UPDATE') or has_table_privilege('authenticated', oid, 'DELETE') as authenticated_any,
    (select count(*) from pg_policies p where p.schemaname='public' and p.tablename=c.relname)::int as policies
    from pg_class c where relname in (${BINGO_TABLES.map((name) => `'${name}'`).join(",")}) and relnamespace='public'::regnamespace order by relname`);
  check(evidence.tables.length === BINGO_TABLES.length && evidence.tables.every((row) => row.relrowsecurity && row.relforcerowsecurity && !row.anon_any && !row.authenticated_any), "room-tables-not-locked-down");
  const functions = sql("select proname, prosecdef, has_function_privilege('anon', oid, 'EXECUTE') as anon_execute, has_function_privilege('authenticated', oid, 'EXECUTE') as authenticated_execute, has_function_privilege('service_role', oid, 'EXECUTE') as service_role_execute from pg_proc where pronamespace='public'::regnamespace and proname like 'bingo!_%' escape '!' order by proname");
  evidence.functions = functions.map((row) => row.proname);
  check(functions.length >= 10 && functions.every((row) => row.prosecdef && !row.anon_execute && !row.authenticated_execute && row.service_role_execute), "room-functions-not-locked-down");
  evidence.otherGames = sql(`select string_agg(stable_key || ':' || status, ',' order by stable_key) as games from public.game_catalog_entries where stable_key <> '${GAME_KEY}'`)[0].games;
}

async function verify() {
  const url = connect();
  const sql = sqlFor(url);
  await identify(sql);
  verifyApplied(sql);
  evidence.snapshot = sql(SNAPSHOT_SQL)[0];
}

async function smoke() {
  const client = api();
  const hash = (value) => createHash("sha256").update(value).digest("hex");
  const owner = hash(`bingo-production-release-smoke-${Date.now()}-${randomBytes(8).toString("hex")}`);
  const hostToken = hash(randomBytes(32).toString("hex"));
  const players = [hash(randomBytes(32).toString("hex")), hash(randomBytes(32).toString("hex"))];
  const subject = hash(randomBytes(16).toString("hex"));
  const settings = { mode: "addition", level: "facts-10", questionSeconds: 0, revealSeconds: 0, patterns: { rows: true, columns: true, diagonals: false }, winners: 3, freeSpace: true, music: "host", celebration: "host", equivalentFractions: false };
  const rpc = async (fn, args) => {
    const { data, error } = await client.rpc(fn, args);
    check(!error, `${fn}-failed:${redact(error?.message)}`);
    return data;
  };
  // A code no live room holds (a real class may be playing once published).
  let code = "";
  for (let attempt = 0; attempt < 20 && !code; attempt += 1) {
    const candidate = String(randomInt(100_000, 1_000_000));
    const taken = await client.from("bingo_rooms").select("id", { count: "exact", head: true }).eq("code", candidate);
    check(!taken.error, `room-code-probe-failed:${redact(taken.error?.message)}`);
    if (taken.count === 0) code = candidate;
  }
  check(code, "no-free-room-code");
  let unknown = "";
  for (let attempt = 0; attempt < 20 && !unknown; attempt += 1) {
    const candidate = String(randomInt(100_000, 1_000_000));
    if (candidate === code) continue;
    const taken = await client.from("bingo_rooms").select("id", { count: "exact", head: true }).eq("code", candidate);
    if (!taken.error && taken.count === 0) unknown = candidate;
  }
  check(unknown, "no-unused-code-for-the-unknown-code-check");
  try {
    const created = await rpc("bingo_create_room", { p_code: code, p_owner_hash: owner, p_host_token_hash: hostToken, p_settings: settings });
    const first = await rpc("bingo_join_room", { p_code: code, p_name: "Release Ava", p_token_hash: players[0], p_subject_hash: subject });
    const again = await rpc("bingo_join_room", { p_code: code, p_name: "release ava", p_token_hash: players[1], p_subject_hash: subject });
    const wrong = await rpc("bingo_join_room", { p_code: unknown, p_name: "Nobody", p_token_hash: hash(`nobody-${randomBytes(8).toString("hex")}`), p_subject_hash: subject });
    const hostView = await rpc("bingo_host_state", { p_owner_hash: owner, p_token_hash: hostToken, p_since_version: null });
    const stranger = await rpc("bingo_host_state", { p_owner_hash: hash(`someone-else-${randomBytes(8).toString("hex")}`), p_token_hash: hostToken, p_since_version: null });
    const playerView = await rpc("bingo_player_state", { p_token_hash: players[0], p_since_version: null, p_since_me: null });
    const closed = await rpc("bingo_host_command", { p_owner_hash: owner, p_token_hash: hostToken, p_command: "close", p_args: {} });
    const gone = await rpc("bingo_player_state", { p_token_hash: players[0], p_since_version: null, p_since_me: null });
    evidence.smoke = {
      created: created.result, joined: first.result, duplicateName: again.me?.name, unknownCode: wrong.result,
      hostPhase: hostView.phase, hostPatterns: hostView.settings?.patterns, strangerHost: stranger.result,
      playerPhase: playerView.phase, closed: closed.status, seatAfterClose: gone.result
    };
    check(created.result === "created" && first.result === "joined" && again.me?.name === "release ava 2" && wrong.result === "not-found"
      && hostView.phase === "LOBBY" && hostView.settings?.patterns?.diagonals === false && stranger.result === "not-found"
      && playerView.phase === "LOBBY" && closed.status === "closed" && gone.result === "not-found", "smoke-contract-failed");
    const publishable = (process.env.SUPABASE_PRODUCTION_PUBLISHABLE_KEY ?? "").trim();
    if (publishable) {
      secrets.push(publishable);
      const anon = createClient(`https://${ref}.supabase.co`, publishable, { auth: { persistSession: false } });
      const browserRead = await anon.from("bingo_rooms").select("code").limit(1);
      const browserCall = await anon.rpc("bingo_player_state", { p_token_hash: players[0], p_since_version: null, p_since_me: null });
      evidence.browserRead = browserRead.error ? "refused" : `rows:${browserRead.data?.length ?? 0}`;
      evidence.browserRpc = browserCall.error ? "refused" : "allowed";
      check((browserRead.error || (browserRead.data?.length ?? 0) === 0) && browserCall.error, "browser-identity-can-reach-rooms");
    } else {
      evidence.browserChecks = "skipped (no production publishable key in the vault); the verify stage proves anon/authenticated hold no table grants or EXECUTE";
    }
  } finally {
    await client.from("bingo_rooms").delete().eq("code", code).eq("host_token_hash", hostToken);
    await client.from("bingo_join_failures").delete().eq("subject_hash", subject);
    const leftRooms = await client.from("bingo_rooms").select("id", { count: "exact", head: true }).eq("host_token_hash", hostToken);
    const leftFailures = await client.from("bingo_join_failures").select("subject_hash", { count: "exact", head: true }).eq("subject_hash", subject);
    evidence.syntheticRowsRemaining = { rooms: leftRooms.count, joinFailures: leftFailures.count };
  }
  check(evidence.syntheticRowsRemaining.rooms === 0 && evidence.syntheticRowsRemaining.joinFailures === 0, "synthetic-rows-not-cleaned-up");
}

try {
  if (stage === "audit") await audit();
  else if (stage === "migrate") await migrate();
  else if (stage === "verify") await verify();
  else if (stage === "smoke") await smoke();
  else throw new Error("usage: --stage=audit|migrate|verify|smoke");
  evidence.result = "PASS";
} catch (error) {
  evidence.result = "FAIL";
  evidence.error = redact(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
evidence.finishedAt = new Date().toISOString();
const text = redact(JSON.stringify(evidence, null, 2));
const evidenceDir = (process.env.RELEASE_EVIDENCE_DIR ?? "").trim();
if (evidenceDir) writeFileSync(join(evidenceDir, `bingo-production-${stage}-${Date.now()}.json`), text);
process.stdout.write(`${text}\n`);
