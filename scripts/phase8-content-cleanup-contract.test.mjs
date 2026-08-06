import assert from "node:assert/strict";
import test from "node:test";

import {
  PHASE8_MANAGED_BUCKETS,
  PHASE8_MANAGED_BUCKET_IDS,
  assertPhase8RunId,
  assertUnchangedFingerprint,
  buildFallbackBucketDeleteSql,
  buildTargetedCleanupSql,
  inspectManagedBucketDefinitions,
  normalizeAuditCleanupScope,
  syntheticOwnerEmail
} from "./phase8-content-cleanup-contract.mjs";

const definitions = PHASE8_MANAGED_BUCKETS.map((bucket) => ({
  id: bucket.id,
  name: bucket.id,
  public: false,
  file_size_limit: bucket.fileSizeLimit,
  allowed_mime_types: bucket.allowedMimeTypes
}));
const emptyObjects = Object.fromEntries(PHASE8_MANAGED_BUCKET_IDS.map((id) => [id, 0]));
const auditId = "11111111-1111-4111-8111-111111111111";
const auditTarget = "22222222-2222-4222-8222-222222222222";
const catalogEntryId = "33333333-3333-4333-8333-333333333333";
const packageId = "44444444-4444-4444-8444-444444444444";
const resourceId = "55555555-5555-4555-8555-555555555555";
const destinationAuditId = "66666666-6666-4666-8666-666666666666";
const analyticsId = "77777777-7777-4777-8777-777777777777";
function auditScope(runId, overrides = {}) {
  return {
    projectRef: "gcmuhzxkwvfireyrearl",
    runId,
    startedAt: "2026-08-04T12:00:00.000Z",
    frozenAt: "2026-08-04T12:10:00.000Z",
    auditRows: [{ id: auditId, target: auditTarget }],
    catalogRows: [{
      id: catalogEntryId,
      stableKey: `phase10-game-${runId.slice(0, 12)}`,
      launchType: "hosted_package",
      packageId,
      resourceId,
      createdAt: "2026-08-04T12:05:00.000Z"
    }],
    destinationAuditRows: [{
      id: destinationAuditId,
      catalogEntryId,
      recordedAt: "2026-08-04T12:05:01.000Z"
    }],
    analyticsRows: [],
    ...overrides
  };
}

test("managed infrastructure bucket rows are not synthetic residue", () => {
  const result = inspectManagedBucketDefinitions(definitions, emptyObjects);
  assert.equal(result.validDefinitions, true);
  assert.equal(result.cleanupToZero, true);
  assert.equal(result.infrastructureBucketRows, 7);
  assert.equal(result.syntheticResidueCount, 0);
});

test("any object in a managed or quarantine bucket prevents cleanup-to-zero", () => {
  for (const id of PHASE8_MANAGED_BUCKET_IDS) {
    const result = inspectManagedBucketDefinitions(definitions, { ...emptyObjects, [id]: 1 });
    assert.equal(result.cleanupToZero, false, id);
    assert.deepEqual(result.nonEmpty, [id]);
  }
});

test("bucket configuration drift and unknown buckets fail closed", () => {
  const publicBucket = definitions.map((row) => row.id === "resource-files" ? { ...row, public: true } : row);
  assert.deepEqual(inspectManagedBucketDefinitions(publicBucket, emptyObjects).mismatches, ["resource-files"]);
  const unknown = [...definitions, { id: "temporary-unknown", name: "temporary-unknown", public: false, file_size_limit: 1, allowed_mime_types: null }];
  const result = inspectManagedBucketDefinitions(unknown, emptyObjects);
  assert.equal(result.validDefinitions, false);
  assert.deepEqual(result.unknown, ["temporary-unknown"]);
});

test("targeted cleanup is bound to one validated hosted run identity", () => {
  const runId = "a".repeat(32);
  const sql = buildTargetedCleanupSql(runId, auditScope(runId));
  assert.equal(syntheticOwnerEmail(runId), `phase8-content-${runId}@example.invalid`);
  assert.match(sql, new RegExp(`phase8-content-${runId}@example\\.invalid`));
  assert.match(sql, /raw_user_meta_data->>'synthetic_run_id'/);
  assert.match(sql, /created_by in \(select admin_id from phase8_cleanup_admins\)/);
  assert.match(sql, /resource_id in \(select resource_id from phase8_cleanup_resources\)/);
  assert.match(sql, new RegExp(auditId));
  assert.match(sql, new RegExp(auditTarget));
  assert.match(sql, new RegExp(catalogEntryId));
  assert.match(sql, new RegExp(destinationAuditId));
  assert.doesNotMatch(sql, /delete from public\.[a-z_]+\s*;/i);
  assert.throws(() => assertPhase8RunId("unsafe'; delete from auth.users;--"), /invalid-phase8-content-run-id/);
});

test("targeted cleanup contract is deterministic and therefore repeatable", () => {
  const runId = "b".repeat(32);
  assert.equal(buildTargetedCleanupSql(runId, auditScope(runId)), buildTargetedCleanupSql(runId, auditScope(runId)));
});

test("audit allowlist is exact, precedes identity cleanup, and permits a recorded null actor", () => {
  const runId = "c".repeat(32);
  const sql = buildTargetedCleanupSql(runId, auditScope(runId));
  const auditDelete = sql.indexOf("delete from public.admin_audit_log audit using phase8_cleanup_audits");
  assert.ok(auditDelete > 0);
  assert.ok(auditDelete < sql.indexOf("delete from public.content_resources"));
  assert.ok(auditDelete < sql.indexOf("delete from public.admin_sessions"));
  assert.match(sql, /not allowed\.actor_bound and audit\.admin_user_id is not null/);
  assert.doesNotMatch(sql, /delete from public\.admin_audit_log where admin_user_id/);
});

test("Phase 10 aggregate analytics cleanup is one exact run-bound row and remains repeatable", () => {
  const runId = "6".repeat(32);
  const scope = auditScope(runId, {
    requireAnalyticsCleanup: true,
    analyticsRows: [{
      id: analyticsId, runId, metricKey: "map-prep-launch", occurredAt: "2026-08-04T12:06:00.123456+00:00",
      gradeNumber: null, topicSlug: null, lessonSlug: null, outcome: "success", quantity: 1, source: "runtime"
    }]
  });
  const normalized = normalizeAuditCleanupScope(runId, scope);
  assert.deepEqual(normalized.analyticsRows[0], scope.analyticsRows[0]);
  const sql = buildTargetedCleanupSql(runId, scope);
  assert.equal(sql, buildTargetedCleanupSql(runId, scope));
  assert.match(sql, new RegExp(analyticsId));
  assert.match(sql, /delete from public\.platform_analytics_events event using phase8_cleanup_analytics/);
  assert.match(sql, /event\.id=allowed\.event_id and event\.metric_key=allowed\.metric_key and event\.occurred_at=allowed\.occurred_at/);
  assert.match(sql, /event\.grade_number is not distinct from allowed\.grade_number/);
  assert.match(sql, /allowed\.synthetic_run_id='6{32}'/);
  assert.doesNotMatch(sql, /delete from public\.platform_analytics_events where metric_key/i);
});

test("Phase 10 aggregate analytics cleanup rejects empty, malformed, broad, cross-run, and Production scopes", () => {
  const runId = "5".repeat(32);
  const valid = {
    id: analyticsId, runId, metricKey: "map-prep-launch", occurredAt: "2026-08-04T12:06:00.000Z",
    gradeNumber: null, topicSlug: null, lessonSlug: null, outcome: "success", quantity: 1, source: "runtime"
  };
  const normalize = (analyticsRows, overrides = {}) => normalizeAuditCleanupScope(runId, auditScope(runId, {
    requireAnalyticsCleanup: true, analyticsRows, ...overrides
  }));
  assert.throws(() => normalize([]), /explicit-allowlist-required/);
  assert.throws(() => normalize([{ ...valid, runId: "4".repeat(32) }]), /row-invalid/);
  assert.throws(() => normalize([{ ...valid, metricKey: "game-completion" }]), /row-invalid/);
  assert.throws(() => normalize([{ ...valid, gradeNumber: 4 }]), /row-invalid/);
  assert.throws(() => normalize([{ ...valid, occurredAt: "2026-08-04T12:11:00.000Z" }]), /row-invalid/);
  assert.throws(() => normalize([valid], { projectRef: "ioodoktlxvvmghyvevgn" }), /staging-only/);
});

test("destination evidence is exact and deleted before catalog metadata", () => {
  const runId = "8".repeat(32);
  const sql = buildTargetedCleanupSql(runId, auditScope(runId));
  const destinationDelete = sql.indexOf("delete from public.game_catalog_destination_audit audit using phase8_cleanup_destination_audits");
  const catalogVersionDelete = sql.indexOf("delete from public.game_catalog_entry_versions");
  const catalogDelete = sql.indexOf("delete from public.game_catalog_entries where id in");
  assert.ok(destinationDelete > 0);
  assert.ok(destinationDelete < catalogVersionDelete);
  assert.ok(destinationDelete < catalogDelete);
  assert.match(sql, /audit\.id=allowed\.audit_id and audit\.catalog_entry_id=allowed\.catalog_entry_id/);
  assert.match(sql, /phase8_cleanup_unapproved_destination_audit/);
  assert.match(sql, /phase8_cleanup_destination_audit_remaining/);
  assert.match(sql, /disable trigger game_catalog_destination_audit_reject_mutation/);
  assert.match(sql, /enable trigger game_catalog_destination_audit_reject_mutation/);
  assert.doesNotMatch(sql, /on delete cascade/i);
});

test("microsecond provider timestamps remain exact after validation", () => {
  const runId = "7".repeat(32);
  const base = auditScope(runId);
  const scope = auditScope(runId, {
    catalogRows: [{ ...base.catalogRows[0], createdAt: "2026-08-04T12:05:00.123456+00:00" }],
    destinationAuditRows: [{ ...base.destinationAuditRows[0], recordedAt: "2026-08-04T12:05:01.654321+00:00" }]
  });
  const normalized = normalizeAuditCleanupScope(runId, scope);
  assert.equal(normalized.catalogRows[0].createdAt, "2026-08-04T12:05:00.123456+00:00");
  assert.equal(normalized.destinationAuditRows[0].recordedAt, "2026-08-04T12:05:01.654321+00:00");
  assert.match(buildTargetedCleanupSql(runId, scope), /2026-08-04T12:05:00\.123456\+00:00/);
});

test("targetless authentication audits require an exact synthetic actor binding", () => {
  const runId = "9".repeat(32);
  const scope = auditScope(runId, { auditRows: [{ id: auditId, target: null, actorBound: true }] });
  const normalized = normalizeAuditCleanupScope(runId, scope);
  assert.deepEqual(normalized.auditRows[0], { id: auditId, target: null, actorBound: true });
  const sql = buildTargetedCleanupSql(runId, scope);
  assert.match(sql, /null,true/);
  assert.match(sql, /allowed\.actor_bound and audit\.admin_user_id in/);
  assert.throws(() => normalizeAuditCleanupScope(runId, auditScope(runId, {
    auditRows: [{ id: auditId, target: null, actorBound: false }]
  })), /row-invalid/);
});

test("empty, broad, cross-run, duplicate, and Production audit scopes fail closed", () => {
  const runId = "d".repeat(32);
  assert.throws(() => normalizeAuditCleanupScope(runId, auditScope(runId, { auditRows: [] })), /explicit-allowlist-required/);
  assert.throws(() => normalizeAuditCleanupScope(runId, auditScope(runId, { projectRef: "hdtnbuowvdjwnkdqtdbv" })), /staging-only/);
  assert.throws(() => normalizeAuditCleanupScope(runId, auditScope("e".repeat(32))), /run-mismatch/);
  assert.throws(() => normalizeAuditCleanupScope(runId, auditScope(runId, { auditRows: [
    { id: auditId, target: auditTarget }, { id: auditId, target: "unrelated" }
  ] })), /row-invalid/);
  assert.throws(() => normalizeAuditCleanupScope(runId, auditScope(runId, { frozenAt: "2026-08-05T12:00:00.000Z" })), /window-invalid/);
  assert.throws(() => normalizeAuditCleanupScope(runId, auditScope(runId, { catalogRows: [] })), /empty-allowlist-mismatch/);
  assert.throws(() => normalizeAuditCleanupScope(runId, auditScope(runId, { destinationAuditRows: [] })), /empty-allowlist-mismatch/);
  assert.throws(() => normalizeAuditCleanupScope(runId, auditScope(runId, { catalogRows: undefined })), /explicit-allowlists-required/);
  assert.throws(() => normalizeAuditCleanupScope(runId, auditScope(runId, {
    destinationAuditRows: [{ id: destinationAuditId, catalogEntryId: "77777777-7777-4777-8777-777777777777", recordedAt: "2026-08-04T12:05:01.000Z" }]
  })), /destination-audit-invalid/);
  assert.throws(() => normalizeAuditCleanupScope(runId, auditScope(runId, {
    destinationAuditRows: [{ id: destinationAuditId, catalogEntryId, recordedAt: "2026-08-04T12:11:00.000Z" }]
  })), /destination-audit-invalid/);
});

test("rows from another run or unrelated audit IDs are absent from exact cleanup SQL", () => {
  const runId = "f".repeat(32);
  const sql = buildTargetedCleanupSql(runId, auditScope(runId));
  assert.doesNotMatch(sql, /77777777-7777-4777-8777-777777777777/);
  assert.match(sql, /audit\.id=allowed\.audit_id and audit\.target is not distinct from allowed\.expected_target/);
});

test("unrelated fingerprints must remain byte-for-byte stable", () => {
  const fingerprint = inspectManagedBucketDefinitions(definitions, emptyObjects).fingerprint;
  assert.equal(assertUnchangedFingerprint(fingerprint, fingerprint), true);
  assert.throws(() => assertUnchangedFingerprint(fingerprint, "0".repeat(64)), /unrelated-data-fingerprint-changed/);
});

test("fallback deletes only the seven allowlisted definitions after zero-object guards", () => {
  const sql = buildFallbackBucketDeleteSql();
  assert.match(sql, /phase8_fallback_managed_bucket_not_empty/);
  assert.match(sql, /phase8_fallback_unknown_bucket_present/);
  assert.match(sql, /delete from storage\.buckets where id in/);
  for (const id of PHASE8_MANAGED_BUCKET_IDS) assert.match(sql, new RegExp(`'${id}'`));
  assert.doesNotMatch(sql, /delete from storage\.objects/i);
  assert.doesNotMatch(sql, /delete from storage\.buckets\s*;/i);
});
