/**
 * Phase 2B two-hour Super Admin session — STAGING database stages for
 * migration 20260930100000_admin_two_hour_session.sql.
 *
 * Launched by scripts/invoke-admin-session-staging.ps1 (staging database
 * password and staging service key only).
 *
 *   --stage=audit     READ ONLY. Pooler database == staging API; the old 30-minute
 *                     ceiling and three-reason end rule exist exactly once; the
 *                     new columns and functions are absent; before-state counts.
 *   --stage=apply     OWNER-APPROVED (ADMIN_SESSION_OWNER_APPROVED=yes). Applies
 *                     ONLY this migration as one DO statement that also writes its
 *                     history row (staging holds the remote-only PH2-07 row, so
 *                     `db push` refuses), then proves no account, billing,
 *                     entitlement, operation, audit or admin row changed.
 *   --stage=verify    READ ONLY post-apply schema, privilege and history checks.
 *   --stage=contract  The session contract on the hosted database with synthetic
 *                     identities inside ONE DO statement that always raises, so
 *                     every row it wrote is rolled back.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

const STAGING_PROJECT_REF = "gcmuhzxkwvfireyrearl";
const RELEASE = "20260930100000";
const RELEASE_NAME = "admin_two_hour_session";
const RELEASE_STATEMENTS = 27;
const POOLER_HOSTS = ["aws-0-us-east-2.pooler.supabase.com", "aws-1-us-east-2.pooler.supabase.com"];
const NEW_FUNCTIONS = ["public.touch_admin_session(text)", "public.record_admin_step_up(uuid,uuid,text,text)", "public.begin_admin_account_operation(uuid,uuid,uuid,text,text,text)"];
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
  const value = (process.env[name] ?? "").trim();
  check(pattern.test(value), `missing-or-malformed-${name}`);
  secrets.push(value, encodeURIComponent(value));
  return value;
}
for (const name of Object.keys(process.env)) {
  check(!/_LIVE_|_PRODUCTION_|_READONLY_|^STRIPE_/.test(name), `refusing: ${name} is present in this process`);
}

function cli(commandArgs) {
  const result = spawnSync(process.execPath, [supabaseCli, ...commandArgs, "--yes"], {
    encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1" }
  });
  return { ok: result.status === 0, output: `${result.stdout ?? ""}\n${result.stderr ?? ""}` };
}
function parseRows(output) {
  const starts = [output.indexOf("["), output.indexOf("{")].filter((index) => index !== -1);
  check(starts.length > 0, `query-output-unreadable:${redact(output).slice(-300)}`);
  const parsed = JSON.parse(output.slice(Math.min(...starts), Math.max(output.lastIndexOf("]"), output.lastIndexOf("}")) + 1));
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
function sqlFor(url) {
  return (query) => {
    const result = cli(["db", "query", "--db-url", url, "-o", "json", query]);
    check(result.ok, `query-failed:${redact(result.output).slice(-400)}`);
    return parseRows(result.output);
  };
}
function runFile(url, program, prefix) {
  const workRoot = mkdtempSync(join(tmpdir(), prefix));
  try {
    const file = join(workRoot, "program.sql");
    writeFileSync(file, program);
    return cli(["db", "query", "--db-url", url, "--file", file]);
  } finally {
    rmSync(workRoot, { recursive: true, force: true });
  }
}

const SNAPSHOT_SQL = `select
  (select count(*) from public.consumer_accounts)::int as accounts,
  (select count(*) from public.consumer_game_entitlements)::int as entitlements,
  (select count(*) from public.billing_customers)::int as billing_customers,
  (select count(*) from public.billing_subscriptions)::int as subscriptions,
  (select count(*) from public.billing_webhook_events)::int as webhook_events,
  (select count(*) from public.admin_account_operations)::int as operations,
  (select count(*) from public.admin_audit_log)::int as audit_rows,
  (select count(*) from public.admin_users)::int as admin_users,
  (select count(*) from public.admin_sessions)::int as admin_sessions,
  (select count(*) from public.admin_sessions where ended_at is null and revoked_at is null)::int as live_admin_sessions,
  (select count(*) from auth.users)::int as auth_users,
  (select count(*) from supabase_migrations.schema_migrations)::int as history,
  (select string_agg(version || ':' || coalesce(array_length(statements,1),0), ',' order by version) from supabase_migrations.schema_migrations where version <> '${RELEASE}') as history_digest,
  (select md5(coalesce(string_agg(id::text || admin_user_id::text || started_at::text || expires_at::text || coalesce(ended_at::text,'') || coalesce(end_reason,''), ',' order by id), '')) from public.admin_sessions) as sessions_digest,
  (select md5(coalesce(string_agg(id::text || operation || operation_state, ',' order by id), '')) from public.admin_account_operations) as operations_digest`;
const UNCHANGED_KEYS = ["accounts", "entitlements", "billing_customers", "subscriptions", "webhook_events", "operations", "audit_rows", "admin_users", "admin_sessions", "live_admin_sessions", "auth_users", "sessions_digest", "operations_digest"];

async function identify(sql) {
  const secretKey = required("SUPABASE_SECRET_KEY", /^.{20,}$/);
  const database = sql("select (select count(*) from public.consumer_accounts)::int as accounts, (select string_agg(stable_key || ':' || status, ',' order by stable_key) from public.game_catalog_entries) as games")[0];
  const api = createClient(`https://${STAGING_PROJECT_REF}.supabase.co`, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const accounts = await api.from("consumer_accounts").select("user_id", { count: "exact", head: true });
  const games = await api.from("game_catalog_entries").select("stable_key,status").order("stable_key");
  check(!accounts.error && !games.error, "staging-api-rejected-vault-secret-key");
  evidence.sameProject = database.accounts === accounts.count && database.games === games.data.map((row) => `${row.stable_key}:${row.status}`).join(",");
  check(evidence.sameProject, "pooler-database-and-staging-api-differ");
  evidence.environment = "STAGING";
}

function readShape(sql) {
  return sql(`select
    (select count(*) from pg_constraint where conrelid='public.admin_sessions'::regclass and contype='c' and pg_get_constraintdef(oid) like '%''00:30:00''::interval%')::int as thirty_minute_rules,
    (select count(*) from pg_constraint where conrelid='public.admin_sessions'::regclass and contype='c' and pg_get_constraintdef(oid) like '%''signed-out''::text%')::int as end_reason_rules,
    (select count(*) from pg_constraint where conrelid='public.admin_sessions'::regclass and conname in ('admin_sessions_absolute_lifetime_check','admin_sessions_activity_window_check','admin_sessions_step_up_window_check') and convalidated)::int as new_rules,
    (select pg_get_constraintdef(oid) like '%''idle-expired''::text%' from pg_constraint where conrelid='public.admin_sessions'::regclass and conname='admin_sessions_end_reason_check') as idle_reason,
    (select count(*) from information_schema.columns where table_schema='public' and table_name='admin_sessions' and column_name in ('last_activity_at','step_up_at') and is_nullable='NO')::int as new_columns,
    (select count(*) from pg_trigger where tgrelid='public.admin_sessions'::regclass and tgname='admin_sessions_default_activity')::int as trigger,
    ${NEW_FUNCTIONS.map((signature, index) => `(to_regprocedure('${signature}') is not null) as function_${index}`).join(",\n    ")}`)[0];
}

/** Same splitter as run-math-tug-of-war-staging.mjs; proven against CLI-written history rows before use. */
function splitStatements(source) {
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

async function audit() {
  const url = connect();
  const sql = sqlFor(url);
  await identify(sql);
  evidence.shapeBefore = readShape(sql);
  const remote = sql("select version from supabase_migrations.schema_migrations order by version").map((row) => String(row.version));
  evidence.history = { remoteCount: remote.length, remoteTail: remote.slice(-3), releaseRecorded: remote.includes(RELEASE), ph2_07Recorded: remote.includes("20260909010000") };
  evidence.snapshotBefore = sql(SNAPSHOT_SQL)[0];
  evidence.readyToApply = !evidence.history.releaseRecorded && evidence.shapeBefore.thirty_minute_rules === 1 && evidence.shapeBefore.end_reason_rules === 1 &&
    evidence.shapeBefore.new_columns === 0 && NEW_FUNCTIONS.every((_, index) => evidence.shapeBefore[`function_${index}`] === false);
  return { url, sql, remote };
}

function verifyApplied(sql) {
  evidence.recorded = sql(`select version, name, coalesce(array_length(statements,1),0) as statements from supabase_migrations.schema_migrations where version='${RELEASE}'`)[0] ?? null;
  check(evidence.recorded?.name === RELEASE_NAME && evidence.recorded.statements === RELEASE_STATEMENTS, "migration-not-recorded");
  evidence.shapeAfter = readShape(sql);
  const shape = evidence.shapeAfter;
  check(shape.thirty_minute_rules === 0 && shape.new_rules === 3 && shape.idle_reason === true && shape.new_columns === 2 && shape.trigger === 1, "session-schema-wrong");
  check(NEW_FUNCTIONS.every((_, index) => shape[`function_${index}`] === true), "session-functions-missing");
  evidence.privileges = sql(`select signature,
      has_function_privilege('anon', signature, 'EXECUTE') as anon,
      has_function_privilege('authenticated', signature, 'EXECUTE') as authenticated,
      has_function_privilege('service_role', signature, 'EXECUTE') as service_role,
      (select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid = signature::regprocedure) as definer_pinned
    from (values ${NEW_FUNCTIONS.map((signature) => `('${signature}')`).join(",")}) functions(signature) order by signature`);
  check(evidence.privileges.every((row) => !row.anon && !row.authenticated && row.service_role && row.definer_pinned), "session-function-privileges-wrong");
  evidence.serviceRoleCannotUpdateSessions = sql("select not has_table_privilege('service_role','public.admin_sessions','UPDATE') as ok")[0].ok;
  check(evidence.serviceRoleCannotUpdateSessions, "service-role-can-update-sessions");
}

async function apply() {
  check(process.env.ADMIN_SESSION_OWNER_APPROVED === "yes", "refusing: apply needs ADMIN_SESSION_OWNER_APPROVED=yes (owner approval in chat)");
  const { url, sql, remote } = await audit();
  check(evidence.readyToApply, "refusing: staging is not in the expected pre-migration shape");
  check(remote.every((version) => version < RELEASE), "refusing: staging history holds a version newer than this migration");
  const before = evidence.snapshotBefore;

  for (const [version, file] of [["20260907130000", "20260907130000_subscription_lifecycle_reconciliation.sql"], ["20260816050000", "20260816050000_crosscalc_v2_public_release.sql"]]) {
    const storedRaw = sql(`select statements from supabase_migrations.schema_migrations where version='${version}'`)[0].statements;
    const stored = version === "20260816050000" ? storedRaw.map((statement) => statement.replace(/\r\n/g, "\n")) : storedRaw;
    check(JSON.stringify(stored) === JSON.stringify(splitStatements(readFileSync(resolve(`supabase/migrations/${file}`), "utf8"))), `statement-split-differs-from-cli:${version}`);
  }
  evidence.splitterMatchesCliHistory = true;

  const statements = splitStatements(readFileSync(resolve(`supabase/migrations/${RELEASE}_${RELEASE_NAME}.sql`), "utf8"));
  check(statements.length === RELEASE_STATEMENTS, `unexpected-statement-count:${statements.length}`);
  check(!statements.some((statement) => statement.includes("$sessstmt$") || statement.includes("$sessapply$")), "quote-tag-collision");
  const literal = `array[${statements.map((statement) => `$sessstmt$${statement}$sessstmt$`).join(",")}]::text[]`;
  const program = [
    "do $sessapply$",
    "begin",
    ...statements.map((statement) => `  execute $sessstmt$${statement}$sessstmt$;`),
    `  insert into supabase_migrations.schema_migrations(version, name, statements) values ('${RELEASE}', '${RELEASE_NAME}', ${literal});`,
    "end",
    "$sessapply$"
  ].join("\n");
  const applied = runFile(url, program, "mathnexa-admin-session-apply-");
  check(applied.ok, `apply-failed-rolled-back:${redact(applied.output).slice(-600)}`);

  verifyApplied(sql);
  const after = sql(SNAPSHOT_SQL)[0];
  evidence.snapshotAfter = after;
  check(after.history === before.history + 1 && after.history_digest === before.history_digest, "other-history-rows-changed");
  for (const key of UNCHANGED_KEYS) check(after[key] === before[key], `unrelated-data-changed:${key}`);
  evidence.unrelatedDataUnchanged = true;
}

async function verify() {
  const url = connect();
  const sql = sqlFor(url);
  await identify(sql);
  verifyApplied(sql);
  evidence.snapshot = sql(SNAPSHOT_SQL)[0];
}

const CONTRACT_SQL = String.raw`do $contract$
declare
  v_owner uuid := gen_random_uuid();
  v_target uuid := gen_random_uuid();
  v_admin uuid := gen_random_uuid();
  v_run text := replace(gen_random_uuid()::text, '-', '');
  v_started uuid;
  v_stale uuid := gen_random_uuid();
  v_idle uuid := gen_random_uuid();
  v_old uuid := gen_random_uuid();
  v_throttled uuid := gen_random_uuid();
  v_first record;
  v_second record;
  r jsonb := '{}'::jsonb;
begin
  insert into auth.users(id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data) values
    (v_owner, 'authenticated', 'authenticated', 'session-contract-owner-' || v_run || '@example.invalid', 'x', now(), '{}'),
    (v_target, 'authenticated', 'authenticated', 'session-contract-account-' || v_run || '@example.invalid', 'x', now(), '{}');
  insert into public.consumer_accounts(user_id, account_status, email_confirmed_at) values (v_target, 'active', now()) on conflict (user_id) do nothing;
  insert into public.admin_users(id, user_id, role, mfa_enrolled) values (v_admin, v_owner, 'owner', true);

  v_started := public.start_admin_session(v_admin, md5(v_run || 'a') || md5(v_run || 'b'), statement_timestamp() + interval '120 minutes 30 seconds', null, 'contract');
  r := r || jsonb_build_object(
    'startedLifetimeSeconds', (select extract(epoch from expires_at - started_at)::int from public.admin_sessions where id = v_started),
    'startDefaultsFromMfa', (select last_activity_at = started_at and step_up_at = started_at from public.admin_sessions where id = v_started));
  begin
    perform public.start_admin_session(v_admin, md5(v_run || 'c') || md5(v_run || 'd'), statement_timestamp() + interval '122 minutes', null, 'contract');
    r := r || jsonb_build_object('over120Rejected', false);
  exception when raise_exception then
    r := r || jsonb_build_object('over120Rejected', sqlerrm = 'Invalid admin session expiry');
  end;

  insert into public.admin_sessions(id, admin_user_id, token_hash, assurance_level, started_at, expires_at, last_activity_at) values
    (v_stale, v_admin, md5(v_run || 'e') || md5(v_run || 'f'), 'aal2', now() - interval '30 minutes', now() + interval '90 minutes', now() - interval '2 minutes'),
    (v_idle, v_admin, md5(v_run || 'g') || md5(v_run || 'h'), 'aal2', now() - interval '90 minutes', now() + interval '30 minutes', now() - interval '61 minutes'),
    (v_old, v_admin, md5(v_run || 'i') || md5(v_run || 'j'), 'aal2', now() - interval '100 minutes', now() + interval '20 minutes', now() - interval '5 minutes'),
    (v_throttled, v_admin, md5(v_run || 'k') || md5(v_run || 'l'), 'aal2', now() - interval '10 minutes', now() + interval '110 minutes', now() - interval '30 seconds');

  begin
    perform private.require_admin_account_session(v_admin, v_old, false);
    r := r || jsonb_build_object('hundredMinuteSessionValid', true);
  exception when insufficient_privilege then r := r || jsonb_build_object('hundredMinuteSessionValid', false);
  end;
  begin
    perform private.require_admin_account_session(v_admin, v_idle, false);
    r := r || jsonb_build_object('idleSessionRefused', false);
  exception when insufficient_privilege then r := r || jsonb_build_object('idleSessionRefused', true);
  end;

  r := r || jsonb_build_object(
    'touchThrottled', not public.touch_admin_session(md5(v_run || 'k') || md5(v_run || 'l')),
    'touchRefreshes', public.touch_admin_session(md5(v_run || 'e') || md5(v_run || 'f')),
    'touchCannotReviveIdle', not public.touch_admin_session(md5(v_run || 'g') || md5(v_run || 'h')));
  r := r || jsonb_build_object('touchKeepsAbsolute', (select expires_at = started_at + interval '120 minutes' from public.admin_sessions where id = v_stale));

  begin
    perform private.require_admin_account_session(v_admin, v_stale, true);
    r := r || jsonb_build_object('staleStepUpRefused', false);
  exception when insufficient_privilege then r := r || jsonb_build_object('staleStepUpRefused', sqlerrm = 'Fresh owner reauthentication required');
  end;
  perform public.record_admin_step_up(v_admin, v_stale, null, 'contract');
  begin
    perform private.require_admin_account_session(v_admin, v_stale, true);
    r := r || jsonb_build_object('stepUpAccepted', true);
  exception when insufficient_privilege then r := r || jsonb_build_object('stepUpAccepted', false);
  end;
  begin
    perform public.record_admin_step_up(v_admin, v_idle, null, 'contract');
    r := r || jsonb_build_object('idleStepUpRefused', false);
  exception when insufficient_privilege then r := r || jsonb_build_object('idleStepUpRefused', true);
  end;

  select * into v_first from public.begin_admin_account_operation(v_admin, v_stale, v_target, 'sync-billing', 'contract:begin:' || v_run, null);
  select * into v_second from public.begin_admin_account_operation(v_admin, v_stale, v_target, 'sync-billing', 'contract:begin:' || v_run, null);
  r := r || jsonb_build_object('firstCreated', v_first.created, 'duplicateSuppressed', not v_second.created and v_second.operation_id = v_first.operation_id,
    'duplicateAudited', (select count(*) = 1 from public.admin_audit_log where action = 'admin.account.operation.duplicate-suppressed' and target = v_target::text));

  perform public.end_admin_session(md5(v_run || 'g') || md5(v_run || 'h'), 'idle-expired', null, 'contract');
  r := r || jsonb_build_object('idleEndAudited', (select metadata->>'reason' = 'idle-expired' from public.admin_audit_log where action = 'admin.session.ended' and target = v_idle::text));

  raise exception 'session-contract-result:%', r::text;
end
$contract$`;

function extractContractResult(output) {
  const marker = "session-contract-result:";
  const at = output.indexOf(marker);
  if (at === -1) return null;
  const tail = output.slice(at + marker.length);
  for (const text of [tail, tail.replace(/\\(["\\])/g, "$1")]) {
    const start = text.indexOf("{");
    if (start === -1) continue;
    let depth = 0;
    let quoted = false;
    for (let index = start; index < text.length; index += 1) {
      const character = text[index];
      if (quoted) {
        if (character === "\\") index += 1;
        else if (character === "\"") quoted = false;
      } else if (character === "\"") quoted = true;
      else if (character === "{") depth += 1;
      else if (character === "}" && (depth -= 1) === 0) {
        try { return JSON.parse(text.slice(start, index + 1)); } catch { break; }
      }
    }
  }
  return null;
}

async function contract() {
  const url = connect();
  const sql = sqlFor(url);
  await identify(sql);
  verifyApplied(sql);
  const before = sql(SNAPSHOT_SQL)[0];
  const ran = runFile(url, CONTRACT_SQL, "mathnexa-admin-session-contract-");
  const result = extractContractResult(ran.output);
  check(!ran.ok && result, `contract-did-not-complete:${redact(ran.output).slice(-600)}`);
  evidence.contract = result;
  const after = sql(SNAPSHOT_SQL)[0];
  for (const key of [...UNCHANGED_KEYS, "history", "history_digest"]) check(after[key] === before[key], `contract-left-residue:${key}`);
  evidence.contractRolledBack = true;
  check(result.startedLifetimeSeconds === 7200 && result.startDefaultsFromMfa === true && result.over120Rejected === true, "absolute-lifetime-contract-failed");
  for (const key of ["hundredMinuteSessionValid", "idleSessionRefused", "touchThrottled", "touchRefreshes", "touchCannotReviveIdle", "touchKeepsAbsolute",
    "staleStepUpRefused", "stepUpAccepted", "idleStepUpRefused", "firstCreated", "duplicateSuppressed", "duplicateAudited", "idleEndAudited"]) {
    check(result[key] === true, `session-contract-failed:${key}`);
  }
}

try {
  if (stage === "audit") await audit();
  else if (stage === "apply") await apply();
  else if (stage === "verify") await verify();
  else if (stage === "contract") await contract();
  else throw new Error("usage: --stage=audit|apply|verify|contract");
  evidence.result = "PASS";
} catch (error) {
  evidence.result = "FAIL";
  evidence.error = redact(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
evidence.finishedAt = new Date().toISOString();
process.stdout.write(`${redact(JSON.stringify(evidence, null, 2))}\n`);
