/**
 * Super Admin "Sync with Stripe" CHECK fix — STAGING database stages.
 *
 * Launched by scripts/invoke-admin-sync-billing-staging.ps1, which loads only
 * the staging database password and staging service key from the vault.
 *
 *   --stage=audit     READ ONLY. Pooler database == staging API, live operation
 *                     CHECK vs prepare allow-list, migration plan, before-state
 *                     counts, and whether any Stripe-linked consumer exists.
 *   --stage=apply     OWNER-APPROVED. Applies ONLY 20260929100000 as one DO
 *                     statement that also writes its history row (staging holds
 *                     the remote-only PH2-07 row 20260909010000, so `db push`
 *                     refuses; this is the method used for the Tug migrations).
 *                     Then proves no other history, account, billing,
 *                     entitlement, webhook or operation row changed.
 *   --stage=verify    READ ONLY post-apply checks.
 *   --stage=contract  The database half of Sync with Stripe (prepare, repeat,
 *                     finish, audit) plus the CHECK and authorization contract,
 *                     with synthetic identities inside ONE DO statement that
 *                     always ends by raising, so every row it wrote is rolled
 *                     back. Stripe is never contacted.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

const STAGING_PROJECT_REF = "gcmuhzxkwvfireyrearl";
const RELEASE = "20260929100000";
const RELEASE_NAME = "admin_sync_billing_operation";
const EARLIER_OPERATIONS = Object.freeze([
  "resend-confirmation", "revoke-sessions", "suspend", "restore", "open-portal",
  "cancel-at-period-end", "submit-refund-review", "deny-refund-review",
  "grant-complimentary", "remove-complimentary", "emergency-revoke"
]);
const POOLER_HOSTS = ["aws-0-us-east-2.pooler.supabase.com", "aws-1-us-east-2.pooler.supabase.com"];
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
  (select count(*) from public.consumer_complimentary_entitlements)::int as complimentary,
  (select count(*) from public.billing_customers)::int as billing_customers,
  (select count(*) from public.billing_subscriptions)::int as subscriptions,
  (select count(*) from public.billing_webhook_events)::int as webhook_events,
  (select count(*) from public.admin_account_operations)::int as operations,
  (select count(*) from public.admin_audit_log)::int as audit_rows,
  (select count(*) from public.admin_users)::int as admin_users,
  (select count(*) from auth.users)::int as auth_users,
  (select count(*) from supabase_migrations.schema_migrations)::int as history,
  (select string_agg(version || ':' || coalesce(array_length(statements,1),0), ',' order by version) from supabase_migrations.schema_migrations where version <> '${RELEASE}') as history_digest,
  (select md5(coalesce(string_agg(id::text || operation || operation_state, ',' order by id), '')) from public.admin_account_operations) as operations_digest`;
const UNCHANGED_KEYS = ["accounts", "entitlements", "complimentary", "billing_customers", "subscriptions", "webhook_events", "operations", "audit_rows", "admin_users", "auth_users", "operations_digest"];

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

function readRule(sql) {
  const constraints = sql(`select conname, convalidated, pg_get_constraintdef(oid) as definition from pg_constraint
    where conrelid='public.admin_account_operations'::regclass and contype='c' and pg_get_constraintdef(oid) like '%operation = ANY%' order by conname`);
  const prepare = sql("select pg_get_functiondef('public.prepare_admin_account_operation(uuid,uuid,uuid,text,text,text)'::regprocedure) as body")[0].body;
  const allowList = /if p_operation not in \(([^)]*)\)/.exec(prepare)?.[1] ?? "";
  const listed = (text) => [...text.matchAll(/'([a-z-]+)'/g)].map((match) => match[1]);
  const checkValues = constraints.length === 1 ? listed(constraints[0].definition) : [];
  return {
    constraintNames: constraints.map((row) => row.conname),
    constraintValidated: constraints[0]?.convalidated ?? null,
    checkValues,
    checkAcceptsSyncBilling: checkValues.includes("sync-billing"),
    prepareAcceptsSyncBilling: listed(allowList).includes("sync-billing"),
    checkKeepsEarlierValues: EARLIER_OPERATIONS.every((value) => checkValues.includes(value))
  };
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
  evidence.ruleBefore = readRule(sql);
  evidence.findingConfirmed = evidence.ruleBefore.prepareAcceptsSyncBilling && !evidence.ruleBefore.checkAcceptsSyncBilling;
  const remote = sql("select version from supabase_migrations.schema_migrations order by version").map((row) => String(row.version));
  evidence.history = { remoteCount: remote.length, remoteTail: remote.slice(-3), fixRecorded: remote.includes(RELEASE), ph2_07Recorded: remote.includes("20260909010000") };
  evidence.snapshotBefore = sql(SNAPSHOT_SQL)[0];
  // Whether a real Stripe round trip is possible here at all.
  evidence.stripeLinkedConsumers = sql(`select subscription_status as status, count(*)::int as rows from public.billing_subscriptions
    where owner_consumer_id is not null group by 1 order by 1`);
  evidence.activeAdmins = sql("select count(*)::int as active, count(*) filter (where mfa_enrolled)::int as mfa_enrolled from public.admin_users where revoked_at is null")[0];
  return { url, sql, remote };
}

function verifyApplied(sql) {
  evidence.recorded = sql(`select version, name, coalesce(array_length(statements,1),0) as statements from supabase_migrations.schema_migrations where version='${RELEASE}'`)[0] ?? null;
  evidence.ruleAfter = readRule(sql);
  check(evidence.recorded?.name === RELEASE_NAME && evidence.recorded.statements === 2, "fix-migration-not-recorded");
  check(evidence.ruleAfter.constraintNames.length === 1 && evidence.ruleAfter.constraintValidated === true, "operation-check-missing-or-not-validated");
  check(evidence.ruleAfter.checkAcceptsSyncBilling && evidence.ruleAfter.checkKeepsEarlierValues && evidence.ruleAfter.checkValues.length === EARLIER_OPERATIONS.length + 1, "operation-check-values-wrong");
  check(evidence.ruleAfter.prepareAcceptsSyncBilling, "prepare-function-changed-unexpectedly");
}

async function apply() {
  check(process.env.ADMIN_SYNC_BILLING_OWNER_APPROVED === "yes", "refusing: apply needs ADMIN_SYNC_BILLING_OWNER_APPROVED=yes (owner approval in chat)");
  const { url, sql, remote } = await audit();
  check(!remote.includes(RELEASE), `refusing: ${RELEASE} is already recorded`);
  check(remote.every((version) => version < RELEASE), "refusing: staging history holds a version newer than the fix");
  check(evidence.findingConfirmed, "refusing: staging does not show the audited mismatch");
  check(evidence.ruleBefore.constraintNames.length === 1 && evidence.ruleBefore.checkKeepsEarlierValues && evidence.ruleBefore.checkValues.length === EARLIER_OPERATIONS.length, "refusing: unexpected operation CHECK shape");
  const before = evidence.snapshotBefore;

  // The splitter must reproduce what the CLI recorded for earlier migrations.
  for (const [version, file] of [["20260907130000", "20260907130000_subscription_lifecycle_reconciliation.sql"], ["20260816050000", "20260816050000_crosscalc_v2_public_release.sql"]]) {
    // 20260816050000 was pushed from a CRLF checkout; line endings are the only allowed difference there.
    const storedRaw = sql(`select statements from supabase_migrations.schema_migrations where version='${version}'`)[0].statements;
    const stored = version === "20260816050000" ? storedRaw.map((statement) => statement.replace(/\r\n/g, "\n")) : storedRaw;
    const ours = splitStatements(readFileSync(resolve(`supabase/migrations/${file}`), "utf8"));
    check(JSON.stringify(stored) === JSON.stringify(ours), `statement-split-differs-from-cli:${version}`);
  }
  evidence.splitterMatchesCliHistory = true;

  const statements = splitStatements(readFileSync(resolve(`supabase/migrations/${RELEASE}_${RELEASE_NAME}.sql`), "utf8"));
  check(statements.length === 2, "unexpected-statement-count");
  check(!statements.some((statement) => statement.includes("$syncstmt$") || statement.includes("$syncapply$")), "quote-tag-collision");
  const literal = `array[${statements.map((statement) => `$syncstmt$${statement}$syncstmt$`).join(",")}]::text[]`;
  // One DO statement: both ALTERs run in order, then the history row is
  // written. Any error aborts the whole statement, so nothing persists.
  const program = [
    "do $syncapply$",
    "begin",
    ...statements.map((statement) => `  execute $syncstmt$${statement}$syncstmt$;`),
    `  insert into supabase_migrations.schema_migrations(version, name, statements) values ('${RELEASE}', '${RELEASE_NAME}', ${literal});`,
    "end",
    "$syncapply$"
  ].join("\n");
  const applied = runFile(url, program, "mathnexa-sync-billing-apply-");
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

// Runs as the database owner through the pooler. Every row it writes belongs to
// fresh random synthetic ids and is undone by the final RAISE.
const CONTRACT_SQL = String.raw`do $contract$
declare
  v_owner uuid := gen_random_uuid();
  v_target uuid := gen_random_uuid();
  v_admin uuid := gen_random_uuid();
  v_session uuid := gen_random_uuid();
  v_expired uuid := gen_random_uuid();
  v_run text := replace(gen_random_uuid()::text, '-', '');
  v_op uuid;
  v_again uuid;
  v_value text;
  v_accepted text[] := '{}';
  r jsonb := '{}'::jsonb;
begin
  insert into auth.users(id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data) values
    (v_owner, 'authenticated', 'authenticated', 'sync-contract-owner-' || v_run || '@example.invalid', 'x', now(), '{}'),
    (v_target, 'authenticated', 'authenticated', 'sync-contract-account-' || v_run || '@example.invalid', 'x', now(), '{}');
  insert into public.consumer_accounts(user_id, account_status, email_confirmed_at)
    values (v_target, 'active', now()) on conflict (user_id) do nothing;
  insert into public.admin_users(id, user_id, role, mfa_enrolled) values (v_admin, v_owner, 'owner', true);
  insert into public.admin_sessions(id, admin_user_id, token_hash, assurance_level, started_at, expires_at) values
    (v_session, v_admin, md5(v_run) || md5(v_run || 'a'), 'aal2', now() - interval '10 minutes', now() + interval '10 minutes'),
    (v_expired, v_admin, md5(v_run || 'b') || md5(v_run || 'c'), 'aal2', now() - interval '20 minutes', now() - interval '1 minute');

  -- Every earlier value and sync-billing are accepted by the CHECK itself.
  foreach v_value in array array['resend-confirmation','revoke-sessions','suspend','restore','open-portal','cancel-at-period-end','submit-refund-review','deny-refund-review','grant-complimentary','remove-complimentary','emergency-revoke','sync-billing'] loop
    insert into public.admin_account_operations(idempotency_key, admin_user_id, admin_session_id, target_user_id, operation, before_snapshot)
      values ('contract:direct:' || v_value || ':' || v_run, v_admin, v_session, v_target, v_value, '{}'::jsonb);
    v_accepted := v_accepted || v_value;
  end loop;
  r := r || jsonb_build_object('checkAccepts', to_jsonb(v_accepted));
  begin
    insert into public.admin_account_operations(idempotency_key, admin_user_id, admin_session_id, target_user_id, operation, before_snapshot)
      values ('contract:direct:charge-card:' || v_run, v_admin, v_session, v_target, 'charge-card', '{}'::jsonb);
    r := r || jsonb_build_object('checkRejectsUnknown', false);
  exception when check_violation then
    r := r || jsonb_build_object('checkRejectsUnknown', true);
  end;

  -- The Sync with Stripe database path, exactly as the route calls it.
  v_op := public.prepare_admin_account_operation(v_admin, v_session, v_target, 'sync-billing', 'contract:prepare:' || v_run, null);
  v_again := public.prepare_admin_account_operation(v_admin, v_session, v_target, 'sync-billing', 'contract:prepare:' || v_run, null);
  r := r || jsonb_build_object('preparedState', (select operation_state from public.admin_account_operations where id = v_op),
    'repeatReturnsSameOperation', v_op = v_again);
  perform public.finish_admin_account_operation(v_admin, v_session, v_op, 'succeeded', null);
  r := r || jsonb_build_object(
    'finishedState', (select operation_state from public.admin_account_operations where id = v_op),
    'snapshotsRecorded', (select before_snapshot is not null and after_snapshot is not null from public.admin_account_operations where id = v_op),
    'auditRows', (select coalesce(jsonb_agg(action order by action), '[]'::jsonb) from public.admin_audit_log
      where target = v_target::text and metadata->>'operation_id' = v_op::text));

  -- Authorization is unchanged.
  begin
    perform public.prepare_admin_account_operation(v_admin, v_expired, v_target, 'sync-billing', 'contract:expired:' || v_run, null);
    r := r || jsonb_build_object('expiredSessionRefused', false);
  exception when insufficient_privilege then
    r := r || jsonb_build_object('expiredSessionRefused', true);
  end;
  begin
    perform public.prepare_admin_account_operation(v_admin, v_session, v_target, 'charge-card', 'contract:unknown:' || v_run, null);
    r := r || jsonb_build_object('unknownOperationRefused', false);
  exception when raise_exception then
    r := r || jsonb_build_object('unknownOperationRefused', sqlerrm = 'Invalid bounded account operation');
  end;
  begin
    perform public.prepare_admin_account_operation(v_admin, v_session, v_owner, 'sync-billing', 'contract:adminself:' || v_run, null);
    r := r || jsonb_build_object('adminIdentityTargetRefused', false);
  exception when others then
    r := r || jsonb_build_object('adminIdentityTargetRefused', sqlerrm like 'Active admin identities%' or sqlerrm = 'Consumer account not found');
  end;
  r := r || jsonb_build_object(
    'browserRolesCannotPrepare', not has_function_privilege('anon', 'public.prepare_admin_account_operation(uuid,uuid,uuid,text,text,text)', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.prepare_admin_account_operation(uuid,uuid,uuid,text,text,text)', 'EXECUTE'),
    'browserRolesCannotWriteOperations', not has_table_privilege('anon', 'public.admin_account_operations', 'INSERT')
      and not has_table_privilege('authenticated', 'public.admin_account_operations', 'INSERT'),
    'serviceRoleCanPrepare', has_function_privilege('service_role', 'public.prepare_admin_account_operation(uuid,uuid,uuid,text,text,text)', 'EXECUTE'));

  raise exception 'sync-contract-result:%', r::text;
end
$contract$`;

/**
 * The contract's result travels in the error that rolls it back. The CLI
 * prints that error either plainly or inside a JSON string (quotes escaped),
 * so both forms are accepted; anything else is a failure.
 */
function extractContractResult(output) {
  const marker = "sync-contract-result:";
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
  const ran = runFile(url, CONTRACT_SQL, "mathnexa-sync-billing-contract-");
  const result = extractContractResult(ran.output);
  check(!ran.ok && result, `contract-did-not-complete:${redact(ran.output).slice(-600)}`);
  evidence.contract = result;
  const after = sql(SNAPSHOT_SQL)[0];
  for (const key of [...UNCHANGED_KEYS, "history", "history_digest"]) check(after[key] === before[key], `contract-left-residue:${key}`);
  evidence.contractRolledBack = true;
  check(JSON.stringify(result.checkAccepts) === JSON.stringify([...EARLIER_OPERATIONS, "sync-billing"]), "check-did-not-accept-all-twelve");
  check(result.checkRejectsUnknown === true, "check-accepted-unknown-operation");
  check(result.preparedState === "prepared" && result.repeatReturnsSameOperation === true, "sync-billing-prepare-failed");
  check(result.finishedState === "succeeded" && result.snapshotsRecorded === true, "sync-billing-finish-failed");
  check(JSON.stringify(result.auditRows) === JSON.stringify(["admin.account.operation.prepared", "admin.account.operation.succeeded"]), "sync-billing-audit-wrong");
  for (const key of ["expiredSessionRefused", "unknownOperationRefused", "adminIdentityTargetRefused", "browserRolesCannotPrepare", "browserRolesCannotWriteOperations", "serviceRoleCanPrepare"]) {
    check(result[key] === true, `authorization-contract-failed:${key}`);
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
