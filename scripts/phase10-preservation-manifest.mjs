import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const PHASE10_MANIFEST_VERSION = "phase10-preservation-v1";

export const PHASE10_MANIFEST_COMPONENTS = Object.freeze({
  auth_identity: Object.freeze([
    "auth.users", "auth.mfa_factors", "public.consumer_accounts", "public.teacher_profiles",
    "private.platform_identity_policy"
  ]),
  admin_identity_sessions: Object.freeze([
    "public.admin_users", "public.admin_sessions", "public.admin_mfa_challenges", "public.admin_auth_rate_limits"
  ]),
  owner_account_governance: Object.freeze([
    "public.admin_account_operations", "public.admin_user_support_notes", "public.consumer_account_deletion_requests",
    "public.account_deletion_requests", "public.consumer_complimentary_entitlements", "public.teacher_classes",
    "public.teacher_activities", "private.account_deletion_audit"
  ]),
  billing_commercial: Object.freeze([
    "public.billing_customers", "public.billing_subscriptions", "public.billing_webhook_events",
    "public.consumer_commercial_acceptances", "public.consumer_checkout_acceptance_bindings",
    "public.consumer_refund_requests"
  ]),
  entitlements_products: Object.freeze([
    "public.products", "public.product_entitlements", "public.consumer_game_entitlements",
    "private.product_capability_policy"
  ]),
  games_catalog: Object.freeze([
    "public.game_external_allowed_hosts", "public.game_catalog_entries", "public.game_catalog_entry_versions",
    "public.game_catalog_destination_audit"
  ]),
  game_packages: Object.freeze([
    "public.game_packages", "public.game_package_assets", "public.game_package_quarantine_events",
    "public.game_launch_events"
  ]),
  taxonomy: Object.freeze([
    "public.content_grades", "public.content_topics", "public.content_lessons"
  ]),
  homework_quiz_resources: Object.freeze([
    "public.content_resources", "public.content_resource_versions", "public.lesson_resource_assignments",
    "public.topic_resource_assignments", "public.resource_files", "public.resource_download_events"
  ]),
  map_prep_cms: Object.freeze([
    "public.cms_documents", "public.cms_document_versions"
  ]),
  media_analytics: Object.freeze([
    "public.cms_media_assets", "public.cms_media_versions", "public.cms_media_usage",
    "public.platform_analytics_events"
  ]),
  operations_audit: Object.freeze([
    "public.admin_audit_log", "public.platform_feature_flags", "public.platform_feature_flag_history",
    "public.platform_retention_runs"
  ])
});

const SENSITIVE_KEY = /(?:email|password|token|secret|payment|stripe|setup_intent|customer_id|subscription_id|invoice|charge|card|ip_address|user_agent|signed_url|destination_url|admin_destination_url|\burl\b|href)/i;
const IDENTIFIER_KEY = /^(?:id|user_id|owner_user_id|admin_user_id|teacher_id|profile_id|session_id|resource_id|package_id|catalog_entry_id|document_id|media_asset_id|factor_id|target_user_id|created_by|updated_by|revoked_by|granted_by_admin_id|owner_teacher_id|owner_consumer_id)$/i;
const UTC_TIMESTAMP = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(?:Z|\+00:00)$/;

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function normalizeTimestamp(value) {
  const match = UTC_TIMESTAMP.exec(value);
  if (!match) return value;
  return `${match[1]}.${(match[2] ?? "").padEnd(6, "0").slice(0, 6)}Z`;
}

export function normalizeManifestValue(value, key = "") {
  if (value === null) return null;
  if (Array.isArray(value)) return value.map((entry) => normalizeManifestValue(entry));
  if (typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((name) => [name, normalizeManifestValue(value[name], name)]));
  }
  if (typeof value !== "string") return value;
  const normalized = normalizeTimestamp(value);
  if (SENSITIVE_KEY.test(key) || IDENTIFIER_KEY.test(key)) return `sha256:${sha256(normalized)}`;
  return normalized;
}

export function canonicalJson(value) {
  return JSON.stringify(normalizeManifestValue(value));
}

export function hashCanonical(value) {
  return sha256(canonicalJson(value));
}

export function buildPhase10Manifest({
  projectRef, productionProjectRef, candidateTree, gitHead, syntheticRunId, capturedAt,
  tableSnapshots, bucketDefinitions, storageObjects
}) {
  if (!/^[a-z]{20}$/.test(projectRef) || projectRef === productionProjectRef) throw new Error("phase10-manifest-staging-project-guard");
  if (!/^[a-f0-9]{40}$/.test(candidateTree) || !/^[a-f0-9]{40}$/.test(gitHead)) throw new Error("phase10-manifest-git-state-invalid");
  if (!/^[a-f0-9]{32}$/.test(syntheticRunId)) throw new Error("phase10-manifest-run-id-invalid");
  const timestamp = normalizeTimestamp(capturedAt);
  if (!UTC_TIMESTAMP.test(timestamp)) throw new Error("phase10-manifest-timestamp-invalid");

  const byTable = new Map(tableSnapshots.map((table) => [`${table.schema}.${table.table}`, table]));
  const components = Object.entries(PHASE10_MANIFEST_COMPONENTS).map(([name, tables]) => {
    const normalizedTables = tables.map((qualifiedName) => {
      const snapshot = byTable.get(qualifiedName);
      if (!snapshot) throw new Error(`phase10-manifest-table-missing:${qualifiedName}`);
      const normalizedRows = normalizeManifestValue(snapshot.rows ?? []);
      const normalized = {
        schema: snapshot.schema,
        table: snapshot.table,
        present: snapshot.present === true,
        primary_key: [...(snapshot.primaryKey ?? [])],
        row_count: Number(snapshot.rowCount),
        rows: normalizedRows
      };
      if (normalized.row_count !== normalized.rows.length) throw new Error(`phase10-manifest-row-count:${qualifiedName}`);
      return { ...normalized, component_hash: hashCanonical(normalized) };
    });
    return { name, tables: normalizedTables, component_hash: hashCanonical(normalizedTables) };
  });

  const storage = {
    bucket_definitions: normalizeManifestValue(bucketDefinitions),
    object_inventory: normalizeManifestValue(storageObjects)
  };
  storage.bucket_definition_hash = hashCanonical(storage.bucket_definitions);
  storage.object_inventory_hash = hashCanonical(storage.object_inventory);

  const state = {
    manifest_version: PHASE10_MANIFEST_VERSION,
    staging_project_ref: projectRef,
    candidate_tree: candidateTree,
    git_head: gitHead,
    synthetic_run_id: syntheticRunId,
    sequence_policy: "excluded: UUID and server-generated identifiers are compared through normalized durable rows",
    components,
    storage
  };
  return {
    ...state,
    captured_at: timestamp,
    checksum: hashCanonical(state)
  };
}

export function verifyPhase10Manifest(manifest) {
  const state = { ...manifest };
  const checksum = state.checksum;
  delete state.captured_at;
  delete state.checksum;
  if (!/^[a-f0-9]{64}$/.test(checksum ?? "") || hashCanonical(state) !== checksum) {
    throw new Error("phase10-manifest-checksum-invalid");
  }
  return manifest;
}

export function comparePhase10Manifests(before, after) {
  verifyPhase10Manifest(before);
  verifyPhase10Manifest(after);
  const beforeComponents = Object.fromEntries(before.components.map((component) => [component.name, component.component_hash]));
  const afterComponents = Object.fromEntries(after.components.map((component) => [component.name, component.component_hash]));
  const comparison = Object.keys(beforeComponents).sort().map((name) => ({
    name,
    baseline_hash: beforeComponents[name],
    final_hash: afterComponents[name],
    identical: beforeComponents[name] === afterComponents[name]
  }));
  const storageIdentical = before.storage.bucket_definition_hash === after.storage.bucket_definition_hash &&
    before.storage.object_inventory_hash === after.storage.object_inventory_hash;
  return {
    identical: comparison.every((component) => component.identical) && storageIdentical && before.checksum === after.checksum,
    components: comparison,
    storage_identical: storageIdentical
  };
}

export function persistAndVerifyPhase10Manifest(path, manifest) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return verifyPhase10Manifest(JSON.parse(readFileSync(path, "utf8")));
}

export function persistPhase10Certificate(path, certificate) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(normalizeManifestValue(certificate), null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return JSON.parse(readFileSync(path, "utf8"));
}
