import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const migration = read("supabase/migrations/20260805200000_phase10_admin_product_model_alignment.sql");
const identityIdempotency = read("supabase/migrations/20260806100000_phase10_identity_policy_idempotency.sql");
const session = read("apps/platform-web/lib/admin/session.ts");
const adminSignInPage = read("apps/platform-web/app/admin/sign-in/page.tsx");
const repository = read("apps/platform-web/lib/admin/repository.ts");
const destinationHealth = read("apps/platform-web/lib/admin/external-destination-health.ts");
const gameUpload = read("apps/platform-web/app/admin/games/upload/route.ts");
const mapSave = read("apps/platform-web/app/admin/map-prep/save/route.ts");
const hosted = read("scripts/run-phase10-hosted-staging.mjs");
const hostedInvoker = read("scripts/invoke-phase10-hosted-staging.ps1");
const mapRedirectContract = read("scripts/phase10-map-prep-redirect-contract.mjs");
const preservationManifest = read("scripts/phase10-preservation-manifest.mjs");
const cleanupContract = read("scripts/phase8-content-cleanup-contract.mjs");

for (const contract of [
  "create table if not exists public.admin_mfa_challenges",
  "alter table public.admin_mfa_challenges force row level security",
  "start_admin_mfa_challenge",
  "consume_admin_mfa_challenge",
  "create table if not exists public.game_catalog_entry_versions",
  "alter table public.game_catalog_entry_versions force row level security",
  "create_external_game_catalog_entry",
  "revise_scoped_content_resource",
  "convert_legacy_quiz_to_topic_scope",
  "Only one current published Quiz is allowed per Topic",
  "Archive Topics before archiving this Grade",
  "Referenced Topic cannot be archived",
  "Referenced Lesson cannot be archived"
]) {
  if (!migration.includes(contract)) throw new Error(`Phase 10 migration contract is missing: ${contract}`);
}

if (!repository.includes('rpc("start_admin_mfa_challenge"') || !repository.includes('rpc("consume_admin_mfa_challenge"')) {
  throw new Error("Admin first-factor challenges are not mediated by bounded server RPCs.");
}
for (const contract of [
  "identity_model is distinct from p_identity_model", "ensure_platform_identity_model",
  "for update", "identity_model_concurrent_change", "return false"
]) {
  if (!identityIdempotency.includes(contract)) throw new Error(`Identity-policy idempotency contract is missing: ${contract}`);
}
if (!session.includes('httpOnly: true') || !session.includes('sameSite: "strict"') || !session.includes('path: "/admin"')) {
  throw new Error("Admin pending/session cookies are not server-only, strict, and path-bounded.");
}
if (!adminSignInPage.includes('export const dynamic = "force-dynamic"') || !adminSignInPage.includes('preliminary.state === "disabled"') || !adminSignInPage.includes("notFound()")) {
  throw new Error("Admin sign-in does not conceal itself immediately when the server-owned emergency flag is enabled.");
}
if (!destinationHealth.includes("lookup(") || !destinationHealth.includes("all: true") || !destinationHealth.includes("redirect: \"manual\"") || !destinationHealth.includes("parseExternalGameDestination")) {
  throw new Error("External Admin destinations lack DNS, no-redirect, and HTTPS validation.");
}
if (!gameUpload.includes("inspectGameArchive") || !mapSave.includes("checkAdminExternalDestination")) {
  throw new Error("Package or MAP mutations bypass their server-side safety boundary.");
}
for (const contract of [
  'projectRef = "gcmuhzxkwvfireyrearl"', 'projectName = "mathnexa-platform-staging"',
  "buildTargetedCleanupSql", "cleanupToZero", "cleanupIdempotent", "preservationFingerprint",
  "collectCatalogCleanupScope", "destinationAuditRows", "PHASE10_CLEANUP_RUN_ID",
  'supabase(["test","db","--linked"])', "admin-emergency-disabled", "captureDurableManifest",
  "comparePhase10Manifests", "preservation-certificate.json", "syntheticResidueSummary"
  , "ensure_platform_identity_model", "identity-policy-noop-mutated-state", "collectAnalyticsCleanupScope",
  "PHASE10_REPAIR_MANIFEST_RUN_ID", "repairStagingBaseline", "response.status !== 429", "retry-after"
]) {
  if (!hosted.includes(contract)) throw new Error(`Hosted Phase 10 safety contract is missing: ${contract}`);
}
if (hosted.indexOf("await removeObjects(paths);cleanupSql=buildTargetedCleanupSql") < 0) {
  throw new Error("Hosted cleanup must remove exact Storage objects before deleting their metadata.");
}
for (const contract of [
  "phase8_cleanup_analytics", "event.id=allowed.event_id", "event.occurred_at=allowed.occurred_at",
  "allowed.synthetic_run_id", "phase10_cleanup_analytics_allowlist_mismatch"
]) {
  if (!cleanupContract.includes(contract)) throw new Error(`Exact analytics cleanup contract is missing: ${contract}`);
}
if (/delete from public\.platform_analytics_events where metric_key/i.test(cleanupContract)) {
  throw new Error("Aggregate analytics cleanup must never use a metric-wide predicate.");
}
for (const contract of [
  "PHASE10_MANIFEST_COMPONENTS", "phase10-manifest-staging-project-guard", "captured_at",
  "component_hash", "bucket_definition_hash", "object_inventory_hash", "flag: \"wx\"",
  "phase10-manifest-checksum-invalid", "SENSITIVE_KEY", "IDENTIFIER_KEY"
]) {
  if (!preservationManifest.includes(contract)) throw new Error(`Phase 10 preservation manifest contract is missing: ${contract}`);
}
if (!hosted.includes('productionProjectRef = "ioodoktlxvvmghyvevgn"') || !hosted.includes("projectRef!==productionProjectRef")) {
  throw new Error("Hosted manifest capture lacks the explicit Production project guard.");
}
if (!hosted.includes('.eq("package_version","1.0.0").order("created_at",{ascending:false}).limit(1).single()')) {
  throw new Error("Hosted rollback verification must select the latest restored package deterministically.");
}
if (!hosted.includes('page.locator("#add-games .admin-launch-choice select").selectOption("external_https")') || hosted.includes('page.getByLabel("Launch type")')) {
  throw new Error("Hosted external-game verification must scope Launch type to the add-game form.");
}
if (!hosted.includes('mapForm.locator(\'[name="destinationUrl"]\')') || hosted.includes('page.getByLabel("Destination URL")')) {
  throw new Error("Hosted MAP Prep verification must scope destination controls to the editor form.");
}
for (const contract of ["assertMapPrepLaunchRedirect", "assertMapPrepDestinationRedirect", "commercialWriteCounts", "maxRedirects:0"]) {
  if (!hosted.includes(contract)) throw new Error(`Hosted MAP Prep redirect verification is missing: ${contract}`);
}
if (hosted.includes('getByRole("link",{name:"Open MAP Prep"})')) throw new Error("Hosted MAP Prep verification still requires the stale visible link.");
for (const contract of ["302, 303, 307, 308", "actual.hostname", "actual.pathname", "actual.search", "actual.port"]) {
  if (!mapRedirectContract.includes(contract)) throw new Error(`MAP Prep redirect contract is incomplete: ${contract}`);
}
if (hosted.includes("hdtnbuowvdjwnkdqtdbv") || hosted.includes("mathnexa-platform-production")) {
  throw new Error("Hosted cleanup must remain isolated from Production resources.");
}
if (!hostedInvoker.includes("feature/admin-product-model-alignment") || !hostedInvoker.includes("git write-tree") || !hostedInvoker.includes("git diff --cached --quiet")) {
  throw new Error("Hosted Phase 10 invocation does not freeze the staged feature candidate.");
}

const mutationSources = execFileSync("git", ["ls-files", "apps/platform-web/app/admin/**/route.ts"], { encoding: "utf8" })
  .split(/\r?\n/).filter(Boolean).map(read).join("\n");
for (const forbidden of ["createBrowserSupabaseClient", "localStorage", "document.cookie"]) {
  if (mutationSources.includes(forbidden)) throw new Error(`Browser authority reached an Admin mutation: ${forbidden}`);
}
if (mutationSources.includes("buildTargetedCleanupSql") || /delete\s+from\s+public\.game_catalog_destination_audit/i.test(mutationSources)) {
  throw new Error("No application route may expose staging audit cleanup authority.");
}

const protectedHashes = new Map([
  ["docs/index.html", "7f00ed6789a2faf23b90e96c3dfdee0167aced87beb08dabf10b89c3e72c9fc5"],
  ["docs/vocab.js", "caeb8fbb590fffd8cbc169f88f174a38c26de2d16a7e1b0c1cf5e83ac9f01c46"]
]);
for (const [path, expected] of protectedHashes) {
  const actual = createHash("sha256").update(readFileSync(path)).digest("hex");
  if (actual !== expected) throw new Error(`Protected canonical hash changed: ${path}`);
}

const protectedFiles = [
  "docs/index.html", "docs/vocab.js", "math-word-hunt-v1.html", "math-word-hunt-v2.html",
  "math-word-hunt-v3.html", "math-word-hunt-v4.html", "math-word-hunt-v5.html",
  "docs/index-v5-backup.html", "docs/index-v6-backup.html"
];
const changedProtected = execFileSync("git", ["diff", "--name-only", "HEAD", "--", ...protectedFiles], { encoding: "utf8" }).trim();
if (changedProtected) throw new Error(`Protected game files changed:\n${changedProtected}`);

console.log("Phase 10 security audit passed: first-factor challenges are server-owned and replay-safe, Admin mutations fail closed, external destinations are bounded, RLS is forced, and protected files match.");
