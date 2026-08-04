import { createHash } from "node:crypto";

export const PHASE8_CONTENT_RUN_PATTERN = /^[a-f0-9]{32}$/;

export const PHASE8_MANAGED_BUCKETS = Object.freeze([
  Object.freeze({ id: "admin-assets", fileSizeLimit: 10_485_760, allowedMimeTypes: Object.freeze(["image/jpeg", "image/png", "image/webp"]) }),
  Object.freeze({ id: "resource-files", fileSizeLimit: 20_971_520, allowedMimeTypes: Object.freeze(["application/pdf", "image/jpeg", "image/png", "image/webp"]) }),
  Object.freeze({ id: "resource-quarantine", fileSizeLimit: 20_971_520, allowedMimeTypes: Object.freeze(["application/octet-stream", "application/pdf"]) }),
  Object.freeze({ id: "game-packages", fileSizeLimit: 20_971_520, allowedMimeTypes: null }),
  Object.freeze({ id: "game-package-quarantine", fileSizeLimit: 26_214_400, allowedMimeTypes: Object.freeze(["application/octet-stream", "application/zip"]) }),
  Object.freeze({ id: "cms-media", fileSizeLimit: 20_971_520, allowedMimeTypes: Object.freeze(["application/pdf", "audio/mpeg", "audio/ogg", "audio/wav", "image/jpeg", "image/png", "image/webp"]) }),
  Object.freeze({ id: "cms-media-quarantine", fileSizeLimit: 20_971_520, allowedMimeTypes: Object.freeze(["application/octet-stream"]) })
]);

export const PHASE8_MANAGED_BUCKET_IDS = Object.freeze(PHASE8_MANAGED_BUCKETS.map((bucket) => bucket.id));

function bucketValue(row, snake, camel) {
  return row?.[snake] ?? row?.[camel] ?? null;
}

function normalizedMimeTypes(value) {
  if (value === null || value === undefined) return null;
  return [...value].map(String).sort();
}

export function normalizedBucketDefinition(row) {
  return Object.freeze({
    id: String(row?.id ?? ""),
    name: String(row?.name ?? ""),
    public: row?.public === true,
    fileSizeLimit: Number(bucketValue(row, "file_size_limit", "fileSizeLimit")),
    allowedMimeTypes: normalizedMimeTypes(bucketValue(row, "allowed_mime_types", "allowedMimeTypes"))
  });
}

export function inspectManagedBucketDefinitions(rows, objectCounts = {}, { requireNoUnknown = true } = {}) {
  const normalized = [...rows].map(normalizedBucketDefinition).sort((left, right) => left.id.localeCompare(right.id));
  const byId = new Map(normalized.map((row) => [row.id, row]));
  const expectedIds = new Set(PHASE8_MANAGED_BUCKET_IDS);
  const missing = PHASE8_MANAGED_BUCKET_IDS.filter((id) => !byId.has(id));
  const unknown = normalized.map((row) => row.id).filter((id) => !expectedIds.has(id));
  const mismatches = [];
  const nonEmpty = [];
  for (const expected of PHASE8_MANAGED_BUCKETS) {
    const actual = byId.get(expected.id);
    if (!actual) continue;
    if (actual.name !== expected.id || actual.public || actual.fileSizeLimit !== expected.fileSizeLimit ||
      JSON.stringify(actual.allowedMimeTypes) !== JSON.stringify(expected.allowedMimeTypes)) {
      mismatches.push(expected.id);
    }
    if (Number(objectCounts[expected.id] ?? 0) !== 0) nonEmpty.push(expected.id);
  }
  const validDefinitions = missing.length === 0 && mismatches.length === 0 && (!requireNoUnknown || unknown.length === 0);
  return Object.freeze({
    validDefinitions,
    cleanupToZero: validDefinitions && nonEmpty.length === 0,
    missing: Object.freeze(missing),
    unknown: Object.freeze(unknown),
    mismatches: Object.freeze(mismatches),
    nonEmpty: Object.freeze(nonEmpty),
    infrastructureBucketRows: PHASE8_MANAGED_BUCKET_IDS.length,
    syntheticResidueCount: nonEmpty.length,
    fingerprint: createHash("sha256").update(JSON.stringify(normalized)).digest("hex")
  });
}

export function assertUnchangedFingerprint(before, after, label = "unrelated-data") {
  if (typeof before !== "string" || before.length < 8 || before !== after) {
    throw new Error(`${label}-fingerprint-changed`);
  }
  return true;
}

export function assertPhase8RunId(runId) {
  if (!PHASE8_CONTENT_RUN_PATTERN.test(runId)) throw new Error("invalid-phase8-content-run-id");
  return runId;
}

export function syntheticOwnerEmail(runId) {
  return `phase8-content-${assertPhase8RunId(runId)}@example.invalid`;
}

const STAGING_PROJECT_REF = "gcmuhzxkwvfireyrearl";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function normalizeAuditCleanupScope(runId, scope) {
  const validatedRunId = assertPhase8RunId(runId);
  if (scope?.projectRef !== STAGING_PROJECT_REF) throw new Error("phase8-audit-cleanup-staging-only");
  if (scope?.runId !== validatedRunId) throw new Error("phase8-audit-cleanup-run-mismatch");
  if (!Array.isArray(scope.auditRows) || scope.auditRows.length === 0 || scope.auditRows.length > 500) {
    throw new Error("phase8-audit-cleanup-explicit-allowlist-required");
  }
  const startedAt = new Date(scope.startedAt);
  const frozenAt = new Date(scope.frozenAt);
  if (!Number.isFinite(startedAt.valueOf()) || !Number.isFinite(frozenAt.valueOf()) ||
    startedAt >= frozenAt || frozenAt.valueOf() - startedAt.valueOf() > 3_600_000) {
    throw new Error("phase8-audit-cleanup-window-invalid");
  }
  const seen = new Set();
  const auditRows = scope.auditRows.map((row) => {
    const id = String(row?.id ?? "").toLowerCase();
    const actorBound = row?.actorBound === true;
    const target = row?.target === null || row?.target === undefined ? null : String(row.target);
    if (!UUID_PATTERN.test(id) || seen.has(id) || (!actorBound && target === null) || (target !== null && (target.length < 1 || target.length > 160))) {
      throw new Error("phase8-audit-cleanup-row-invalid");
    }
    seen.add(id);
    return Object.freeze({ id, target, actorBound });
  });
  return Object.freeze({
    runId: validatedRunId,
    projectRef: STAGING_PROJECT_REF,
    startedAt: startedAt.toISOString(),
    frozenAt: frozenAt.toISOString(),
    auditRows: Object.freeze(auditRows)
  });
}

export function buildTargetedCleanupSql(runId, scope) {
  const auditScope = normalizeAuditCleanupScope(runId, scope);
  const email = syntheticOwnerEmail(runId);
  const auditValues = auditScope.auditRows
    .map((row) => `(${sqlLiteral(row.id)}::uuid,${row.target === null ? "null" : sqlLiteral(row.target)},${row.actorBound})`)
    .join(",");
  return `begin;
lock table public.admin_users, public.admin_sessions, public.admin_audit_log,
  public.content_grades, public.content_topics, public.content_lessons,
  public.content_resources, public.content_resource_versions, public.lesson_resource_assignments,
  public.resource_files, public.resource_download_events, public.game_packages,
  public.game_package_assets, public.game_package_quarantine_events, public.game_launch_events,
  public.cms_documents, public.cms_document_versions, public.cms_media_assets,
  public.cms_media_versions, public.cms_media_usage in share row exclusive mode;

create temp table phase8_cleanup_users(user_id uuid primary key) on commit drop;
insert into phase8_cleanup_users
select id from auth.users where lower(email) = '${email}'
  and raw_user_meta_data->>'synthetic_run_id' = '${auditScope.runId}';

do $$
begin
  if (select count(*) from phase8_cleanup_users) > 1 then
    raise exception 'phase8_cleanup_owner_not_unique';
  end if;
end $$;

create temp table phase8_cleanup_admins(admin_id uuid primary key) on commit drop;
insert into phase8_cleanup_admins
select id from public.admin_users where user_id in (select user_id from phase8_cleanup_users);

create temp table phase8_cleanup_resources(resource_id uuid primary key) on commit drop;
insert into phase8_cleanup_resources
select id from public.content_resources where created_by in (select admin_id from phase8_cleanup_admins);

create temp table phase8_cleanup_documents(document_id uuid primary key) on commit drop;
insert into phase8_cleanup_documents
select id from public.cms_documents where created_by in (select admin_id from phase8_cleanup_admins);

create temp table phase8_cleanup_media(media_id uuid primary key) on commit drop;
insert into phase8_cleanup_media
select id from public.cms_media_assets where created_by in (select admin_id from phase8_cleanup_admins);

create temp table phase8_cleanup_audits(audit_id uuid primary key, expected_target text, actor_bound boolean not null) on commit drop;
insert into phase8_cleanup_audits(audit_id,expected_target,actor_bound) values ${auditValues};

alter table public.content_resource_versions disable trigger content_resource_version_immutable;
alter table public.content_resources disable trigger content_resource_no_published_delete;
alter table public.cms_document_versions disable trigger cms_published_versions_immutable;
alter table public.admin_audit_log disable trigger admin_audit_log_reject_mutation;
alter table public.admin_user_support_notes disable trigger admin_user_support_notes_immutable;
alter table public.platform_feature_flag_history disable trigger platform_feature_flag_history_immutable;
alter table public.platform_retention_runs disable trigger platform_retention_runs_immutable;

do $$
begin
  if exists(
    select 1 from public.admin_audit_log audit
    join phase8_cleanup_audits allowed on allowed.audit_id=audit.id
    where audit.created_at < ${sqlLiteral(auditScope.startedAt)}::timestamptz
      or audit.created_at > ${sqlLiteral(auditScope.frozenAt)}::timestamptz
      or audit.target is distinct from allowed.expected_target
      or (allowed.actor_bound and audit.admin_user_id not in (select admin_id from phase8_cleanup_admins))
      or (not allowed.actor_bound and audit.admin_user_id is not null)
  ) then raise exception 'phase8_cleanup_audit_allowlist_mismatch'; end if;
end $$;

delete from public.admin_audit_log audit using phase8_cleanup_audits allowed
  where audit.id=allowed.audit_id and audit.target is not distinct from allowed.expected_target
    and ((allowed.actor_bound and audit.admin_user_id in (select admin_id from phase8_cleanup_admins))
      or (not allowed.actor_bound and audit.admin_user_id is null));

delete from public.resource_download_events where resource_file_id in (
  select id from public.resource_files where resource_id in (select resource_id from phase8_cleanup_resources)
);
delete from public.game_launch_events where package_id in (
  select id from public.game_packages where created_by in (select admin_id from phase8_cleanup_admins)
);
delete from public.game_package_assets where package_id in (
  select id from public.game_packages where created_by in (select admin_id from phase8_cleanup_admins)
);
delete from public.game_packages where created_by in (select admin_id from phase8_cleanup_admins) and source_package_id is not null;
delete from public.game_packages where created_by in (select admin_id from phase8_cleanup_admins);
delete from public.game_package_quarantine_events where created_by in (select admin_id from phase8_cleanup_admins);
delete from public.resource_files where resource_id in (select resource_id from phase8_cleanup_resources) and replaces_file_id is not null;
delete from public.resource_files where resource_id in (select resource_id from phase8_cleanup_resources);
delete from public.lesson_resource_assignments where resource_id in (select resource_id from phase8_cleanup_resources);
delete from public.content_resource_versions where resource_id in (select resource_id from phase8_cleanup_resources) and source_version_id is not null;
delete from public.content_resource_versions where resource_id in (select resource_id from phase8_cleanup_resources);
delete from public.content_resources where id in (select resource_id from phase8_cleanup_resources);

delete from public.cms_media_usage where document_id in (select document_id from phase8_cleanup_documents)
  or media_asset_id in (select media_id from phase8_cleanup_media);
delete from public.cms_document_versions where document_id in (select document_id from phase8_cleanup_documents);
delete from public.cms_documents where id in (select document_id from phase8_cleanup_documents);
delete from public.cms_media_versions where media_asset_id in (select media_id from phase8_cleanup_media);
delete from public.cms_media_assets where id in (select media_id from phase8_cleanup_media);

delete from public.content_lessons where created_by in (select admin_id from phase8_cleanup_admins);
delete from public.content_topics where created_by in (select admin_id from phase8_cleanup_admins);
delete from public.content_grades where created_by in (select admin_id from phase8_cleanup_admins);

delete from public.consumer_complimentary_entitlements where owner_user_id in (select user_id from phase8_cleanup_users)
  or granted_by_admin_id in (select admin_id from phase8_cleanup_admins)
  or revoked_by_admin_id in (select admin_id from phase8_cleanup_admins);
delete from public.admin_account_operations where admin_user_id in (select admin_id from phase8_cleanup_admins)
  or target_user_id in (select user_id from phase8_cleanup_users);
delete from public.admin_user_support_notes where admin_user_id in (select admin_id from phase8_cleanup_admins)
  or target_user_id in (select user_id from phase8_cleanup_users);
delete from public.platform_feature_flag_history where admin_user_id in (select admin_id from phase8_cleanup_admins);
delete from public.platform_retention_runs where admin_user_id in (select admin_id from phase8_cleanup_admins);
delete from public.admin_sessions where admin_user_id in (select admin_id from phase8_cleanup_admins);

alter table public.platform_retention_runs enable trigger platform_retention_runs_immutable;
alter table public.platform_feature_flag_history enable trigger platform_feature_flag_history_immutable;
alter table public.admin_user_support_notes enable trigger admin_user_support_notes_immutable;
alter table public.admin_audit_log enable trigger admin_audit_log_reject_mutation;
alter table public.cms_document_versions enable trigger cms_published_versions_immutable;
alter table public.content_resources enable trigger content_resource_no_published_delete;
alter table public.content_resource_versions enable trigger content_resource_version_immutable;
commit;`;
}

export function buildFallbackBucketDeleteSql() {
  const quoted = PHASE8_MANAGED_BUCKET_IDS.map((id) => `'${id}'`).join(",");
  return `begin;
lock table storage.buckets, storage.objects in access exclusive mode;
do $$
begin
  if exists(select 1 from storage.objects where bucket_id in (${quoted})) then
    raise exception 'phase8_fallback_managed_bucket_not_empty';
  end if;
  if exists(select 1 from storage.buckets where id not in (${quoted})) then
    raise exception 'phase8_fallback_unknown_bucket_present';
  end if;
  if (select count(*) from storage.buckets where id in (${quoted})) <> 7 then
    raise exception 'phase8_fallback_bucket_definition_mismatch';
  end if;
end $$;
delete from storage.buckets where id in (${quoted});
do $$
begin
  if exists(select 1 from storage.buckets where id in (${quoted})) then
    raise exception 'phase8_fallback_bucket_delete_incomplete';
  end if;
end $$;
commit;`;
}

export function sanitizeCleanupResult(value) {
  return Object.freeze({
    authUsers: Number(value?.authUsers ?? -1),
    mfaFactors: Number(value?.mfaFactors ?? -1),
    runRows: Number(value?.runRows ?? -1),
    managedBucketObjects: Number(value?.managedBucketObjects ?? -1),
    unknownBuckets: Number(value?.unknownBuckets ?? -1),
    infrastructureBucketRows: Number(value?.infrastructureBucketRows ?? -1)
  });
}
