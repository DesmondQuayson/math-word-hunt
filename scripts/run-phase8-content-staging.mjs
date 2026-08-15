import { spawnSync } from "node:child_process";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { zipSync } from "fflate";

import {
  PHASE8_MANAGED_BUCKET_IDS,
  assertUnchangedFingerprint,
  buildTargetedCleanupSql,
  inspectManagedBucketDefinitions,
  syntheticOwnerEmail
} from "./phase8-content-cleanup-contract.mjs";

const origin = "https://mathnexa-platform-staging.vercel.app";
const projectRef = "gcmuhzxkwvfireyrearl";
const projectName = "mathnexa-platform-staging";
const projectId = "prj_O61Cyx9WMjc0jljpM9erCiSXsJA0";
const scope = "bright-path-ed-tech";
const branch = "codex/admin-content-operations";
const repositoryRoot = resolve(process.cwd());
const supabaseCli = resolve("node_modules/supabase/dist/supabase.js");
const workRoot = mkdtempSync(join(tmpdir(), "mathnexa-phase8-content-"));
const supabaseWork = join(workRoot, "supabase-work");

function required(name, pattern = /\S/) {
  const value = process.env[name]?.trim() ?? "";
  if (!pattern.test(value)) throw new Error(`missing-${name.toLowerCase().replaceAll("_", "-")}`);
  return value;
}

const accessToken = required("SUPABASE_ACCESS_TOKEN", /^sbp_/);
const databasePassword = required("SUPABASE_DB_PASSWORD", /^.{32,}$/);
const publishableKey = required("SUPABASE_PUBLISHABLE_KEY");
const secretKey = required("SUPABASE_SECRET_KEY");
const stagingToken = required("MVH_STAGING_ACCESS_TOKEN", /^[A-Za-z0-9_-]{43}$/);
const bypassSecret = required("VERCEL_AUTOMATION_BYPASS_SECRET", /^[A-Za-z0-9_-]{20,}$/);
const vercelCli = required("PHASE8_VERCEL_CLI");
const candidateTree = required("PHASE8_CANDIDATE_TREE", /^[a-f0-9]{40}$/);
const supabaseUrl = `https://${projectRef}.supabase.co`;
const admin = createClient(supabaseUrl, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });

const fixtureTables = [
  "admin_users", "admin_sessions", "admin_audit_log",
  "content_grades", "content_topics", "content_lessons", "content_resources",
  "content_resource_versions", "lesson_resource_assignments", "resource_files",
  "resource_download_events", "game_packages", "game_package_assets",
  "game_package_quarantine_events", "game_launch_events", "cms_documents",
  "cms_document_versions", "cms_media_assets", "cms_media_versions", "cms_media_usage",
  "consumer_accounts", "consumer_game_entitlements", "consumer_account_deletion_requests",
  "admin_account_operations", "admin_user_support_notes", "consumer_complimentary_entitlements",
  "platform_analytics_events", "platform_feature_flag_history", "platform_retention_runs"
];
const privateBuckets = PHASE8_MANAGED_BUCKET_IDS;

function check(value, code) {
  if (!value) throw new Error(code);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: options.env ?? process.env,
    stdio: [options.input ? "pipe" : "ignore", "pipe", "pipe"],
    input: options.input
  });
  if (result.status !== 0) {
    const safe = `${result.stdout}\n${result.stderr}`
      .replaceAll(accessToken, "[REDACTED]")
      .replaceAll(databasePassword, "[REDACTED]")
      .replaceAll(secretKey, "[REDACTED]")
      .replaceAll(publishableKey, "[REDACTED]")
      .replaceAll(stagingToken, "[REDACTED]")
      .replaceAll(bypassSecret, "[REDACTED]")
      .slice(-4000);
    throw new Error(`command-failed:${safe}`);
  }
  return result.stdout.trim();
}

function supabase(args) {
  return run(process.execPath, [supabaseCli, ...args, "--workdir", supabaseWork, "--yes"], {
    env: {
      ...process.env,
      SUPABASE_ACCESS_TOKEN: accessToken,
      SUPABASE_DB_PASSWORD: databasePassword,
      SUPABASE_TELEMETRY_DISABLED: "true"
    }
  });
}

function vercel(args, input) {
  const executable = process.env.ComSpec ?? "cmd.exe";
  return run(executable, ["/d", "/s", "/c", vercelCli, ...args], { input });
}

async function managementQuery(query) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ query, password: databasePassword })
  });
  const text = await response.text();
  if (!response.ok) {
    const safe = text.replaceAll(accessToken, "[REDACTED]").replaceAll(databasePassword, "[REDACTED]").slice(-2000);
    throw new Error(`management-query-failed-${response.status}:${safe}`);
  }
  try { return text ? JSON.parse(text) : null; }
  catch { return text; }
}

async function tableCounts() {
  const counts = {};
  for (const table of fixtureTables) {
    const result = await admin.from(table).select("*", { count: "exact", head: true });
    if (result.error) throw new Error(`count-${table}-failed`);
    counts[table] = result.count ?? -1;
  }
  return counts;
}

async function listBucketObjects(bucket, prefix = "") {
  const found = [];
  let offset = 0;
  while (true) {
    const result = await admin.storage.from(bucket).list(prefix, { limit: 100, offset, sortBy: { column: "name", order: "asc" } });
    if (result.error) throw new Error(`list-${bucket}-failed`);
    for (const item of result.data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id) found.push(path);
      else found.push(...await listBucketObjects(bucket, path));
    }
    if (result.data.length < 100) break;
    offset += 100;
  }
  return found;
}

async function inventory() {
  const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (users.error) throw new Error("auth-inventory-failed");
  const factorResult = await managementQuery("select count(*)::integer as count from auth.mfa_factors;");
  const factorRows = Array.isArray(factorResult) ? factorResult : factorResult?.result ?? factorResult?.data ?? [];
  const mfaFactors = Number(factorRows[0]?.count);
  check(Number.isSafeInteger(mfaFactors) && mfaFactors >= 0, "mfa-inventory-failed");
  const counts = await tableCounts();
  const storage = {};
  for (const bucket of privateBuckets) storage[bucket] = (await listBucketObjects(bucket)).length;
  return { authUsers: users.data.users.length, mfaFactors, counts, storage };
}

async function bucketState() {
  const listed = await admin.storage.listBuckets({ limit: 100, offset: 0 });
  if (listed.error) throw new Error("bucket-definition-inventory-failed");
  const objectCounts = {};
  for (const bucket of PHASE8_MANAGED_BUCKET_IDS) objectCounts[bucket] = (await listBucketObjects(bucket)).length;
  const inspection = inspectManagedBucketDefinitions(listed.data, objectCounts);
  if (!inspection.validDefinitions) {
    throw new Error(`managed-bucket-definition-failed:${JSON.stringify({
      missing: inspection.missing, unknown: inspection.unknown, mismatches: inspection.mismatches
    })}`);
  }
  return { rows: listed.data, objectCounts, inspection };
}

async function removeManagedBucketDefinitionsForFallback(before) {
  check(before.inspection.validDefinitions, "fallback-bucket-definitions-invalid");
  check(before.inspection.cleanupToZero, "fallback-managed-bucket-object-present");
  for (const bucketId of PHASE8_MANAGED_BUCKET_IDS) {
    const removed = await admin.storage.deleteBucket(bucketId);
    if (removed.error) throw new Error(`fallback-bucket-delete-failed:${bucketId}`);
  }
  const listed = await admin.storage.listBuckets({ limit: 100, offset: 0 });
  if (listed.error) throw new Error("fallback-bucket-delete-verification-failed");
  const remaining = new Set(listed.data.map((bucket) => bucket.id));
  for (const bucketId of PHASE8_MANAGED_BUCKET_IDS) {
    check(!remaining.has(bucketId), `fallback-bucket-delete-incomplete:${bucketId}`);
  }
}

async function unrelatedFingerprint() {
  const result = await managementQuery(`select md5(jsonb_build_object(
    'billing_customers',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from public.billing_customers t),
    'billing_subscriptions',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from public.billing_subscriptions t),
    'billing_webhook_events',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from public.billing_webhook_events t),
    'products',(select coalesce(jsonb_agg(to_jsonb(t) order by product_key),'[]'::jsonb) from public.products t),
    'feature_flags',(select coalesce(jsonb_agg(to_jsonb(t) order by flag_key),'[]'::jsonb) from public.platform_feature_flags t)
  )::text) as fingerprint;`);
  const rows = Array.isArray(result) ? result : result?.result ?? result?.data ?? [];
  const fingerprint = rows[0]?.fingerprint;
  if (!/^[a-f0-9]{32}$/.test(fingerprint ?? "")) throw new Error("unrelated-fingerprint-unavailable");
  return fingerprint;
}

function requireZero(value, label) {
  check(value.authUsers === 0, `${label}-auth-not-zero`);
  check(value.mfaFactors === 0, `${label}-mfa-not-zero`);
  for (const [table, count] of Object.entries(value.counts)) check(count === 0, `${label}-${table}-not-zero`);
  for (const [bucket, count] of Object.entries(value.storage)) check(count === 0, `${label}-${bucket}-not-zero`);
}

async function ensureHostedSchema(evidence) {
  const before = await bucketState();
  check(before.inspection.cleanupToZero, "fallback-preflight-managed-bucket-object-present");
  let schemaHealthy = false;
  try {
    await tableCounts();
    const migrationResult = await managementQuery(`select exists (
      select 1
      from supabase_migrations.schema_migrations
      where version = '20260804020000'
    ) as complete;`);
    const migrationRows = Array.isArray(migrationResult)
      ? migrationResult
      : migrationResult?.result ?? migrationResult?.data ?? [];
    schemaHealthy = migrationRows[0]?.complete === true;
  } catch {
    schemaHealthy = false;
  }
  if (!schemaHealthy) {
    await removeManagedBucketDefinitionsForFallback(before);
    supabase(["db", "reset", "--linked", "--no-seed"]);
    const after = await bucketState();
    check(after.inspection.cleanupToZero, "fallback-recreated-buckets-not-empty");
    assertUnchangedFingerprint(before.inspection.fingerprint, after.inspection.fingerprint, "fallback-bucket-definition");
    evidence.fallbackRepair = true;
  } else {
    supabase(["db", "push", "--linked", "--include-all"]);
    evidence.fallbackRepair = false;
  }
  const identity = await admin.rpc("set_platform_identity_model", { p_identity_model: "consumer-v1" });
  if (identity.error) throw new Error("staging-identity-model-failed");
}

function upsertEnvironment(key, value) {
  vercel([
    "api", `/v10/projects/${projectId}/env?upsert=true`, "--scope", scope,
    "--method", "POST", "--input", "-", "--silent"
  ], JSON.stringify({ key, value, type: "sensitive", target: ["production"] }));
}

function parseJsonOutput(value) {
  const objectStart = value.indexOf("{");
  const arrayStart = value.indexOf("[");
  const start = objectStart < 0 ? arrayStart : arrayStart < 0 ? objectStart : Math.min(objectStart, arrayStart);
  const closing = value[start] === "[" ? "]" : "}";
  const end = value.lastIndexOf(closing);
  check(start >= 0 && end > start, "vercel-json-missing");
  return JSON.parse(value.slice(start, end + 1));
}

function normalizeDeployment(value) {
  const id = value.id ?? value.uid ?? value.deploymentId;
  const url = value.url ?? value.productionUrl ?? value.productionUrls?.[0] ?? value.aliases?.[0];
  return { ...value, id, url };
}

function findReadyCandidateDeployment() {
  const result = parseJsonOutput(vercel(["list", projectName, "--scope", scope, "--json"]));
  const deployments = Array.isArray(result) ? result : result.deployments ?? [];
  const match = deployments.find((item) =>
    item.state === "READY"
    && item.target === "production"
    && item.meta?.candidateTree === candidateTree
    && String(item.url ?? "").includes(projectName)
  );
  if (!match) return null;
  const inspected = parseJsonOutput(vercel(["inspect", match.url, "--scope", scope, "--json"]));
  return normalizeDeployment({ ...inspected, url: match.url });
}

async function waitForDeployment() {
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(origin, { redirect: "manual", headers: { "x-vercel-protection-bypass": bypassSecret } });
      if (response.status === 404 && response.headers.get("cache-control")?.includes("no-store")) return;
    } catch { /* deployment still converging */ }
    await new Promise((done) => setTimeout(done, 2000));
  }
  throw new Error("staging-deployment-not-ready");
}

function decodeBase32(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of value.replaceAll("=", "").toUpperCase()) bits += alphabet.indexOf(character).toString(2).padStart(5, "0");
  const bytes = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  return Buffer.from(bytes);
}

function totp(secret) {
  const payload = Buffer.alloc(8);
  payload.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac("sha1", decodeBase32(secret)).update(payload).digest();
  const offset = digest.at(-1) & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, "0");
}

const bytes = (value) => Uint8Array.from(Buffer.from(value));
const sha = (value) => createHash("sha256").update(value).digest("hex");
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+T0m02QAAAABJRU5ErkJggg==", "base64");

function gameArchive(runId, version = "1.0.0", unsafe = false) {
  const runSuffix = runId.slice(0, 12);
  const assets = {
    "game/index.html": bytes('<!doctype html><html><head><link rel="stylesheet" href="styles.css"><script src="main.js" defer></script></head><body><main><h1>Staging Fraction Field</h1><button id="answer">Show answer</button><output id="result"></output></main></body></html>'),
    "game/main.js": bytes(unsafe ? 'eval("blocked")' : 'document.querySelector("#answer").addEventListener("click",()=>{document.querySelector("#result").textContent="Synthetic check passed"})'),
    "game/styles.css": bytes("body{font-family:system-ui;background:#fff;color:#102a43}button{min-height:44px}"),
    "thumbnail.png": Uint8Array.from(png),
    "metadata.json": bytes(JSON.stringify({ author: "MathNexa", fixture: "phase8-content-staging", synthetic_run_id: runId }))
  };
  const manifest = {
    package_schema_version: "1.0",
    game_id: unsafe ? `phase8-content-unsafe-${runSuffix}` : `phase8-content-game-${runSuffix}`,
    version,
    title: unsafe ? "Unsafe Staging Game" : "Staging Fraction Field",
    description: "Synthetic isolated-staging package.",
    grade: 4,
    topic: "Staging Fractions",
    lesson: "Staging Equivalent Fractions",
    entry_file: "game/index.html",
    thumbnail: "thumbnail.png",
    asset_inventory: Object.keys(assets),
    integrity_hashes: Object.fromEntries(Object.entries(assets).map(([path, value]) => [path, sha(value)])),
    minimum_mathnexa_runtime_version: "1.0.0"
  };
  return Buffer.from(zipSync({ "manifest.json": bytes(JSON.stringify(manifest)), ...assets }, { level: 6 }));
}

async function loginOwner(page, email, password) {
  await page.goto(`${origin}/admin/sign-in`);
  await page.getByLabel("Owner email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Continue securely" }).click();
  await page.getByRole("button", { name: "Set up authenticator" }).click();
  const secret = (await page.locator("code.admin-setup-secret").textContent())?.trim() ?? "";
  check(secret.length > 10, "mfa-secret-unavailable");
  await page.getByLabel("Six-digit authenticator code").fill(totp(secret));
  await page.getByRole("button", { name: "Verify and open admin" }).click();
  await page.waitForURL(/\/admin$/);
}

function addRunEntityTargets(fixture, ...values) {
  for (const value of values.flat()) {
    const target = String(value ?? "");
    if (target.length > 0 && target.length <= 160) fixture.entityTargets.add(target);
  }
}

function exactResourceRow(page, title) {
  return page.locator(".admin-resource-table tbody tr").filter({ has: page.getByText(title, { exact: true }) });
}

async function expectAdminResult(page, key, expected, label) {
  await page.waitForURL((value) => value.pathname === "/admin" && value.searchParams.has(key));
  const actual = new URL(page.url()).searchParams.get(key) ?? "missing";
  check(actual === expected, `${label}-${actual}`);
}

async function captureRunAuditRows(fixture) {
  check(fixture.runId === fixture.auditRunId, "audit-capture-run-mismatch");
  let query = admin.from("admin_audit_log")
    .select("id,admin_user_id,target,created_at")
    .gte("created_at", fixture.startedAt)
    .order("created_at", { ascending: true });
  if (fixture.frozenAt) query = query.lte("created_at", fixture.frozenAt);
  const result = await query;
  if (result.error) throw new Error("audit-capture-query-failed");
  for (const row of result.data) {
    if (fixture.auditRows.has(row.id)) continue;
    const actorMatches = row.admin_user_id === fixture.adminId;
    const targetMatches = typeof row.target === "string" && fixture.entityTargets.has(row.target);
    if (!actorMatches && !targetMatches) continue;
    fixture.auditRows.set(row.id, Object.freeze({ id: row.id, target: row.target, actorBound: actorMatches }));
  }
}

async function collectRunEntityTargets(fixture) {
  const specifications = [
    ["content_grades", "id", "created_by"], ["content_topics", "id", "created_by"],
    ["content_lessons", "id", "created_by"], ["content_resources", "id", "created_by"],
    ["game_packages", "resource_id", "created_by"], ["game_package_quarantine_events", "id", "created_by"],
    ["cms_documents", "id", "created_by"], ["cms_media_assets", "id", "created_by"]
  ];
  for (const [table, column, ownerColumn] of specifications) {
    const rows = await admin.from(table).select(column).eq(ownerColumn, fixture.adminId);
    if (rows.error) throw new Error(`audit-entity-inventory-failed:${table}`);
    addRunEntityTargets(fixture, rows.data.map((row) => row[column]));
  }
  const sessions = await admin.from("admin_sessions").select("id").eq("admin_user_id", fixture.adminId);
  if (sessions.error) throw new Error("audit-entity-inventory-failed:admin_sessions");
  addRunEntityTargets(fixture, sessions.data.map((row) => row.id));
}

async function syntheticResourceDiagnostic(adminId) {
  const [resources, assignments, versions] = await Promise.all([
    admin.from("content_resources").select("id,resource_type,publication_state").eq("created_by", adminId),
    admin.from("lesson_resource_assignments").select("resource_id,slug,sort_order").eq("created_by", adminId),
    admin.from("content_resource_versions").select("resource_id,title,version_number").eq("created_by", adminId)
  ]);
  if (resources.error || assignments.error || versions.error) return { unavailable: true };
  return {
    resources: resources.data.map((resource) => ({
      type: resource.resource_type,
      state: resource.publication_state,
      assignment: assignments.data.find((entry) => entry.resource_id === resource.id) ?? null,
      title: versions.data.find((entry) => entry.resource_id === resource.id && entry.version_number === 1)?.title ?? null
    }))
  };
}

async function freezeRunGameCleanupScope(fixture) {
  const resources = await admin.from("content_resources").select("id").eq("created_by", fixture.adminId);
  const packages = await admin.from("game_packages").select("id,resource_id").eq("created_by", fixture.adminId);
  if (resources.error || packages.error) throw new Error("game-cleanup-dependencies-unavailable");
  const resourceIds = new Set(resources.data.map((row) => row.id));
  const packageRows = new Map(packages.data.map((row) => [row.id, row]));
  if (resourceIds.size === 0) return { catalogRows: [], destinationAuditRows: [] };
  const catalog = await admin.from("game_catalog_entries")
    .select("id,stable_key,launch_type,package_id,resource_id,created_at")
    .in("resource_id", [...resourceIds]);
  if (catalog.error) throw new Error("game-cleanup-catalog-unavailable");
  for (const row of catalog.data) {
    check(row.launch_type === "hosted_package" && resourceIds.has(row.resource_id) &&
      packageRows.has(row.package_id) && packageRows.get(row.package_id).resource_id === row.resource_id,
    "game-cleanup-catalog-ownership-ambiguous");
  }
  const catalogRows = catalog.data.map((row) => ({
    id: row.id, stableKey: row.stable_key, launchType: row.launch_type,
    packageId: row.package_id, resourceId: row.resource_id, createdAt: row.created_at
  })).sort((left, right) => left.id.localeCompare(right.id));
  addRunEntityTargets(fixture, catalogRows.map((row) => row.id));
  if (catalogRows.length === 0) return { catalogRows, destinationAuditRows: [] };
  const destination = await admin.from("game_catalog_destination_audit")
    .select("id,catalog_entry_id,recorded_at")
    .in("catalog_entry_id", catalogRows.map((row) => row.id))
    .order("recorded_at");
  if (destination.error) throw new Error("game-cleanup-destination-audit-unavailable");
  for (const row of catalogRows) {
    check(destination.data.some((audit) => audit.catalog_entry_id === row.id), "game-cleanup-destination-audit-missing");
  }
  return {
    catalogRows,
    destinationAuditRows: destination.data.map((row) => ({
      id: row.id, catalogEntryId: row.catalog_entry_id, recordedAt: row.recorded_at
    }))
  };
}

async function freezeRunAuditScope(fixture) {
  await collectRunEntityTargets(fixture);
  const gameScope = await freezeRunGameCleanupScope(fixture);
  fixture.frozenAt ??= new Date().toISOString();
  await captureRunAuditRows(fixture);
  check(fixture.auditRows.size > 0, "audit-cleanup-empty-allowlist");
  return {
    projectRef,
    runId: fixture.runId,
    startedAt: fixture.startedAt,
    frozenAt: fixture.frozenAt,
    auditRows: [...fixture.auditRows.values()].sort((left, right) => left.id.localeCompare(right.id)),
    ...gameScope
  };
}

async function verifyContentLifecycle(evidence, runId, fixture) {
  const email = syntheticOwnerEmail(runId);
  const password = `Mx8-Content!${runId.slice(0, 16)}`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { synthetic_run_id: runId }
  });
  if (created.error || !created.data.user) throw new Error("synthetic-owner-create-failed");
  const userId = created.data.user.id;
  fixture.userId = userId;
  const owner = await admin.from("admin_users").insert({ user_id: userId, role: "owner", mfa_enrolled: false }).select("id").single();
  if (owner.error) throw new Error("synthetic-owner-authorization-failed");
  const adminId = owner.data.id;
  fixture.adminId = adminId;
  addRunEntityTargets(fixture, email, userId, adminId);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: "reduce",
    extraHTTPHeaders: { "x-vercel-protection-bypass": bypassSecret }
  });
  const bootstrap = await context.request.post(`${origin}/api/internal/staging-access/bootstrap`, {
    headers: { Authorization: `Bearer ${stagingToken}`, "x-vercel-protection-bypass": bypassSecret }
  });
  check(bootstrap.status() === 204, "staging-access-bootstrap-failed");
  const page = await context.newPage();
  try {
    await loginOwner(page, email, password);
    await captureRunAuditRows(fixture);
    for (const [section, label] of [["games", "Add Game"], ["homework", "Add Homework"], ["quizzes", "Add Quiz"]]) {
      await page.goto(`${origin}/admin?section=${section}`);
      check(await page.getByRole("link", { name: label, exact: true }).isVisible(), `${section}-add-control-missing`);
    }
    await page.goto(`${origin}/admin?section=map-prep`);
    check(await page.getByRole("link", { name: "Add destination" }).isVisible(), "map-destination-control-missing");
    await page.setViewportSize({ width: 390, height: 844 });
    check(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), "mobile-overflow");
    await page.setViewportSize({ width: 1280, height: 900 });
    evidence.controlsAndAccessibility = true;

    const runSuffix = runId.slice(0, 12);
    const grade = await admin.rpc("create_content_grade", { p_actor_admin_id: adminId, p_grade_number: 4, p_title: "Staging Grade 4", p_slug: `staging-grade-4-${runSuffix}`, p_sort_order: 4 });
    if (grade.error) throw new Error("staging-grade-create-failed");
    const topic = await admin.rpc("create_content_topic", { p_actor_admin_id: adminId, p_grade_id: grade.data, p_title: "Staging Fractions", p_slug: `staging-fractions-${runSuffix}`, p_sort_order: 1 });
    if (topic.error) throw new Error("staging-topic-create-failed");
    const lesson = await admin.rpc("create_content_lesson", { p_actor_admin_id: adminId, p_topic_id: topic.data, p_title: "Staging Equivalent Fractions", p_slug: `staging-equivalent-fractions-${runSuffix}`, p_sort_order: 1 });
    if (lesson.error) throw new Error("staging-lesson-create-failed");
    addRunEntityTargets(fixture, grade.data, topic.data, lesson.data);
    await captureRunAuditRows(fixture);

    const safePdf = Buffer.from("%PDF-1.7\n1 0 obj << /Type /Catalog /AcroForm 2 0 R >> endobj\n2 0 obj << /Fields [] >> endobj\n%%EOF");
    const safeAnswer = Buffer.from("%PDF-1.7\n1 0 obj << /Type /Catalog /AcroForm 2 0 R >> endobj\n2 0 obj << /Fields [] /Title (Synthetic Answer Key) >> endobj\n%%EOF");
    const safeQuiz = Buffer.from("%PDF-1.7\n1 0 obj << /Type /Catalog /AcroForm 2 0 R >> endobj\n2 0 obj << /Fields [] /Title (Synthetic Quiz) >> endobj\n%%EOF");
    const safeQuizAnswer = Buffer.from("%PDF-1.7\n1 0 obj << /Type /Catalog /AcroForm 2 0 R >> endobj\n2 0 obj << /Fields [] /Title (Synthetic Quiz Answer Key) >> endobj\n%%EOF");
    await page.goto(`${origin}/admin?section=homework`);
    let form = page.locator("#add-homework");
    await form.getByLabel("Title", { exact: true }).fill("Synthetic fraction homework");
    await form.getByLabel("Slug", { exact: true }).fill(`synthetic-fraction-homework-${runSuffix}`);
    await form.getByLabel("Description").fill("Isolated staging Homework fixture.");
    await form.getByLabel("Tags").fill(`synthetic, phase8, synthetic-run-${runId}`);
    await form.getByLabel("Interactive Homework PDF").setInputFiles({ name: "synthetic-homework.pdf", mimeType: "application/pdf", buffer: safePdf });
    await form.getByLabel("Homework Answer Key PDF").setInputFiles({ name: "synthetic-homework-answer.pdf", mimeType: "application/pdf", buffer: safeAnswer });
    await form.getByRole("button", { name: "Save draft" }).click();
    await page.waitForURL(/upload=saved/);
    const homeworkDraft = await admin.from("content_resource_versions").select("resource_id")
      .eq("created_by", adminId).eq("title", "Synthetic fraction homework").eq("version_number", 1).single();
    if (homeworkDraft.error) throw new Error("homework-draft-missing");
    addRunEntityTargets(fixture, homeworkDraft.data.resource_id);
    await captureRunAuditRows(fixture);
    let homeworkRow = exactResourceRow(page, "Synthetic fraction homework");
    const previewHref = await homeworkRow.getByRole("link", { name: /Preview primary pdf/ }).getAttribute("href");
    check(Boolean(previewHref), "homework-preview-link-missing");
    const preview = await context.request.get(`${origin}${previewHref}`);
    check(preview.status() === 200 && preview.headers()["content-type"]?.includes("application/pdf"), "owner-pdf-preview-failed");
    const replacement = Buffer.from("%PDF-1.7\n1 0 obj << /Type /Catalog /AcroForm 2 0 R >> endobj\n2 0 obj << /Fields [] /Title (Replacement) >> endobj\n%%EOF");
    const primaryReplacement = homeworkRow.getByLabel("Replace primary pdf");
    await primaryReplacement.setInputFiles({ name: "synthetic-homework-v2.pdf", mimeType: "application/pdf", buffer: replacement });
    await primaryReplacement.locator("xpath=ancestor::form").getByRole("button", { name: "Replace draft file" }).click();
    await page.waitForURL(/upload=replaced/);
    await captureRunAuditRows(fixture);
    for (const label of ["Validate", "Mark ready for review", "Publish"]) {
      for (let index = 0; index < 2; index += 1) {
        await page.getByRole("button", { name: label, exact: true }).first().click();
        await page.waitForURL(/publish=/);
        await captureRunAuditRows(fixture);
      }
    }
    const homework = await admin.from("content_resources").select("id").eq("resource_type", "homework_pdf").single();
    if (homework.error) throw new Error("published-homework-missing");
    const consumer = await admin.from("consumer_accounts").select("user_id").eq("user_id", userId).maybeSingle();
    if (consumer.error || !consumer.data) throw new Error("synthetic-consumer-account-missing");
    const entitlement = await admin.from("consumer_game_entitlements").insert({ user_id: userId, entitlement_state: "subscription-active", current_period_ends_at: new Date(Date.now() + 86400000).toISOString() });
    if (entitlement.error) throw new Error("synthetic-entitlement-create-failed");
    const download = await context.request.get(`${origin}/resources/${homework.data.id}/download`);
    check(download.status() === 200 && download.headers()["content-type"]?.includes("application/pdf"), "signed-download-proxy-failed");
    await captureRunAuditRows(fixture);
    const primaryFile = await admin.from("resource_files").select("bucket_id,object_path").eq("resource_id", homework.data.id).eq("file_role", "primary_pdf").eq("validation_state", "accepted").single();
    if (primaryFile.error) throw new Error("homework-file-missing");
    const raw = await fetch(`${supabaseUrl}/storage/v1/object/public/${primaryFile.data.bucket_id}/${primaryFile.data.object_path}`);
    check(raw.status !== 200, "raw-storage-object-public");
    const homeworkState = await admin.from("content_resources").select("lock_version").eq("id", homework.data.id).single();
    if (homeworkState.error) throw new Error("homework-state-missing");
    const preparedRollback = await admin.rpc("rollback_content_resource", {
      p_actor_admin_id: adminId,
      p_resource_id: homework.data.id,
      p_target_version_number: 1,
      p_expected_lock_version: homeworkState.data.lock_version
    });
    if (preparedRollback.error) throw new Error("homework-rollback-setup-failed");
    await captureRunAuditRows(fixture);
    await page.goto(`${origin}/admin?section=homework`);
    homeworkRow = exactResourceRow(page, "Synthetic fraction homework");
    await homeworkRow.getByRole("button", { name: "Archive" }).click();
    await page.waitForURL(/publish=archived/);
    await captureRunAuditRows(fixture);
    evidence.homework = true;
    evidence.signedDownload = true;
    evidence.resourceRollback = true;
    evidence.resourceArchive = true;

    await page.goto(`${origin}/admin?section=homework`);
    form = page.locator("#add-homework");
    await form.getByLabel("Title", { exact: true }).fill("Unsafe synthetic homework");
    await form.getByLabel("Slug", { exact: true }).fill(`unsafe-synthetic-homework-${runSuffix}`);
    await form.getByLabel("Description").fill("Quarantine fixture.");
    await form.getByLabel("Order in lesson").fill("8");
    const unsafePdf = Buffer.from("%PDF-1.7\n1 0 obj << /Type /Catalog /OpenAction << /S /JavaScript /JS (alert) >> >> endobj\n%%EOF");
    await form.getByLabel("Interactive Homework PDF").setInputFiles({ name: "unsafe.pdf", mimeType: "application/pdf", buffer: unsafePdf });
    await form.getByRole("button", { name: "Save draft" }).click();
    await page.waitForURL(/upload=quarantined/);
    const unsafeHomework = await admin.from("content_resource_versions").select("resource_id")
      .eq("created_by", adminId).eq("title", "Unsafe synthetic homework").eq("version_number", 1).single();
    if (unsafeHomework.error) throw new Error("unsafe-homework-resource-missing");
    addRunEntityTargets(fixture, unsafeHomework.data.resource_id);
    await captureRunAuditRows(fixture);
    const quarantinedPdf = await admin.from("resource_files").select("id", { count: "exact", head: true }).eq("validation_state", "quarantined");
    check((quarantinedPdf.count ?? 0) >= 1, "unsafe-pdf-not-quarantined");
    evidence.pdfQuarantine = true;

    await page.goto(`${origin}/admin?section=quizzes`);
    form = page.locator("#add-quizzes");
    await form.getByLabel("Title", { exact: true }).fill("Synthetic fraction quiz");
    await form.getByLabel("Slug", { exact: true }).fill(`synthetic-fraction-quiz-${runSuffix}`);
    await form.getByLabel("Description").fill("Isolated staging Quiz fixture.");
    await form.getByLabel("Tags").fill(`synthetic, phase8, synthetic-run-${runId}`);
    await form.getByLabel("Order in lesson").fill("10");
    await form.getByLabel("Interactive Quiz PDF").setInputFiles({ name: "synthetic-quiz.pdf", mimeType: "application/pdf", buffer: safeQuiz });
    await form.getByLabel("Quiz Answer Key PDF").setInputFiles({ name: "synthetic-quiz-answer.pdf", mimeType: "application/pdf", buffer: safeQuizAnswer });
    await form.getByRole("button", { name: "Save draft" }).click();
    await page.waitForURL(/upload=(?:saved|failed-closed)/);
    if (page.url().includes("upload=failed-closed")) {
      throw new Error(`quiz-upload-failed:${JSON.stringify(await syntheticResourceDiagnostic(adminId))}`);
    }
    const quizDraft = await admin.from("content_resource_versions").select("resource_id")
      .eq("created_by", adminId).eq("title", "Synthetic fraction quiz").eq("version_number", 1).single();
    if (quizDraft.error) throw new Error("quiz-draft-missing");
    addRunEntityTargets(fixture, quizDraft.data.resource_id);
    await captureRunAuditRows(fixture);
    let quizRow = exactResourceRow(page, "Synthetic fraction quiz");
    const quizPreviewHref = await quizRow.getByRole("link", { name: /Preview primary pdf/ }).getAttribute("href");
    check(Boolean(quizPreviewHref), "quiz-preview-link-missing");
    const quizPreview = await context.request.get(`${origin}${quizPreviewHref}`);
    check(quizPreview.status() === 200 && quizPreview.headers()["content-type"]?.includes("application/pdf"), "owner-quiz-preview-failed");
    for (const label of ["Validate", "Mark ready for review", "Publish"]) {
      for (let index = 0; index < 2; index += 1) {
        await page.getByRole("button", { name: label, exact: true }).first().click();
        await page.waitForURL(/publish=/);
        await captureRunAuditRows(fixture);
      }
    }
    const quizState = await admin.from("content_resources").select("lock_version")
      .eq("id", quizDraft.data.resource_id).single();
    if (quizState.error) throw new Error("quiz-state-missing");
    const preparedQuizRollback = await admin.rpc("rollback_content_resource", {
      p_actor_admin_id: adminId,
      p_resource_id: quizDraft.data.resource_id,
      p_target_version_number: 1,
      p_expected_lock_version: quizState.data.lock_version
    });
    if (preparedQuizRollback.error) throw new Error("quiz-rollback-setup-failed");
    await captureRunAuditRows(fixture);
    await page.goto(`${origin}/admin?section=quizzes`);
    quizRow = exactResourceRow(page, "Synthetic fraction quiz");
    await quizRow.getByRole("button", { name: "Archive" }).click();
    await page.waitForURL(/publish=archived/);
    await captureRunAuditRows(fixture);
    evidence.quiz = true;
    evidence.quizRollback = true;
    evidence.quizArchive = true;

    await page.goto(`${origin}/admin?section=games`);
    await page.getByLabel("Order in lesson").fill("12");
    await page.getByLabel("MathNexa ZIP package").setInputFiles({ name: "synthetic-game-v1.zip", mimeType: "application/zip", buffer: gameArchive(runId, "1.0.0") });
    await page.getByRole("button", { name: "Upload and validate package" }).click();
    await expectAdminResult(page, "package", "saved", "game-v1-upload-result");
    const gameV1 = await admin.from("game_packages").select("id,resource_id")
      .eq("created_by", adminId).eq("package_version", "1.0.0").single();
    if (gameV1.error) throw new Error("game-v1-missing");
    const expectedGameAssets = ["game/index.html", "game/main.js", "game/styles.css", "metadata.json", "thumbnail.png"];
    const gameAssets = await admin.from("game_package_assets").select("asset_path,object_path,byte_size")
      .eq("package_id", gameV1.data.id).order("asset_path", { ascending: true });
    if (gameAssets.error || gameAssets.data.map((asset) => asset.asset_path).join("|") !== expectedGameAssets.join("|")) {
      throw new Error("game-v1-asset-inventory-mismatch");
    }
    for (const asset of gameAssets.data) {
      const stored = await admin.storage.from("game-packages").download(asset.object_path);
      if (stored.error || !stored.data || stored.data.size !== asset.byte_size) throw new Error("game-v1-private-asset-missing");
    }
    addRunEntityTargets(fixture, gameV1.data.id, gameV1.data.resource_id);
    await captureRunAuditRows(fixture);
    const sandbox = await page.getByRole("link", { name: "Preview sandbox" }).first().getAttribute("href");
    check(Boolean(sandbox), "game-preview-missing");
    await page.goto(`${origin}${sandbox}`);
    const frame = page.frameLocator("iframe");
    await frame.getByRole("heading", { name: "Staging Fraction Field" }).waitFor();
    await frame.getByRole("button", { name: "Show answer" }).click();
    await frame.getByText("Synthetic check passed").waitFor();
    await page.goto(`${origin}/admin?section=games`);
    for (const label of ["Validate package", "Mark ready for review", "Publish game"]) {
      await page.getByRole("button", { name: label, exact: true }).first().click();
      await page.waitForURL(/package=updated/);
      await captureRunAuditRows(fixture);
    }
    await page.getByLabel("MathNexa ZIP package").setInputFiles({ name: "synthetic-game-v2.zip", mimeType: "application/zip", buffer: gameArchive(runId, "1.1.0") });
    await page.getByRole("button", { name: "Upload and validate package" }).click();
    await expectAdminResult(page, "package", "saved", "game-v2-upload-result");
    const gameV2 = await admin.from("game_packages").select("id,resource_id")
      .eq("created_by", adminId).eq("package_version", "1.1.0").single();
    if (gameV2.error) throw new Error("game-v2-missing");
    addRunEntityTargets(fixture, gameV2.data.id, gameV2.data.resource_id);
    await captureRunAuditRows(fixture);
    for (const label of ["Validate package", "Mark ready for review", "Publish game"]) {
      await page.getByRole("button", { name: label, exact: true }).first().click();
      await page.waitForURL(/package=updated/);
      await captureRunAuditRows(fixture);
    }
    const v1 = page.locator("article").filter({ hasText: "v1.0.0" });
    await v1.getByRole("button", { name: "Restore this published version" }).click();
    await page.waitForURL(/package=rolled-back/);
    await collectRunEntityTargets(fixture);
    await captureRunAuditRows(fixture);
    await page.getByLabel("Order in lesson").fill("14");
    await page.getByLabel("MathNexa ZIP package").setInputFiles({ name: "unsafe-game.zip", mimeType: "application/zip", buffer: gameArchive(runId, "1.0.0", true) });
    await page.getByRole("button", { name: "Upload and validate package" }).click();
    await expectAdminResult(page, "package", "quarantined", "unsafe-game-upload-result");
    await collectRunEntityTargets(fixture);
    await captureRunAuditRows(fixture);
    const quarantinedZip = await admin.from("game_package_quarantine_events").select("id", { count: "exact", head: true });
    check((quarantinedZip.count ?? 0) === 1, "unsafe-zip-not-quarantined");
    evidence.game = true;
    evidence.gameRollback = true;
    evidence.zipQuarantine = true;

    await page.goto(`${origin}/admin?section=map-prep`);
    await page.locator('input[name="destinationUrl"]').fill(`https://example.com/mathnexa-map-prep-staging/${runId}`);
    await page.getByLabel("Optional Admin destination URL").fill(`https://admin.example.com/mathnexa-map-prep-staging/${runId}`);
    await page.getByLabel("Open behavior").selectOption("new_tab");
    await page.getByLabel("Enable after publication").check();
    await page.getByRole("button", { name: "Validate and save draft" }).click();
    await page.waitForURL(/map=draft-saved/);
    await collectRunEntityTargets(fixture);
    await captureRunAuditRows(fixture);
    await page.getByRole("button", { name: "Mark ready for review" }).click();
    await page.waitForURL(/map=ready_for_review/);
    await captureRunAuditRows(fixture);
    await page.getByRole("button", { name: "Publish destination" }).click();
    await page.waitForURL(/map=published/);
    await captureRunAuditRows(fixture);
    await page.goto(`${origin}/map-prep`);
    const mapLink = page.getByRole("link", { name: "Open MAP Prep" });
    check(await mapLink.getAttribute("href") === "/map-prep/launch", "map-launch-gateway-missing");
    check(await mapLink.getAttribute("target") === "_blank", "map-launch-target-mismatch");
    const audits = await admin.from("admin_audit_log").select("id", { count: "exact", head: true })
      .eq("admin_user_id", adminId).like("action", "admin.cms.%");
    check((audits.count ?? 0) >= 3, "map-audit-missing");
    evidence.mapPrep = true;
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
  return { userId, adminId };
}

async function collectRunObjectPaths(adminId) {
  const paths = new Map(PHASE8_MANAGED_BUCKET_IDS.map((id) => [id, new Set()]));
  if (!adminId) return paths;
  const resources = await admin.from("content_resources").select("id").eq("created_by", adminId);
  if (resources.error) throw new Error("cleanup-resource-inventory-failed");
  const resourceIds = resources.data.map((row) => row.id);
  if (resourceIds.length > 0) {
    const files = await admin.from("resource_files").select("bucket_id,object_path").in("resource_id", resourceIds);
    if (files.error) throw new Error("cleanup-resource-file-inventory-failed");
    for (const file of files.data) paths.get(file.bucket_id)?.add(file.object_path);
  }
  const packages = await admin.from("game_packages").select("id").eq("created_by", adminId);
  if (packages.error) throw new Error("cleanup-package-inventory-failed");
  const packageIds = packages.data.map((row) => row.id);
  if (packageIds.length > 0) {
    const assets = await admin.from("game_package_assets").select("object_path").in("package_id", packageIds);
    if (assets.error) throw new Error("cleanup-package-asset-inventory-failed");
    for (const asset of assets.data) paths.get("game-packages").add(asset.object_path);
  }
  const quarantinedPackages = await admin.from("game_package_quarantine_events").select("object_path").eq("created_by", adminId);
  if (quarantinedPackages.error) throw new Error("cleanup-package-quarantine-inventory-failed");
  for (const item of quarantinedPackages.data) if (item.object_path) paths.get("game-package-quarantine").add(item.object_path);
  const media = await admin.from("cms_media_assets").select("id").eq("created_by", adminId);
  if (media.error) throw new Error("cleanup-media-inventory-failed");
  const mediaIds = media.data.map((row) => row.id);
  if (mediaIds.length > 0) {
    const versions = await admin.from("cms_media_versions").select("bucket_id,original_path,derivative_path").in("media_asset_id", mediaIds);
    if (versions.error) throw new Error("cleanup-media-version-inventory-failed");
    for (const version of versions.data) {
      paths.get(version.bucket_id)?.add(version.original_path);
      if (version.derivative_path) paths.get(version.bucket_id)?.add(version.derivative_path);
    }
  }
  return paths;
}

async function removeRunObjects(paths) {
  for (const [bucket, values] of paths) {
    const objectPaths = [...values];
    for (let offset = 0; offset < objectPaths.length; offset += 100) {
      const removed = await admin.storage.from(bucket).remove(objectPaths.slice(offset, offset + 100));
      if (removed.error) throw new Error(`cleanup-${bucket}-failed`);
    }
  }
}

function assertSameCounts(before, after, label) {
  check(before.authUsers === after.authUsers, `${label}-auth-count-changed`);
  check(before.mfaFactors === after.mfaFactors, `${label}-mfa-count-changed`);
  for (const [table, count] of Object.entries(before.counts)) {
    check(after.counts[table] === count, `${label}-${table}-count-changed`);
  }
}

async function deleteSyntheticAuthUser(runId, knownUserId) {
  const email = syntheticOwnerEmail(runId);
  const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (users.error) throw new Error("cleanup-auth-list-failed");
  const matches = users.data.users.filter((user) => user.email?.toLowerCase() === email);
  check(matches.length <= 1, "cleanup-auth-owner-not-unique");
  const userId = matches[0]?.id ?? knownUserId;
  if (matches.length === 0 && !knownUserId) return;
  const deleted = await admin.auth.admin.deleteUser(userId);
  if (deleted.error && !/not found/i.test(deleted.error.message)) throw new Error("cleanup-auth-delete-failed");
}

async function targetedCleanup(runId, fixture, baseline, baselineBuckets, baselineUnrelated) {
  const auditScope = await freezeRunAuditScope(fixture);
  const paths = await collectRunObjectPaths(fixture.adminId);
  await removeRunObjects(paths);
  await managementQuery(buildTargetedCleanupSql(runId, auditScope));
  await deleteSyntheticAuthUser(runId, fixture.userId);
  const first = await inventory();
  assertSameCounts(baseline, first, "targeted-cleanup");
  const firstBuckets = await bucketState();
  assertUnchangedFingerprint(baselineBuckets.inspection.fingerprint, firstBuckets.inspection.fingerprint, "targeted-cleanup-buckets");
  check(firstBuckets.inspection.cleanupToZero, "targeted-cleanup-objects-not-zero");
  assertUnchangedFingerprint(baselineUnrelated, await unrelatedFingerprint(), "targeted-cleanup-unrelated");

  await managementQuery(buildTargetedCleanupSql(runId, auditScope));
  await deleteSyntheticAuthUser(runId, null);
  const second = await inventory();
  assertSameCounts(baseline, second, "idempotent-cleanup");
  const secondBuckets = await bucketState();
  assertUnchangedFingerprint(firstBuckets.inspection.fingerprint, secondBuckets.inspection.fingerprint, "idempotent-cleanup-buckets");
  check(secondBuckets.inspection.cleanupToZero, "idempotent-cleanup-objects-not-zero");
  assertUnchangedFingerprint(baselineUnrelated, await unrelatedFingerprint(), "idempotent-cleanup-unrelated");
  return {
    authUsers: second.authUsers,
    mfaFactors: second.mfaFactors,
    capturedAuditRows: auditScope.auditRows.length,
    runRows: Object.values(second.counts).reduce((sum, count) => sum + count, 0),
    managedBucketObjects: Object.values(secondBuckets.objectCounts).reduce((sum, count) => sum + count, 0),
    unknownBuckets: secondBuckets.inspection.unknown.length,
    infrastructureBucketRows: secondBuckets.inspection.infrastructureBucketRows,
    idempotent: true
  };
}

async function main() {
  const evidence = {};
  const runId = randomUUID().replaceAll("-", "");
  const fixture = {
    runId,
    auditRunId: runId,
    startedAt: new Date().toISOString(),
    frozenAt: null,
    userId: null,
    adminId: null,
    auditRows: new Map(),
    entityTargets: new Set()
  };
  let primaryError = null;
  let cleanupError = null;
  let deployment = null;
  let stagingLinked = false;
  let schemaReady = false;
  let baseline = null;
  let baselineBuckets = null;
  let baselineUnrelated = null;
  try {
    cpSync(resolve("supabase"), join(supabaseWork, "supabase"), { recursive: true });
    supabase(["link", "--project-ref", projectRef]);
    stagingLinked = true;
    await ensureHostedSchema(evidence);
    schemaReady = true;
    baselineBuckets = await bucketState();
    check(baselineBuckets.inspection.cleanupToZero, "staging-baseline-storage-not-zero");
    baseline = await inventory();
    requireZero(baseline, "staging-baseline");
    baselineUnrelated = await unrelatedFingerprint();
    upsertEnvironment("MVH_ADMIN_ENABLED", "true");
    upsertEnvironment("MVH_BUILD_ID", candidateTree);
    const project = parseJsonOutput(vercel(["api", `/v9/projects/${projectId}`, "--scope", scope, "--raw"]));
    check(project.id === projectId && project.name === projectName, "staging-vercel-project-mismatch");
    const domainsValue = parseJsonOutput(vercel(["api", `/v9/projects/${projectId}/domains`, "--scope", scope, "--raw"]));
    const domains = Array.isArray(domainsValue) ? domainsValue : domainsValue.domains ?? [];
    check(domains.every((item) => String(item.name ?? item).endsWith(".vercel.app")), "staging-custom-domain-present");
    deployment = findReadyCandidateDeployment();
    if (!deployment) {
      vercel([
        "deploy", ".", "--project", projectName, "--scope", scope, "--prod", "--yes", "--json",
        "--meta", `candidateTree=${candidateTree}`, "--meta", `gitCommitRef=${branch}`
      ]);
      deployment = findReadyCandidateDeployment();
    }
    check(Boolean(deployment.id) && String(deployment.url ?? "").includes("mathnexa-platform-staging"), "staging-deploy-result-invalid");
    await waitForDeployment();
    await verifyContentLifecycle(evidence, runId, fixture);
  } catch (error) {
    primaryError = error;
  } finally {
    if (stagingLinked && schemaReady && baseline && baselineBuckets && baselineUnrelated) {
      try {
        evidence.cleanupCounts = await targetedCleanup(runId, fixture, baseline, baselineBuckets, baselineUnrelated);
        evidence.cleanupToZero = true;
      } catch (error) {
        cleanupError = error;
      }
    }
    rmSync(workRoot, { recursive: true, force: true });
  }
  if (cleanupError) throw new Error(`cleanup-to-zero-failed:${cleanupError.message}`);
  if (primaryError) throw primaryError;
  process.stdout.write(`${JSON.stringify({
    passed: true,
    candidateTree,
    deploymentId: deployment.id ?? deployment.uid,
    deploymentUrl: deployment.url,
    evidence
  }, null, 2)}\n`);
}

await main();
