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
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

const STAGING_PROJECT_REF = "gcmuhzxkwvfireyrearl";
const MIGRATION = "20260927100000";
// Migrations the owner-approved apply stage may apply (one per run, in order).
const APPLICABLE = Object.freeze({
  "20260927100000": { name: "math_tug_of_war", requires: null, catalogDelta: 1 },
  "20260928100000": { name: "math_tug_of_war_seven_pulls", requires: "20260927100000", catalogDelta: 0 }
});
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
    const pinkPull = await rpc("tug_submit_answer", { p_code: code, p_token_hash: guest, p_round: 1, p_question_index: 1, p_correct: true });
    const pinkReplay = await rpc("tug_submit_answer", { p_code: code, p_token_hash: guest, p_round: 1, p_question_index: 1, p_correct: true });
    const full = await rpc("tug_join_room", { p_code: code, p_guest_name: "Third", p_guest_token_hash: hash("third"), p_owner_hash: owner });
    const left = await rpc("tug_leave_room", { p_code: code, p_token_hash: guest });
    evidence.smoke = {
      code: /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/.test(created.code) ? "5-character" : "BAD",
      created: created.result, joined: joined.result, playerAPullPosition: pull.position, replay: replay.result,
      wrongPosition: wrong.position, playerBPullPosition: pinkPull.position, playerBReplay: pinkReplay.result,
      pulls: pinkReplay.pulls, full: full.result, left: left.status
    };
    check(created.result === "created" && joined.result === "joined" && pull.position === -1 && replay.result === "stale"
      && wrong.position === -1 && pinkPull.position === 0 && pinkReplay.result === "stale"
      && pinkReplay.pulls.turquoise === 1 && pinkReplay.pulls.pink === 1 && full.result === "full" && left.status === "closed", "smoke-contract-failed");
    // Expiry: an expired waiting room cannot be joined.
    const expiredCode = code.split("").reverse().join("");
    const expiredHost = hash(randomBytes(32).toString("hex"));
    try {
      const made = await rpc("tug_create_room", { p_code: expiredCode, p_skill: "addition", p_seed: randomBytes(16).toString("hex"), p_host_name: "Smoke Expired", p_host_token_hash: expiredHost, p_owner_hash: owner });
      check(made.result === "created", "expired-room-setup-failed");
      const aged = await client.from("tug_rooms").update({ expires_at: new Date(Date.now() - 1_000).toISOString() }).eq("code", expiredCode).eq("host_token_hash", expiredHost);
      check(!aged.error, "expired-room-ageing-failed");
      const late = await rpc("tug_join_room", { p_code: expiredCode, p_guest_name: "Late", p_guest_token_hash: hash("late"), p_owner_hash: owner });
      const hostView = await rpc("tug_room_state", { p_code: expiredCode, p_token_hash: expiredHost });
      evidence.smoke.expiredJoin = late.result;
      evidence.smoke.expiredStatus = hostView.status;
      check(late.result === "expired" && hostView.status === "expired", "expired-room-contract-failed");
    } finally {
      await client.from("tug_rooms").delete().eq("code", expiredCode).eq("host_token_hash", expiredHost);
    }
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

/**
 * Read-only: prove the pooler database (vault DB password) and the staging API
 * (vault staging secret key) are the same project, and show the migration
 * history format the apply stage must follow.
 */
async function identify() {
  const url = connect();
  const secretKey = required("SUPABASE_SECRET_KEY", /^.{20,}$/);
  const sql = (query) => {
    const result = cli(["db", "query", "--db-url", url, "-o", "json", query]);
    check(result.ok, `query-failed:${redact(result.output).slice(-400)}`);
    return parseRows(result.output);
  };
  const database = sql("select (select count(*) from public.consumer_accounts)::int as accounts, (select count(*) from public.game_catalog_entries)::int as catalog, (select string_agg(stable_key || ':' || status, ',' order by stable_key) from public.game_catalog_entries) as games, (select max(created_at)::text from public.game_catalog_entry_versions) as latest_catalog_version")[0];
  const api = createClient(`https://${STAGING_PROJECT_REF}.supabase.co`, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const accounts = await api.from("consumer_accounts").select("user_id", { count: "exact", head: true });
  const games = await api.from("game_catalog_entries").select("stable_key,status").order("stable_key");
  check(!accounts.error && !games.error, "staging-api-rejected-vault-secret-key");
  evidence.databaseFingerprint = database;
  evidence.apiFingerprint = { accounts: accounts.count, games: games.data.map((row) => `${row.stable_key}:${row.status}`).join(",") };
  evidence.sameProject = database.accounts === accounts.count && database.games === evidence.apiFingerprint.games;
  check(evidence.sameProject, "pooler-database-and-staging-api-differ");
  evidence.historyColumns = sql("select column_name, data_type from information_schema.columns where table_schema='supabase_migrations' and table_name='schema_migrations' order by ordinal_position");
  evidence.historyTail = sql("select version, name, coalesce(array_length(statements, 1), 0) as statement_count from supabase_migrations.schema_migrations order by version desc limit 4");
  evidence.tugObjectsPresent = sql("select (to_regclass('public.tug_rooms') is not null) as tug_rooms, exists(select 1 from public.game_catalog_entries where stable_key='math-tug-of-war') as catalog_row")[0];
}

/**
 * Split a migration file into statements the way the Supabase CLI records
 * them in supabase_migrations.schema_migrations.statements. The apply stage
 * proves this against rows the CLI itself wrote before using it.
 */
export function splitStatements(source) {
  const statements = [];
  let current = "";
  let index = 0;
  while (index < source.length) {
    const rest = source.slice(index);
    const dollar = /^\$[A-Za-z_]*\$/.exec(rest);
    if (source[index] === "-" && source[index + 1] === "-") {
      const end = source.indexOf("\n", index);
      const stop = end === -1 ? source.length : end + 1;
      current += source.slice(index, stop);
      index = stop;
    } else if (source[index] === "/" && source[index + 1] === "*") {
      const end = source.indexOf("*/", index + 2);
      const stop = end === -1 ? source.length : end + 2;
      current += source.slice(index, stop);
      index = stop;
    } else if (source[index] === "'") {
      let stop = index + 1;
      while (stop < source.length && !(source[stop] === "'" && source[stop + 1] !== "'")) stop += source[stop] === "'" ? 2 : 1;
      current += source.slice(index, stop + 1);
      index = stop + 1;
    } else if (dollar) {
      const tag = dollar[0];
      const end = source.indexOf(tag, index + tag.length);
      const stop = end === -1 ? source.length : end + tag.length;
      current += source.slice(index, stop);
      index = stop;
    } else if (source[index] === ";") {
      // The CLI records each statement without its terminating semicolon.
      statements.push(current);
      current = "";
      index += 1;
    } else {
      current += source[index];
      index += 1;
    }
  }
  if (current.trim()) statements.push(current);
  return statements.map((statement) => statement.trim()).filter((statement) => statement.replace(/--.*$/gm, "").trim() !== "");
}

/** Owner-approved: apply ONLY 20260927100000 in one transaction and record it. */
async function apply() {
  const url = connect();
  const secretKey = required("SUPABASE_SECRET_KEY", /^.{20,}$/);
  const sql = (query) => {
    const result = cli(["db", "query", "--db-url", url, "-o", "json", query]);
    check(result.ok, `query-failed:${redact(result.output).slice(-400)}`);
    return parseRows(result.output);
  };
  // Same-project proof (pooler database == staging API), as in identify.
  const api = createClient(`https://${STAGING_PROJECT_REF}.supabase.co`, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const apiGames = await api.from("game_catalog_entries").select("stable_key,status").order("stable_key");
  check(!apiGames.error, "staging-api-rejected-vault-secret-key");
  const dbGames = sql("select string_agg(stable_key || ':' || status, ',' order by stable_key) as games from public.game_catalog_entries")[0].games;
  check(dbGames === apiGames.data.map((row) => `${row.stable_key}:${row.status}`).join(","), "pooler-database-and-staging-api-differ");
  // Games other than Math Tug of War must be identical before and after.
  const dbGamesOther = sql("select string_agg(stable_key || ':' || status, ',' order by stable_key) as games from public.game_catalog_entries where stable_key <> 'math-tug-of-war'")[0].games;

  const remote = sql("select version from supabase_migrations.schema_migrations order by version").map((row) => String(row.version));
  if (stage === "verify") {
    const target = process.env.APPLY_MIGRATION || MIGRATION;
    check(remote.includes(target), `${target} is not recorded`);
    evidence.recorded = sql(`select version, name, array_length(statements,1) as statements from supabase_migrations.schema_migrations where version='${target}'`)[0];
    verifyApplied(sql, target, null);
    return;
  }
  const target = process.env.APPLY_MIGRATION || MIGRATION;
  const plan = APPLICABLE[target];
  check(plan, `refusing: ${target} is not an applicable Math Tug of War migration`);
  evidence.migration = `${target}_${plan.name}`;
  check(!remote.includes(target), `refusing: ${target} is already recorded`);
  check(!plan.requires || remote.includes(plan.requires), `refusing: ${plan.requires} must be applied first`);
  const before = sql("select (select count(*) from public.game_catalog_entries)::int as catalog, (select count(*) from public.consumer_accounts)::int as accounts, (select count(*) from public.consumer_game_entitlements)::int as entitlements, (select count(*) from supabase_migrations.schema_migrations)::int as history, (select string_agg(version || ':' || coalesce(array_length(statements,1),0), ',' order by version) from supabase_migrations.schema_migrations) as history_digest")[0];

  // The splitter must reproduce what the CLI recorded for earlier migrations.
  for (const [version, file] of [["20260907130000", "20260907130000_subscription_lifecycle_reconciliation.sql"], ["20260816050000", "20260816050000_crosscalc_v2_public_release.sql"]]) {
    // 20260816050000 was pushed from a CRLF checkout; line endings are the
    // only allowed difference there. 20260907130000 must match byte for byte.
    const storedRaw = sql(`select statements from supabase_migrations.schema_migrations where version='${version}'`)[0].statements;
    const stored = version === "20260816050000" ? storedRaw.map((statement) => statement.replace(/\r\n/g, "\n")) : storedRaw;
    const ours = splitStatements(readFileSync(resolve(`supabase/migrations/${file}`), "utf8"));
    if (JSON.stringify(stored) !== JSON.stringify(ours)) {
      const at = stored.findIndex((statement, position) => statement !== ours[position]);
      const a = stored[at] ?? "";
      const b = ours[at] ?? "";
      let char = 0;
      while (char < a.length && a[char] === b[char]) char += 1;
      evidence.splitDiff = { version, statement: at, char, storedLength: a.length, oursLength: b.length,
        stored: JSON.stringify(a.slice(Math.max(0, char - 40), char + 40)), ours: JSON.stringify(b.slice(Math.max(0, char - 40), char + 40)),
        storedHead: JSON.stringify(a.slice(0, 60)), storedTail: JSON.stringify(a.slice(-40)), oursHead: JSON.stringify(b.slice(0, 60)), oursTail: JSON.stringify(b.slice(-40)) };
      throw new Error(`statement-split-differs-from-cli:${version}:${stored.length}/${ours.length}`);
    }
  }
  evidence.splitterMatchesCliHistory = true;

  const body = readFileSync(resolve(`supabase/migrations/${target}_${plan.name}.sql`), "utf8");
  const statements = splitStatements(body);
  check(!statements.some((statement) => statement.includes("$tugstmt$") || statement.includes("$tugapply$")), "quote-tag-collision");
  const literal = `array[${statements.map((statement) => `$tugstmt$${statement}$tugstmt$`).join(",")}]::text[]`;
  // `db query` runs exactly one command, so the migration runs as ONE DO
  // statement: every recorded statement executes in order, then the history
  // row is written. Any error aborts the whole statement (nothing persists).
  const program = [
    "do $tugapply$",
    "begin",
    ...statements.map((statement) => `  execute $tugstmt$${statement}$tugstmt$;`),
    `  insert into supabase_migrations.schema_migrations(version, name, statements) values ('${target}', '${plan.name}', ${literal});`,
    "end",
    "$tugapply$"
  ].join("\n");
  const workRoot = mkdtempSync(join(tmpdir(), "mathnexa-tug-apply-"));
  try {
    const file = join(workRoot, "apply.sql");
    writeFileSync(file, program);
    const applied = cli(["db", "query", "--db-url", url, "--file", file]);
    check(applied.ok, `apply-failed-rolled-back:${redact(applied.output).slice(-600)}`);
  } finally {
    rmSync(workRoot, { recursive: true, force: true });
  }

  const after = sql(`select (select count(*) from public.game_catalog_entries)::int as catalog, (select count(*) from public.consumer_accounts)::int as accounts, (select count(*) from public.consumer_game_entitlements)::int as entitlements, (select count(*) from supabase_migrations.schema_migrations)::int as history, (select string_agg(version || ':' || coalesce(array_length(statements,1),0), ',' order by version) from supabase_migrations.schema_migrations where version <> '${target}') as history_digest`)[0];
  evidence.statementsRecorded = statements.length;
  evidence.recorded = sql(`select version, name, array_length(statements,1) as statements from supabase_migrations.schema_migrations where version='${target}'`)[0];
  check(evidence.recorded?.statements === statements.length, "history-row-missing-or-wrong");
  check(after.history === before.history + 1 && after.history_digest === before.history_digest, "other-history-rows-changed");
  check(after.accounts === before.accounts && after.entitlements === before.entitlements && after.catalog === before.catalog + plan.catalogDelta, "unrelated-rows-changed");
  evidence.otherHistoryUnchanged = true;
  verifyApplied(sql, target, dbGamesOther);
}

/** Post-apply database checks (also runnable alone as --stage=verify). */
function verifyApplied(sql, target, expectedOtherGames) {
  evidence.ph2_07 = sql("select version, name, array_length(statements,1) as statements from supabase_migrations.schema_migrations where version='20260909010000'")[0];
  evidence.catalog = sql("select stable_key, slug, status, version, display_order, thumbnail_reference, (select count(*) from public.game_catalog_entries g where g.stable_key='math-tug-of-war' or g.slug='math-tug-of-war')::int as identities from public.game_catalog_entries where stable_key='math-tug-of-war'")[0];
  check(evidence.catalog?.status === "published" && evidence.catalog.identities === 1, "catalog-row-wrong");
  evidence.otherGames = sql("select string_agg(stable_key || ':' || status, ',' order by stable_key) as games from public.game_catalog_entries where stable_key <> 'math-tug-of-war'")[0].games;
  if (expectedOtherGames !== null) check(evidence.otherGames === expectedOtherGames, "existing-games-changed");
  evidence.tables = sql("select relname, relrowsecurity, relforcerowsecurity, has_table_privilege('anon', oid, 'INSERT') as anon_insert, has_table_privilege('authenticated', oid, 'UPDATE') as authenticated_update, has_table_privilege('authenticated', oid, 'SELECT') as authenticated_select, (select count(*) from pg_policies p where p.tablename=c.relname)::int as policies from pg_class c where relname in ('tug_rooms','tug_join_failures') and relnamespace='public'::regnamespace order by relname");
  check(evidence.tables.length === 2 && evidence.tables.every((row) => row.relrowsecurity && row.relforcerowsecurity && !row.anon_insert && !row.authenticated_update && !row.authenticated_select), "room-tables-not-locked-down");
  evidence.indexes = sql("select indexname from pg_indexes where schemaname='public' and tablename in ('tug_rooms','tug_join_failures') order by indexname").map((row) => row.indexname);
  evidence.functions = sql("select proname, prosecdef, has_function_privilege('anon', oid, 'EXECUTE') as anon_execute, has_function_privilege('authenticated', oid, 'EXECUTE') as authenticated_execute, has_function_privilege('service_role', oid, 'EXECUTE') as service_role_execute from pg_proc where pronamespace='public'::regnamespace and proname like 'tug!_%' escape '!' order by proname");
  check(evidence.functions.length === 6 && evidence.functions.every((row) => row.prosecdef && !row.anon_execute && !row.authenticated_execute && row.service_role_execute), "room-functions-not-locked-down");
  if (target === "20260928100000") {
    evidence.constraints = sql("select conname, pg_get_constraintdef(oid) as definition from pg_constraint where conrelid='public.tug_rooms'::regclass and conname in ('tug_rooms_position_check','tug_rooms_winner_state_check','tug_rooms_check') order by conname");
    const position = evidence.constraints.find((row) => row.conname === "tug_rooms_position_check")?.definition ?? "";
    check(/-7/.test(position) && /<= 7/.test(position), "position-bound-not-seven");
    check(evidence.constraints.some((row) => row.conname === "tug_rooms_winner_state_check"), "winner-state-rule-missing");
    check(!evidence.constraints.some((row) => row.conname === "tug_rooms_check"), "old-winner-rule-still-present");
    const submit = sql("select pg_get_functiondef('public.tug_submit_answer(text,text,integer,integer,boolean)'::regprocedure) as body")[0].body;
    // plpgsql bodies are stored verbatim, so the source text is checked directly.
    evidence.submitUsesSeven = submit.includes("greatest(-7, least(7,") && submit.includes("next_position<=-7") && !submit.includes("least(5,");
    check(evidence.submitUsesSeven, "submit-function-not-seven");
  }
}

try {
  if (stage === "identify") await identify();
  else if (stage === "apply" || stage === "verify") await apply();
  else if (stage === "migrate") await migrate();
  else if (stage === "smoke") await smoke();
  else throw new Error("usage: --stage=identify|apply|verify|migrate|smoke");
  evidence.result = "PASS";
} catch (error) {
  evidence.result = "FAIL";
  evidence.error = redact(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
process.stdout.write(`${redact(JSON.stringify(evidence, null, 2))}\n`);
