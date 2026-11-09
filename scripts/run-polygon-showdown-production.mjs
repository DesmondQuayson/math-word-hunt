/**
 * Polygon Showdown — PRODUCTION database release (owner approved 2026-11-09,
 * after the final staging review).
 *
 * Launched by scripts/invoke-polygon-showdown-production.ps1, which loads only
 * the production project ref, the production database password and the
 * production service key from the credential vault. One stage per run:
 *
 *   --stage=audit    READ ONLY. Proves the target is production, lists the
 *                    migration history, proves what is pending is exactly the
 *                    next Polygon migration(s) in order and nothing else, and
 *                    snapshots the catalog, history and row counts.
 *   --stage=migrate  Applies ONLY the next pending Polygon migration: dry run
 *                    first (must list exactly that file), then `supabase db
 *                    push`, then checks the history, the Draft catalog row, the
 *                    tables, RLS, grants, functions, shop items and every
 *                    unrelated count. Run once per migration.
 *   --stage=verify   READ ONLY. The same checks.
 *   --stage=smoke    Service-role room contract with synthetic hashes only (no
 *                    account): create, route, join, load, a stranger's command,
 *                    close. A browser key cannot reach any of it. Deleted after.
 *   --stage=wallets  READ ONLY. Every wallet against its ledger, without identities.
 *   --stage=publish  Owner-instructed. Sets the approved description, then moves
 *                    draft to published through the functions behind Super
 *                    Admin's buttons, recording the version and audit rows.
 *   --stage=archive  Game-only rollback: moves the entry to archived the same way.
 *
 * Mirrors scripts/run-math-bingo-live-production.mjs. Reached through the IPv4
 * session pooler; the pooler user carries the production project ref. Output is
 * redacted JSON evidence; no secret reaches stdout.
 */
import { spawnSync } from "node:child_process";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

import { ITEMS } from "../apps/platform-web/public/internal-games/polygon-showdown/src/engine/catalog.js";
import { CONFIG, encodeBoard, newGameState, SCHEDULES, startingBoard } from "../apps/platform-web/public/internal-games/polygon-showdown/src/engine/game.js";

const STAGING_PROJECT_REF = "gcmuhzxkwvfireyrearl";
const MIGRATIONS = Object.freeze([
  Object.freeze({ version: "20261109100000", file: "20261109100000_polygon_showdown.sql" }),
  Object.freeze({ version: "20261109110000", file: "20261109110000_polygon_showdown_table_privileges.sql" })
]);
const VERSIONS = MIGRATIONS.map((migration) => migration.version);
const GAME_KEY = "polygon-showdown";
const APPROVED_DESCRIPTION = "Match geometric shapes, build combos, earn coins, customize your avatar, or challenge friends in a live Showdown.";
// Grade 6 quizzes published to PRODUCTION on 2026-09-26 (v1.2.13); staging holds different ids.
const PRODUCTION_QUIZ_ID_PREFIXES = Object.freeze(["83d9252f", "42215d2a", "5b8bdc39", "1d80b325", "e01a72e2", "3e25faa1", "339aa712", "7654e5e9"]);
const POOLER_HOSTS = ["aws-0-us-east-2.pooler.supabase.com", "aws-1-us-east-2.pooler.supabase.com"];
const TABLES = ["polygon_inventory", "polygon_ledger", "polygon_participants", "polygon_profiles", "polygon_rooms", "polygon_shop_items", "polygon_solo_runs", "polygon_wallets"];
const REQUIRED_FUNCTIONS = ["polygon_avatar_save", "polygon_bootstrap", "polygon_create_room", "polygon_host_command", "polygon_host_resume", "polygon_join_room", "polygon_leave", "polygon_player_commit", "polygon_player_load", "polygon_purchase", "polygon_solo_commit", "polygon_solo_load", "polygon_solo_open", "polygon_solo_start"];
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
  (select count(*) from public.bingo_rooms)::int as bingo_rooms,
  (select count(*) from supabase_migrations.schema_migrations)::int as history,
  (select string_agg(version || ':' || coalesce(array_length(statements,1),0), ',' order by version) from supabase_migrations.schema_migrations where version not in (${VERSIONS.map((version) => `'${version}'`).join(",")})) as history_digest,
  (select string_agg(stable_key || ':' || status || ':' || coalesce(display_order::text,'-') || ':' || version || ':' || lock_version, ',' order by stable_key) from public.game_catalog_entries where stable_key <> '${GAME_KEY}') as other_games`;

/**
 * Independent production identity signals: the vault ref is well formed and is
 * not staging; the pooler authenticated postgres.<ref>; the REST API with the
 * production service key reports the same catalog and account count as the
 * pooler database; the database holds the production-only Grade 6 quizzes.
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
}

function pendingPlan(sql) {
  const remote = sql("select version from supabase_migrations.schema_migrations order by version").map((row) => String(row.version));
  const local = localVersions();
  const pending = local.filter((version) => !remote.includes(version));
  const remoteOnly = remote.filter((version) => !local.includes(version));
  evidence.history = { remoteCount: remote.length, remoteTail: remote.slice(-4), localCount: local.length, pending, remoteOnly };
  return { remote, local, pending, remoteOnly };
}

const objectState = (sql) => sql(`select
  (select count(*) from information_schema.tables where table_schema='public' and table_name like 'polygon!_%' escape '!')::int as tables,
  (select count(*) from pg_proc where pronamespace in ('public'::regnamespace,'private'::regnamespace) and proname like 'polygon!_%' escape '!')::int as functions,
  (to_regprocedure('public.live_room_game_for_code(text)') is not null) as join_router,
  exists (select 1 from pg_trigger where tgname='bingo_rooms_live_code_guard') as bingo_code_guard,
  exists (select 1 from public.game_catalog_entries where stable_key='${GAME_KEY}' or slug='${GAME_KEY}') as catalog_row`)[0];

async function audit() {
  const url = connect();
  const sql = sqlFor(url);
  await identify(sql);
  const plan = pendingPlan(sql);
  evidence.objects = objectState(sql);
  evidence.catalogBefore = sql("select stable_key, slug, status, display_order, version, lock_version, launch_type from public.game_catalog_entries order by display_order nulls last, stable_key");
  evidence.snapshotBefore = sql(SNAPSHOT_SQL)[0];
  const index = MIGRATIONS.findIndex((migration) => migration.version === plan.pending[0]);
  const batch = index < 0 ? [] : MIGRATIONS.slice(index, index + plan.pending.length);
  evidence.pendingFiles = batch.map((migration) => migration.file);
  const objects = evidence.objects;
  evidence.checks = {
    pendingAreTheNextPolygonMigrationsInOrder: plan.pending.length > 0 && JSON.stringify(plan.pending) === JSON.stringify(batch.map((migration) => migration.version)),
    noRemoteOnlyMigrations: plan.remoteOnly.length === 0,
    releaseNewerThanRemoteHead: index >= 0 && plan.remote.every((version) => version < batch[0].version),
    earlierPolygonMigrationsApplied: index >= 0 && MIGRATIONS.slice(0, index).every((migration) => plan.remote.includes(migration.version)),
    objectsAsExpected: index === 0
      ? objects.tables === 0 && objects.functions === 0 && !objects.join_router && !objects.bingo_code_guard && !objects.catalog_row
      : index > 0 && objects.tables === TABLES.length && objects.join_router && objects.bingo_code_guard && objects.catalog_row
  };
  check(Object.values(evidence.checks).every(Boolean), `audit-refused:${Object.entries(evidence.checks).filter(([, value]) => !value).map(([key]) => key).join(",")}`);
  return { url, sql, batch, first: index === 0 };
}

async function migrate() {
  const { url, sql, batch, first } = await audit();
  const next = batch[0];
  evidence.applying = next.file;
  const before = evidence.snapshotBefore;
  const workRoot = mkdtempSync(join(tmpdir(), "mathnexa-polygon-production-"));
  try {
    cpSync(resolve("supabase"), join(workRoot, "supabase"), { recursive: true });
    // Only this one file is visible to the CLI, so one run can never apply two.
    for (const later of batch.slice(1)) rmSync(join(workRoot, "supabase", "migrations", later.file));
    const dry = cli(["db", "push", "--db-url", url, "--dry-run"], workRoot);
    check(dry.ok, `dry-run-failed:${redact(dry.output).slice(-600)}`);
    const listed = [...new Set(redact(dry.output).match(/\d{14}_[a-z0-9_]+\.sql/g) ?? [])];
    evidence.dryRunWouldApply = listed;
    check(JSON.stringify(listed) === JSON.stringify([next.file]), "refusing: the dry run would apply something other than this migration");
    const pushed = cli(["db", "push", "--db-url", url], workRoot);
    evidence.pushOutput = redact(pushed.output).split("\n").map((line) => line.trim()).filter((line) => /2026110|Applying|Finished|up to date|error/i.test(line)).slice(-8);
    check(pushed.ok, `push-failed:${redact(pushed.output).slice(-800)}`);
  } finally {
    rmSync(workRoot, { recursive: true, force: true });
  }
  const after = sql(SNAPSHOT_SQL)[0];
  evidence.snapshotAfter = after;
  evidence.recorded = sql(`select version, name, coalesce(array_length(statements,1),0) as statements from supabase_migrations.schema_migrations where version='${next.version}'`);
  check(evidence.recorded.length === 1 && evidence.recorded[0].statements > 0, "history-row-missing");
  check(after.history === before.history + 1 && after.history_digest === before.history_digest, "other-history-rows-changed");
  check(after.other_games === before.other_games, "existing-games-changed");
  if (first) check(after.catalog === before.catalog + 1 && after.catalog_versions === before.catalog_versions + 1, "catalog-delta-not-exactly-one-card");
  else check(after.catalog === before.catalog && after.catalog_versions === before.catalog_versions, "catalog-changed-by-a-privileges-migration");
  for (const key of ["accounts", "entitlements", "subscriptions", "resources", "auth_users"]) check(after[key] === before[key], `unrelated-row-count-changed:${key}`);
  evidence.unrelatedDataUnchanged = true;
  verifyApplied(sql, { expectStatus: "draft" });
}

function verifyApplied(sql, { expectStatus } = {}) {
  const recorded = sql(`select version from supabase_migrations.schema_migrations where version in (${VERSIONS.map((version) => `'${version}'`).join(",")}) order by version`).map((row) => String(row.version));
  evidence.releaseRecorded = recorded;
  check(recorded.length > 0 && JSON.stringify(recorded) === JSON.stringify(VERSIONS.slice(0, recorded.length)), "polygon-migrations-not-recorded-in-order");

  evidence.tables = sql(`select relname, relrowsecurity, relforcerowsecurity,
      has_table_privilege('anon', oid, 'SELECT') or has_table_privilege('anon', oid, 'INSERT') or has_table_privilege('anon', oid, 'UPDATE') or has_table_privilege('anon', oid, 'DELETE') as anon_any,
      has_table_privilege('authenticated', oid, 'SELECT') or has_table_privilege('authenticated', oid, 'INSERT') or has_table_privilege('authenticated', oid, 'UPDATE') or has_table_privilege('authenticated', oid, 'DELETE') as authenticated_any
    from pg_class where relnamespace='public'::regnamespace and relname in (${TABLES.map((name) => `'${name}'`).join(",")}) order by relname`);
  check(evidence.tables.length === TABLES.length && evidence.tables.every((row) => row.relrowsecurity && row.relforcerowsecurity && !row.anon_any && !row.authenticated_any), "polygon-tables-not-locked-down");

  const functions = sql(`select proname, prosecdef, has_function_privilege('anon', oid, 'EXECUTE') as anon_execute, has_function_privilege('authenticated', oid, 'EXECUTE') as browser_execute, has_function_privilege('service_role', oid, 'EXECUTE') as server_execute
    from pg_proc where pronamespace='public'::regnamespace and proname like 'polygon!_%' escape '!' order by proname`);
  evidence.functions = functions.map((row) => row.proname);
  check(REQUIRED_FUNCTIONS.every((name) => evidence.functions.includes(name)), "polygon-function-missing");
  check(functions.every((row) => row.prosecdef && !row.anon_execute && !row.browser_execute && row.server_execute), "polygon-functions-not-locked-down");
  evidence.privateHelpers = sql(`select count(*)::int as helpers, count(*) filter (where has_function_privilege('anon', oid, 'EXECUTE') or has_function_privilege('authenticated', oid, 'EXECUTE'))::int as browser_callable from pg_proc where pronamespace='private'::regnamespace and proname like 'polygon!_%' escape '!'`)[0];
  check(evidence.privateHelpers.helpers > 0 && evidence.privateHelpers.browser_callable === 0, "polygon-private-helpers-open");

  const shop = sql("select count(*)::int as items, count(*) filter (where price = 0)::int as free, sum(price)::int as total, md5(string_agg(item_key || ':' || price || ':' || slot || ':' || tier, ',' order by item_key)) as digest from public.polygon_shop_items")[0];
  const expected = ITEMS.slice().sort((a, b) => (a.id < b.id ? -1 : 1));
  const local = createHash("md5").update(expected.map((item) => `${item.id}:${item.price}:${item.slot}:${item.tier}`).join(",")).digest("hex");
  evidence.shop = { items: shop.items, free: shop.free, total: shop.total, matchesGameCatalog: shop.digest === local };
  check(shop.items === 153 && shop.digest === local, "polygon-shop-catalog-differs-from-the-game");

  evidence.rows = sql(`select (select count(*) from public.polygon_wallets)::int as wallets, (select count(*) from public.polygon_ledger)::int as ledger, (select count(*) from public.polygon_inventory)::int as inventory, (select count(*) from public.polygon_profiles)::int as profiles, (select count(*) from public.polygon_solo_runs)::int as solo_runs, (select count(*) from public.polygon_rooms)::int as rooms, (select count(*) from public.polygon_participants)::int as participants`)[0];

  evidence.joinRouting = sql(`select (to_regprocedure('public.live_room_game_for_code(text)') is not null) as join_router,
      exists (select 1 from pg_trigger where tgname='bingo_rooms_live_code_guard') as bingo_code_guard,
      has_function_privilege('anon','public.live_room_game_for_code(text)','EXECUTE') or has_function_privilege('authenticated','public.live_room_game_for_code(text)','EXECUTE') as router_browser_execute,
      has_function_privilege('anon','public.bingo_join_room(text,text,text,text,text)','EXECUTE') as bingo_join_browser_execute,
      (to_regprocedure('public.bingo_host_state(text,text,bigint,bigint)') is not null) as bingo_host_state`)[0];
  check(evidence.joinRouting.join_router && evidence.joinRouting.bingo_code_guard && !evidence.joinRouting.router_browser_execute && !evidence.joinRouting.bingo_join_browser_execute && evidence.joinRouting.bingo_host_state, "shared-join-routing-missing-or-open");

  if (recorded.includes(VERSIONS[1])) {
    evidence.ledgerPrivileges = sql(`select has_table_privilege('service_role','public.polygon_ledger','SELECT') as can_read, has_table_privilege('service_role','public.polygon_ledger','INSERT') as can_add, has_table_privilege('service_role','public.polygon_ledger','UPDATE') as can_update, has_table_privilege('service_role','public.polygon_ledger','DELETE') as can_delete, has_table_privilege('service_role','public.polygon_ledger','TRUNCATE') as can_truncate`)[0];
    const ledger = evidence.ledgerPrivileges;
    check(ledger.can_read && ledger.can_add && !ledger.can_update && !ledger.can_delete && !ledger.can_truncate, "polygon-ledger-not-append-only");
    const sequence = sql("select has_sequence_privilege('anon','public.polygon_ledger_id_seq','select,usage,update') as anon_sequence, has_sequence_privilege('authenticated','public.polygon_ledger_id_seq','select,usage,update') as browser_sequence")[0];
    check(!sequence.anon_sequence && !sequence.browser_sequence, "ledger-sequence-open-to-browsers");
  }

  evidence.catalog = sql(`select stable_key, slug, title, description, status, version, display_order, launch_type, thumbnail_reference, publication_metadata->>'internal_route' as internal_route, publication_metadata->>'category' as category,
    (select count(*) from public.game_catalog_entries g where g.stable_key='${GAME_KEY}' or g.slug='${GAME_KEY}')::int as identities
    from public.game_catalog_entries where stable_key='${GAME_KEY}'`)[0];
  const allowed = expectStatus ? [expectStatus] : ["draft", "published", "archived"];
  check(allowed.includes(evidence.catalog?.status) && evidence.catalog.identities === 1 && evidence.catalog.launch_type === "internal" && evidence.catalog.internal_route === "/games/polygon-showdown/play" && evidence.catalog.category === "Geometry", "catalog-row-wrong");
  evidence.otherGames = sql(`select string_agg(stable_key || ':' || status, ',' order by stable_key) as games from public.game_catalog_entries where stable_key <> '${GAME_KEY}'`)[0].games;
}

async function verify() {
  const url = connect();
  const sql = sqlFor(url);
  await identify(sql);
  verifyApplied(sql);
  evidence.snapshot = sql(SNAPSHOT_SQL)[0];
}

/** The same database functions Super Admin's buttons call, so the version and audit rows are recorded. */
async function transition(target) {
  const url = connect();
  const sql = sqlFor(url);
  await identify(sql);
  verifyApplied(sql);
  check(evidence.releaseRecorded.length === VERSIONS.length, "refusing: not every Polygon migration is applied");
  const before = sql(SNAPSHOT_SQL)[0];
  const row = sql(`select id, status, lock_version, slug, title, description, thumbnail_reference, recommended_grade_min, recommended_grade_max, skills, topics, tags, difficulty, display_order from public.game_catalog_entries where stable_key='${GAME_KEY}'`)[0];
  const allowedFrom = target === "published" ? ["draft", "maintenance"] : ["draft", "published", "maintenance"];
  check(row && allowedFrom.includes(row.status), `refusing: catalog status is ${row?.status}, cannot move to ${target}`);
  const admins = sql("select id from public.admin_users where revoked_at is null and mfa_enrolled");
  check(admins.length === 1, `refusing: expected exactly one active MFA-enrolled admin, found ${admins.length}`);
  const actor = String(admins[0].id);
  secrets.push(actor);
  let lock = Number(row.lock_version);
  const client = api();
  let versionRows = 1;
  if (target === "published" && row.description !== APPROVED_DESCRIPTION) {
    const updated = await client.rpc("update_game_catalog_entry", {
      p_actor_admin_id: actor, p_catalog_entry_id: row.id, p_expected_lock_version: lock, p_slug: row.slug, p_title: row.title, p_description: APPROVED_DESCRIPTION,
      p_thumbnail_reference: row.thumbnail_reference, p_recommended_grade_min: row.recommended_grade_min, p_recommended_grade_max: row.recommended_grade_max,
      p_skills: row.skills, p_topics: row.topics, p_tags: row.tags, p_difficulty: row.difficulty, p_display_order: row.display_order
    });
    check(!updated.error, `description-update-failed:${redact(updated.error?.message)}`);
    check(Number(updated.data) === lock + 1, "lock-version-not-advanced-by-the-update");
    lock = Number(updated.data);
    versionRows = 2;
    evidence.descriptionUpdated = true;
  }
  evidence.transition = { from: row.status, to: target, lockBefore: lock, actor: "the only active admin (owner)" };
  const { data, error } = await client.rpc("transition_game_catalog_entry", { p_actor_admin_id: actor, p_catalog_entry_id: row.id, p_expected_lock_version: lock, p_status: target });
  check(!error, `transition-failed:${redact(error?.message)}`);
  evidence.transition.lockAfter = Number(data);
  const after = sql(SNAPSHOT_SQL)[0];
  evidence.snapshotBefore = before;
  evidence.snapshotAfter = after;
  check(Number(data) === lock + 1, "lock-version-not-advanced-by-one");
  check(after.catalog === before.catalog && after.catalog_versions === before.catalog_versions + versionRows, "catalog-version-history-not-as-expected");
  check(after.other_games === before.other_games && after.history_digest === before.history_digest && after.history === before.history, "other-games-or-history-changed");
  for (const key of ["accounts", "entitlements", "subscriptions", "resources", "auth_users"]) check(after[key] === before[key], `unrelated-row-count-changed:${key}`);
  const action = target === "published" ? "admin.game.publish" : "admin.game.archive";
  evidence.audit = sql(`select action, created_at, metadata->>'status' as status from public.admin_audit_log where target='${row.id}' and action='${action}' and created_at > now() - interval '10 minutes' order by created_at desc limit 1`)[0] ?? null;
  check(evidence.audit?.status === target, "admin-audit-event-missing");
  verifyApplied(sql, { expectStatus: target });
}

/** Read only. Every wallet against its ledger, with no identities: an account is a short hash. */
async function wallets() {
  const url = connect();
  const sql = sqlFor(url);
  await identify(sql);
  evidence.accounts = sql(`select left(md5(w.user_id::text), 8) as account, w.balance, w.lifetime_earned,
      (select coalesce(sum(l.amount), 0)::int from public.polygon_ledger l where l.user_id = w.user_id) as ledger_sum,
      (select count(*)::int from public.polygon_ledger l where l.user_id = w.user_id and l.event = 'EARN_SOLO') as solo_earnings,
      (select count(*)::int from public.polygon_ledger l where l.user_id = w.user_id and l.event = 'EARN_SHOWDOWN') as showdown_earnings,
      (select count(*)::int from public.polygon_ledger l where l.user_id = w.user_id and l.event = 'PURCHASE_ITEM') as purchases,
      (select count(*)::int from public.polygon_inventory i where i.user_id = w.user_id) as owned,
      (select count(*)::int from public.polygon_solo_runs r where r.user_id = w.user_id) as runs
    from public.polygon_wallets w order by w.updated_at desc limit 20`);
  evidence.duplicateKeys = sql("select count(*)::int as duplicates from (select user_id, idempotency_key from public.polygon_ledger group by 1, 2 having count(*) > 1) d")[0].duplicates;
  evidence.rooms = sql("select count(*)::int as rooms, count(*) filter (where status = 'open')::int as open from public.polygon_rooms")[0];
  check(evidence.accounts.every((row) => Number(row.balance) === Number(row.ledger_sum)), "a-wallet-disagrees-with-its-ledger");
  check(evidence.duplicateKeys === 0, "duplicate-ledger-key");
}

async function smoke() {
  const client = api();
  const hash = (value) => createHash("sha256").update(value).digest("hex");
  const owner = hash(`polygon-production-smoke-${randomBytes(8).toString("hex")}`);
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
    const seat = await rpc("polygon_player_load", { p_token_hash: playerToken });
    const stranger = await rpc("polygon_host_command", { p_owner_hash: hash("someone-else"), p_token_hash: hostToken, p_command: "lock", p_args: {} });
    const closed = await rpc("polygon_host_command", { p_owner_hash: owner, p_token_hash: hostToken, p_command: "close", p_args: {} });
    const gone = await rpc("polygon_player_load", { p_token_hash: playerToken });
    evidence.smoke = { created: created.result, routedTo: routed, joined: ava.result, seatPhase: seat.phase, strangerCommand: stranger.result, closed: closed.result ?? closed.status, seatAfterClose: gone.result };
    check(created.result === "created" && routed === "polygon_showdown" && ava.result === "joined" && seat.phase === "LOBBY" && stranger.result === "not-found" && gone.result !== "ok", "smoke-contract-failed");
    const publishable = (process.env.SUPABASE_PRODUCTION_PUBLISHABLE_KEY ?? "").trim();
    if (publishable) {
      secrets.push(publishable);
      const anon = createClient(`https://${ref}.supabase.co`, publishable, { auth: { persistSession: false } });
      const browser = {};
      for (const table of TABLES) {
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
    await client.from("bingo_join_failures").delete().eq("subject_hash", subject);
  }
  const left = await client.from("polygon_rooms").select("id", { count: "exact", head: true }).eq("code", code);
  evidence.smokeRoomsLeft = left.count ?? null;
  check(left.count === 0, "smoke-room-not-removed");
}

try {
  if (stage === "audit") await audit();
  else if (stage === "migrate") await migrate();
  else if (stage === "verify") await verify();
  else if (stage === "smoke") await smoke();
  else if (stage === "wallets") await wallets();
  else if (stage === "publish") await transition("published");
  else if (stage === "archive") await transition("archived");
  else throw new Error("usage: --stage=audit|migrate|verify|smoke|wallets|publish|archive");
  evidence.result = "PASS";
  console.log(redact(JSON.stringify(evidence, null, 2)));
} catch (error) {
  evidence.result = "FAIL";
  evidence.error = redact(error instanceof Error ? error.message : String(error));
  console.log(redact(JSON.stringify(evidence, null, 2)));
  process.exitCode = 1;
}
