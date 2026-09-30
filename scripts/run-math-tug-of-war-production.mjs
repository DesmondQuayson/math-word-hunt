/**
 * Math Tug of War — PRODUCTION database release (owner-approved 2026-09-27).
 *
 * Launched by scripts/invoke-math-tug-of-war-production.ps1, which loads only
 * the production project ref, the production database password and the
 * production service key from the credential vault. One stage per run:
 *
 *   --stage=audit    READ ONLY. Proves the target is production with several
 *                    independent signals, lists the migration history, proves
 *                    that exactly 20260927100000 and 20260928100000 are
 *                    pending (nothing else, no remote-only versions), that no
 *                    Math Tug of War object exists yet, and snapshots the
 *                    catalog, history and row counts as the rollback baseline.
 *   --stage=migrate  Re-runs every audit check, dry-runs `supabase db push`
 *                    (must list exactly the two files), applies them with the
 *                    CLI (which records each history row itself), then checks
 *                    the history, the catalog and every unrelated row count.
 *   --stage=verify   Tables, RLS, grants, functions, the ±7 bound, the winner
 *                    rule (leave-after-win fix) and the catalog row.
 *   --stage=smoke    Service-role room lifecycle on production with synthetic
 *                    hashes: create, join, pull, replay, wrong answer, full
 *                    room, 6 pulls no win, 7th pull wins, leave after the win,
 *                    expiry. Every synthetic row is deleted afterwards.
 *
 * The database is reached through the IPv4 session pooler; the pooler user
 * carries the production project ref. Output is redacted JSON evidence.
 */
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { cpSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

const STAGING_PROJECT_REF = "gcmuhzxkwvfireyrearl";
const RELEASE = Object.freeze(["20260927100000", "20260928100000"]);
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
  check(!/^MVH_STAGING|^STAGING_|_STAGING$|^SUPABASE_DB_PASSWORD$|^VERCEL_AUTOMATION_BYPASS_SECRET$/.test(name), `refusing: staging variable ${name} is present in this process`);
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
  (select string_agg(version || ':' || coalesce(array_length(statements,1),0), ',' order by version) from supabase_migrations.schema_migrations where version not in ('20260927100000','20260928100000')) as history_digest,
  (select string_agg(stable_key || ':' || status || ':' || coalesce(display_order::text,'-') || ':' || version || ':' || lock_version, ',' order by stable_key) from public.game_catalog_entries where stable_key <> 'math-tug-of-war') as other_games`;

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

async function audit() {
  const url = connect();
  const sql = sqlFor(url);
  await identify(sql);
  const plan = pendingPlan(sql);
  evidence.tugObjects = sql(`select (to_regclass('public.tug_rooms') is not null) as tug_rooms,
    (to_regclass('public.tug_join_failures') is not null) as tug_join_failures,
    (select count(*) from pg_proc where proname like 'tug!_%' escape '!')::int as tug_functions,
    exists(select 1 from public.game_catalog_entries where stable_key='math-tug-of-war' or slug='math-tug-of-war') as catalog_row`)[0];
  evidence.catalogBefore = sql("select stable_key, slug, status, display_order, version, lock_version, launch_type from public.game_catalog_entries order by display_order nulls last, stable_key");
  evidence.snapshotBefore = sql(SNAPSHOT_SQL)[0];
  evidence.checks = {
    exactlyTheTwoReleaseMigrationsPending: JSON.stringify(plan.pending) === JSON.stringify(RELEASE),
    noRemoteOnlyMigrations: plan.remoteOnly.length === 0,
    releaseNewerThanRemoteHead: plan.remote.every((version) => version < RELEASE[0]),
    tugObjectsAbsent: !evidence.tugObjects.tug_rooms && !evidence.tugObjects.tug_join_failures && evidence.tugObjects.tug_functions === 0 && !evidence.tugObjects.catalog_row
  };
  check(Object.values(evidence.checks).every(Boolean), `audit-refused:${Object.entries(evidence.checks).filter(([, value]) => !value).map(([key]) => key).join(",")}`);
  return { url, sql };
}

async function migrate() {
  const { url, sql } = await audit();
  const before = evidence.snapshotBefore;
  const workRoot = mkdtempSync(join(tmpdir(), "mathnexa-tug-production-"));
  try {
    cpSync(resolve("supabase"), join(workRoot, "supabase"), { recursive: true });
    const dry = cli(["db", "push", "--db-url", url, "--dry-run"], workRoot);
    check(dry.ok, `dry-run-failed:${redact(dry.output).slice(-600)}`);
    const listed = [...new Set(redact(dry.output).match(/\d{14}_[a-z0-9_]+\.sql/g) ?? [])];
    evidence.dryRunWouldApply = listed;
    check(JSON.stringify(listed) === JSON.stringify(["20260927100000_math_tug_of_war.sql", "20260928100000_math_tug_of_war_seven_pulls.sql"]), "refusing: the dry run would apply something other than the two release migrations");
    const pushed = cli(["db", "push", "--db-url", url], workRoot);
    evidence.pushOutput = redact(pushed.output).split("\n").map((line) => line.trim()).filter((line) => /2026092|Applying|Finished|up to date|error/i.test(line)).slice(-8);
    check(pushed.ok, `push-failed:${redact(pushed.output).slice(-800)}`);
  } finally {
    rmSync(workRoot, { recursive: true, force: true });
  }
  const after = sql(SNAPSHOT_SQL)[0];
  evidence.snapshotAfter = after;
  evidence.recorded = sql("select version, name, coalesce(array_length(statements,1),0) as statements from supabase_migrations.schema_migrations where version in ('20260927100000','20260928100000') order by version");
  check(evidence.recorded.length === 2 && evidence.recorded.every((row) => row.statements > 0), "history-rows-missing");
  check(after.history === before.history + 2 && after.history_digest === before.history_digest, "other-history-rows-changed");
  check(after.other_games === before.other_games, "existing-games-changed");
  check(after.catalog === before.catalog + 1 && after.catalog_versions === before.catalog_versions + 1, "catalog-delta-not-exactly-one-card");
  for (const key of ["accounts", "entitlements", "subscriptions", "resources", "auth_users"]) check(after[key] === before[key], `unrelated-row-count-changed:${key}`);
  evidence.unrelatedDataUnchanged = true;
  verifyApplied(sql);
}

function verifyApplied(sql) {
  const recorded = sql("select version from supabase_migrations.schema_migrations where version in ('20260927100000','20260928100000') order by version").map((row) => String(row.version));
  evidence.releaseRecorded = recorded;
  check(JSON.stringify(recorded) === JSON.stringify(RELEASE), "release-migrations-not-both-recorded");
  evidence.catalog = sql("select stable_key, slug, title, status, version, display_order, launch_type, thumbnail_reference, (select count(*) from public.game_catalog_entries g where g.stable_key='math-tug-of-war' or g.slug='math-tug-of-war')::int as identities from public.game_catalog_entries where stable_key='math-tug-of-war'")[0];
  check(evidence.catalog?.status === "published" && evidence.catalog.identities === 1 && evidence.catalog.launch_type === "internal", "catalog-row-wrong");
  evidence.tables = sql(`select relname, relrowsecurity, relforcerowsecurity,
    has_table_privilege('anon', oid, 'SELECT') or has_table_privilege('anon', oid, 'INSERT') or has_table_privilege('anon', oid, 'UPDATE') or has_table_privilege('anon', oid, 'DELETE') as anon_any,
    has_table_privilege('authenticated', oid, 'SELECT') or has_table_privilege('authenticated', oid, 'INSERT') or has_table_privilege('authenticated', oid, 'UPDATE') or has_table_privilege('authenticated', oid, 'DELETE') as authenticated_any,
    (select count(*) from pg_policies p where p.schemaname='public' and p.tablename=c.relname)::int as policies
    from pg_class c where relname in ('tug_rooms','tug_join_failures') and relnamespace='public'::regnamespace order by relname`);
  check(evidence.tables.length === 2 && evidence.tables.every((row) => row.relrowsecurity && row.relforcerowsecurity && !row.anon_any && !row.authenticated_any), "room-tables-not-locked-down");
  evidence.functions = sql("select proname, prosecdef, has_function_privilege('anon', oid, 'EXECUTE') as anon_execute, has_function_privilege('authenticated', oid, 'EXECUTE') as authenticated_execute, has_function_privilege('service_role', oid, 'EXECUTE') as service_role_execute from pg_proc where pronamespace='public'::regnamespace and proname like 'tug!_%' escape '!' order by proname");
  check(evidence.functions.length === 6 && evidence.functions.every((row) => row.prosecdef && !row.anon_execute && !row.authenticated_execute && row.service_role_execute), "room-functions-not-locked-down");
  evidence.constraints = sql("select conname, pg_get_constraintdef(oid) as definition from pg_constraint where conrelid='public.tug_rooms'::regclass and contype='c' order by conname");
  const position = evidence.constraints.find((row) => row.conname === "tug_rooms_position_check")?.definition ?? "";
  check(/-7/.test(position) && /<= 7/.test(position), "position-bound-not-seven");
  check(evidence.constraints.some((row) => row.conname === "tug_rooms_winner_state_check"), "winner-state-rule-missing");
  check(!evidence.constraints.some((row) => /\(status = 'won'::text\) = \(winner IS NOT NULL\)/.test(row.definition)), "old-winner-rule-still-present");
  const submit = sql("select pg_get_functiondef('public.tug_submit_answer(text,text,integer,integer,boolean)'::regprocedure) as body")[0].body;
  evidence.submitUsesSeven = submit.includes("greatest(-7, least(7,") && submit.includes("next_position<=-7") && !submit.includes("least(5,");
  check(evidence.submitUsesSeven, "submit-function-not-seven");
  evidence.otherGames = sql("select string_agg(stable_key || ':' || status, ',' order by stable_key) as games from public.game_catalog_entries where stable_key <> 'math-tug-of-war'")[0].games;
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
  const owner = hash(`production-release-smoke-${Date.now()}-${randomBytes(8).toString("hex")}`);
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const newCode = () => Array.from(randomBytes(5), (byte) => alphabet[byte % alphabet.length]).join("");
  const opened = [];
  const rpc = async (fn, args) => {
    const { data, error } = await client.rpc(fn, args);
    check(!error, `${fn}-failed:${redact(error?.message)}`);
    return data;
  };
  const room = async (skill) => {
    const host = hash(randomBytes(32).toString("hex"));
    const guest = hash(randomBytes(32).toString("hex"));
    const code = newCode();
    opened.push({ code, host });
    const created = await rpc("tug_create_room", { p_code: code, p_skill: skill, p_seed: randomBytes(16).toString("hex"), p_host_name: "Release Smoke", p_host_token_hash: host, p_owner_hash: owner });
    const joined = await rpc("tug_join_room", { p_code: code, p_guest_name: "Release Guest", p_guest_token_hash: guest, p_owner_hash: owner });
    return { code, host, guest, created, joined };
  };
  try {
    const a = await room("integers");
    const pull = await rpc("tug_submit_answer", { p_code: a.code, p_token_hash: a.host, p_round: 1, p_question_index: 0, p_correct: true });
    const replay = await rpc("tug_submit_answer", { p_code: a.code, p_token_hash: a.host, p_round: 1, p_question_index: 0, p_correct: true });
    const wrong = await rpc("tug_submit_answer", { p_code: a.code, p_token_hash: a.guest, p_round: 1, p_question_index: 0, p_correct: false });
    const back = await rpc("tug_submit_answer", { p_code: a.code, p_token_hash: a.guest, p_round: 1, p_question_index: 1, p_correct: true });
    const full = await rpc("tug_join_room", { p_code: a.code, p_guest_name: "Third", p_guest_token_hash: hash(randomBytes(16).toString("hex")), p_owner_hash: owner });
    const left = await rpc("tug_leave_room", { p_code: a.code, p_token_hash: a.guest });
    evidence.lifecycle = { created: a.created.result, joined: a.joined.result, firstPull: pull.position, replay: replay.result, wrongAnswerPosition: wrong.position, opponentPullPosition: back.position, full: full.result, left: left.status };
    check(a.created.result === "created" && a.joined.result === "joined" && pull.position === -1 && replay.result === "stale" && wrong.position === -1 && back.position === 0 && full.result === "full" && left.status === "closed", "lifecycle-contract-failed");

    // Seven net pulls: six do not win, the seventh does; then the loser leaves the won room.
    const b = await room("absolute");
    const positions = [];
    let state = null;
    for (let index = 0; index < 7; index += 1) {
      state = await rpc("tug_submit_answer", { p_code: b.code, p_token_hash: b.host, p_round: 1, p_question_index: index, p_correct: true });
      positions.push(`${state.position}:${state.status}`);
    }
    const leaveAfterWin = await rpc("tug_leave_room", { p_code: b.code, p_token_hash: b.guest });
    const winnerView = await rpc("tug_room_state", { p_code: b.code, p_token_hash: b.host });
    evidence.sevenPulls = { positions, winner: state.winner, leaveAfterWin: leaveAfterWin.status, winnerSees: winnerView.status, closedBy: winnerView.closedBy };
    check(positions.slice(0, 6).every((entry) => entry.endsWith(":playing")) && positions[5] === "-6:playing" && positions[6] === "-7:won" && state.winner === "turquoise", "seven-pull-rule-failed");
    check(leaveAfterWin.status === "closed" && winnerView.status === "closed" && winnerView.closedBy === "pink", "leave-after-win-failed");

    // An expired waiting room cannot be joined.
    const expiredCode = newCode();
    const expiredHost = hash(randomBytes(32).toString("hex"));
    opened.push({ code: expiredCode, host: expiredHost });
    const made = await rpc("tug_create_room", { p_code: expiredCode, p_skill: "addition", p_seed: randomBytes(16).toString("hex"), p_host_name: "Release Expired", p_host_token_hash: expiredHost, p_owner_hash: owner });
    check(made.result === "created", "expired-room-setup-failed");
    const aged = await client.from("tug_rooms").update({ expires_at: new Date(Date.now() - 1_000).toISOString() }).eq("code", expiredCode).eq("host_token_hash", expiredHost);
    check(!aged.error, "expired-room-ageing-failed");
    const late = await rpc("tug_join_room", { p_code: expiredCode, p_guest_name: "Late", p_guest_token_hash: hash(randomBytes(16).toString("hex")), p_owner_hash: owner });
    evidence.expiredJoin = late.result;
    check(late.result === "expired", "expired-room-contract-failed");
  } finally {
    for (const { code, host } of opened) await client.from("tug_rooms").delete().eq("code", code).eq("host_token_hash", host);
    await client.from("tug_join_failures").delete().eq("owner_hash", owner);
    const leftover = await client.from("tug_rooms").select("id", { count: "exact", head: true }).in("host_token_hash", opened.map((entry) => entry.host));
    evidence.syntheticRoomsRemaining = leftover.count;
  }
  check(evidence.syntheticRoomsRemaining === 0, "synthetic-rooms-not-cleaned-up");
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
if (evidenceDir) writeFileSync(join(evidenceDir, `tug-production-${stage}-${Date.now()}.json`), text);
process.stdout.write(`${text}\n`);
