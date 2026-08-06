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
const PRECISE_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

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
  if (!Array.isArray(scope.catalogRows) || scope.catalogRows.length > 20 ||
      !Array.isArray(scope.destinationAuditRows) || scope.destinationAuditRows.length > 200) {
    throw new Error("phase8-game-cleanup-explicit-allowlists-required");
  }
  if ((scope.catalogRows.length === 0) !== (scope.destinationAuditRows.length === 0)) {
    throw new Error("phase8-game-cleanup-empty-allowlist-mismatch");
  }
  const catalogIds = new Set();
  const catalogRows = scope.catalogRows.map((row) => {
    const id = String(row?.id ?? "").toLowerCase();
    const stableKey = String(row?.stableKey ?? "");
    const launchType = String(row?.launchType ?? "");
    const packageId = row?.packageId === null || row?.packageId === undefined ? null : String(row.packageId).toLowerCase();
    const resourceId = row?.resourceId === null || row?.resourceId === undefined ? null : String(row.resourceId).toLowerCase();
    const preciseCreatedAt = String(row?.createdAt ?? "");
    const createdAt = new Date(preciseCreatedAt);
    if (!UUID_PATTERN.test(id) || catalogIds.has(id) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(stableKey) || stableKey.length > 96 ||
        !["hosted_package", "external_https"].includes(launchType) || !PRECISE_TIMESTAMP_PATTERN.test(preciseCreatedAt) || !Number.isFinite(createdAt.valueOf()) ||
        createdAt < startedAt || createdAt > frozenAt ||
        (launchType === "hosted_package" && (!UUID_PATTERN.test(packageId ?? "") || !UUID_PATTERN.test(resourceId ?? ""))) ||
        (launchType === "external_https" && (packageId !== null || resourceId !== null || stableKey !== `phase10-https-${validatedRunId.slice(0, 8)}`))) {
      throw new Error("phase8-game-cleanup-catalog-row-invalid");
    }
    catalogIds.add(id);
    return Object.freeze({ id, stableKey, launchType, packageId, resourceId, createdAt: preciseCreatedAt });
  });
  const destinationIds = new Set();
  const destinationAuditRows = scope.destinationAuditRows.map((row) => {
    const id = String(row?.id ?? "").toLowerCase();
    const catalogEntryId = String(row?.catalogEntryId ?? "").toLowerCase();
    const preciseRecordedAt = String(row?.recordedAt ?? "");
    const recordedAt = new Date(preciseRecordedAt);
    if (!UUID_PATTERN.test(id) || destinationIds.has(id) || !catalogIds.has(catalogEntryId) ||
        !PRECISE_TIMESTAMP_PATTERN.test(preciseRecordedAt) || !Number.isFinite(recordedAt.valueOf()) || recordedAt < startedAt || recordedAt > frozenAt) {
      throw new Error("phase8-game-cleanup-destination-audit-invalid");
    }
    destinationIds.add(id);
    return Object.freeze({ id, catalogEntryId, recordedAt: preciseRecordedAt });
  });
  for (const id of catalogIds) {
    if (!destinationAuditRows.some((row) => row.catalogEntryId === id)) throw new Error("phase8-game-cleanup-destination-audit-missing");
  }
  const requireAnalyticsCleanup = scope.requireAnalyticsCleanup === true;
  const requestedAnalyticsRows = scope.analyticsRows ?? [];
  if (!Array.isArray(requestedAnalyticsRows) || requestedAnalyticsRows.length > 10 || (requireAnalyticsCleanup && requestedAnalyticsRows.length === 0)) {
    throw new Error("phase10-analytics-cleanup-explicit-allowlist-required");
  }
  const analyticsIds = new Set();
  const analyticsRows = requestedAnalyticsRows.map((row) => {
    const id = String(row?.id ?? "").toLowerCase();
    const syntheticRunId = String(row?.runId ?? "");
    const preciseOccurredAt = String(row?.occurredAt ?? "");
    const occurredAt = new Date(preciseOccurredAt);
    if (!UUID_PATTERN.test(id) || analyticsIds.has(id) || syntheticRunId !== validatedRunId ||
        row?.metricKey !== "map-prep-launch" || row?.gradeNumber !== null || row?.topicSlug !== null ||
        row?.lessonSlug !== null || row?.outcome !== "success" || row?.quantity !== 1 || row?.source !== "runtime" ||
        !PRECISE_TIMESTAMP_PATTERN.test(preciseOccurredAt) || !Number.isFinite(occurredAt.valueOf()) ||
        occurredAt < startedAt || occurredAt > frozenAt) {
      throw new Error("phase10-analytics-cleanup-row-invalid");
    }
    analyticsIds.add(id);
    return Object.freeze({
      id, runId: syntheticRunId, metricKey: "map-prep-launch", occurredAt: preciseOccurredAt,
      gradeNumber: null, topicSlug: null, lessonSlug: null, outcome: "success", quantity: 1, source: "runtime"
    });
  });
  return Object.freeze({
    runId: validatedRunId,
    projectRef: STAGING_PROJECT_REF,
    startedAt: startedAt.toISOString(),
    frozenAt: frozenAt.toISOString(),
    auditRows: Object.freeze(auditRows),
    catalogRows: Object.freeze(catalogRows),
    destinationAuditRows: Object.freeze(destinationAuditRows),
    analyticsRows: Object.freeze(analyticsRows),
    requireAnalyticsCleanup
  });
}

export function buildTargetedCleanupSql(runId, scope) {
  const auditScope = normalizeAuditCleanupScope(runId, scope);
  const email = syntheticOwnerEmail(runId);
  const auditValues = auditScope.auditRows
    .map((row) => `(${sqlLiteral(row.id)}::uuid,${row.target === null ? "null" : sqlLiteral(row.target)},${row.actorBound})`)
    .join(",");
  const catalogValues = auditScope.catalogRows.length ? auditScope.catalogRows.map((row) =>
    `(${sqlLiteral(row.id)}::uuid,${sqlLiteral(row.stableKey)},${sqlLiteral(row.launchType)},${row.packageId ? `${sqlLiteral(row.packageId)}::uuid` : "null"},${row.resourceId ? `${sqlLiteral(row.resourceId)}::uuid` : "null"},${sqlLiteral(row.createdAt)}::timestamptz)`
  ).join(",") : null;
  const destinationAuditValues = auditScope.destinationAuditRows.length ? auditScope.destinationAuditRows.map((row) =>
    `(${sqlLiteral(row.id)}::uuid,${sqlLiteral(row.catalogEntryId)}::uuid,${sqlLiteral(row.recordedAt)}::timestamptz)`
  ).join(",") : null;
  const analyticsValues = auditScope.analyticsRows.length ? auditScope.analyticsRows.map((row) =>
    `(${sqlLiteral(row.id)}::uuid,${sqlLiteral(row.runId)},${sqlLiteral(row.metricKey)},${sqlLiteral(row.occurredAt)}::timestamptz,null::smallint,null::text,null::text,${sqlLiteral(row.outcome)},${row.quantity},${sqlLiteral(row.source)})`
  ).join(",") : null;
  return `begin;
lock table public.admin_users, public.admin_sessions, public.admin_audit_log,
  public.admin_mfa_challenges,
  public.content_grades, public.content_topics, public.content_lessons,
  public.content_resources, public.content_resource_versions, public.lesson_resource_assignments,
  public.topic_resource_assignments, public.game_catalog_entries, public.game_catalog_entry_versions,
  public.game_catalog_destination_audit,
  public.game_external_allowed_hosts,
  public.resource_files, public.resource_download_events, public.game_packages,
  public.game_package_assets, public.game_package_quarantine_events, public.game_launch_events,
  public.cms_documents, public.cms_document_versions, public.cms_media_assets,
  public.cms_media_versions, public.cms_media_usage,
  public.platform_analytics_events in share row exclusive mode;

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

create temp table phase8_cleanup_catalog_allowlist(
  catalog_id uuid primary key,stable_key text not null,launch_type text not null,package_id uuid,resource_id uuid,created_at timestamptz not null
) on commit drop;
${catalogValues ? `insert into phase8_cleanup_catalog_allowlist values ${catalogValues};` : "-- No game catalog rows were created before this run stopped."}

create temp table phase8_cleanup_catalog(catalog_id uuid primary key) on commit drop;
insert into phase8_cleanup_catalog
select entry.id from public.game_catalog_entries entry
join phase8_cleanup_catalog_allowlist allowed on allowed.catalog_id=entry.id
  and allowed.stable_key=entry.stable_key and allowed.launch_type=entry.launch_type
  and allowed.package_id is not distinct from entry.package_id and allowed.resource_id is not distinct from entry.resource_id
  and allowed.created_at=entry.created_at
where (entry.launch_type='hosted_package'
    and entry.resource_id in (select resource_id from phase8_cleanup_resources)
    and entry.package_id in (select id from public.game_packages where created_by in (select admin_id from phase8_cleanup_admins)))
  or (entry.launch_type='external_https'
    and entry.stable_key='phase10-https-${auditScope.runId.slice(0, 8)}'
    and exists(select 1 from public.admin_audit_log audit where audit.target=entry.id::text
      and audit.admin_user_id in (select admin_id from phase8_cleanup_admins) and audit.action='admin.game.create'
      and audit.created_at between ${sqlLiteral(auditScope.startedAt)}::timestamptz and ${sqlLiteral(auditScope.frozenAt)}::timestamptz));

create temp table phase8_cleanup_destination_audits(
  audit_id uuid primary key,catalog_entry_id uuid not null,recorded_at timestamptz not null
) on commit drop;
${destinationAuditValues ? `insert into phase8_cleanup_destination_audits values ${destinationAuditValues};` : "-- No game destination audit rows were created before this run stopped."}

create temp table phase8_cleanup_hosts(hostname text primary key) on commit drop;
insert into phase8_cleanup_hosts select distinct external_allowed_host from public.game_catalog_entries
where id in (select catalog_id from phase8_cleanup_catalog) and external_allowed_host is not null;

create temp table phase8_cleanup_documents(document_id uuid primary key) on commit drop;
insert into phase8_cleanup_documents
select id from public.cms_documents where created_by in (select admin_id from phase8_cleanup_admins);

create temp table phase8_cleanup_media(media_id uuid primary key) on commit drop;
insert into phase8_cleanup_media
select id from public.cms_media_assets where created_by in (select admin_id from phase8_cleanup_admins);

create temp table phase8_cleanup_audits(audit_id uuid primary key, expected_target text, actor_bound boolean not null) on commit drop;
insert into phase8_cleanup_audits(audit_id,expected_target,actor_bound) values ${auditValues};

create temp table phase8_cleanup_analytics(
  event_id uuid primary key,synthetic_run_id text not null,metric_key text not null,occurred_at timestamptz not null,
  grade_number smallint,topic_slug text,lesson_slug text,outcome text not null,quantity integer not null,source text not null
) on commit drop;
${analyticsValues ? `insert into phase8_cleanup_analytics values ${analyticsValues};` : "-- No synthetic aggregate analytics event was created by this run."}

alter table public.content_resource_versions disable trigger content_resource_version_immutable;
alter table public.content_resources disable trigger content_resource_no_published_delete;
alter table public.game_catalog_entry_versions disable trigger game_catalog_entry_versions_immutable;
alter table public.game_catalog_destination_audit disable trigger game_catalog_destination_audit_reject_mutation;
alter table public.cms_document_versions disable trigger cms_published_versions_immutable;
alter table public.admin_audit_log disable trigger admin_audit_log_reject_mutation;
alter table public.admin_user_support_notes disable trigger admin_user_support_notes_immutable;
alter table public.platform_feature_flag_history disable trigger platform_feature_flag_history_immutable;
alter table public.platform_retention_runs disable trigger platform_retention_runs_immutable;

do $$
begin
  if exists(
    select 1 from public.game_catalog_entries entry
    where (entry.resource_id in (select resource_id from phase8_cleanup_resources)
      or (entry.launch_type='external_https' and entry.stable_key='phase10-https-${auditScope.runId.slice(0, 8)}'
        and exists(select 1 from public.admin_audit_log audit where audit.target=entry.id::text
          and audit.admin_user_id in (select admin_id from phase8_cleanup_admins) and audit.action='admin.game.create')))
      and not exists(select 1 from phase8_cleanup_catalog_allowlist allowed where allowed.catalog_id=entry.id)
  ) then raise exception 'phase8_cleanup_unapproved_catalog_entry'; end if;
  if exists(
    select 1 from public.game_catalog_entries entry
    join phase8_cleanup_catalog_allowlist allowed on allowed.catalog_id=entry.id
    where not exists(select 1 from phase8_cleanup_catalog cleanup where cleanup.catalog_id=entry.id)
  ) then raise exception 'phase8_cleanup_catalog_allowlist_mismatch'; end if;
  if exists(
    select 1 from public.game_catalog_destination_audit audit
    join phase8_cleanup_destination_audits allowed on allowed.audit_id=audit.id
    where audit.catalog_entry_id<>allowed.catalog_entry_id or audit.recorded_at<>allowed.recorded_at
      or audit.recorded_at < ${sqlLiteral(auditScope.startedAt)}::timestamptz
      or audit.recorded_at > ${sqlLiteral(auditScope.frozenAt)}::timestamptz
      or not exists(select 1 from phase8_cleanup_catalog cleanup where cleanup.catalog_id=audit.catalog_entry_id)
  ) then raise exception 'phase8_cleanup_destination_audit_allowlist_mismatch'; end if;
  if exists(
    select 1 from public.game_catalog_destination_audit audit
    where audit.catalog_entry_id in (select catalog_id from phase8_cleanup_catalog)
      and not exists(select 1 from phase8_cleanup_destination_audits allowed where allowed.audit_id=audit.id)
  ) then raise exception 'phase8_cleanup_unapproved_destination_audit'; end if;
  if exists(
    select 1 from public.admin_audit_log audit
    join phase8_cleanup_audits allowed on allowed.audit_id=audit.id
    where audit.created_at < ${sqlLiteral(auditScope.startedAt)}::timestamptz
      or audit.created_at > ${sqlLiteral(auditScope.frozenAt)}::timestamptz
      or audit.target is distinct from allowed.expected_target
      or (allowed.actor_bound and audit.admin_user_id not in (select admin_id from phase8_cleanup_admins))
      or (not allowed.actor_bound and audit.admin_user_id is not null)
  ) then raise exception 'phase8_cleanup_audit_allowlist_mismatch'; end if;
  if exists(select 1 from phase8_cleanup_analytics where synthetic_run_id <> ${sqlLiteral(auditScope.runId)})
    then raise exception 'phase10_cleanup_analytics_run_mismatch'; end if;
  if exists(
    select 1 from public.platform_analytics_events event
    join phase8_cleanup_analytics allowed on allowed.event_id=event.id
    where event.metric_key<>allowed.metric_key or event.occurred_at<>allowed.occurred_at
      or event.grade_number is distinct from allowed.grade_number
      or event.topic_slug is distinct from allowed.topic_slug
      or event.lesson_slug is distinct from allowed.lesson_slug
      or event.outcome<>allowed.outcome or event.quantity<>allowed.quantity or event.source<>allowed.source
      or event.occurred_at < ${sqlLiteral(auditScope.startedAt)}::timestamptz
      or event.occurred_at > ${sqlLiteral(auditScope.frozenAt)}::timestamptz
  ) then raise exception 'phase10_cleanup_analytics_allowlist_mismatch'; end if;
end $$;

delete from public.platform_analytics_events event using phase8_cleanup_analytics allowed
  where event.id=allowed.event_id and event.metric_key=allowed.metric_key and event.occurred_at=allowed.occurred_at
    and event.grade_number is not distinct from allowed.grade_number
    and event.topic_slug is not distinct from allowed.topic_slug
    and event.lesson_slug is not distinct from allowed.lesson_slug
    and event.outcome=allowed.outcome and event.quantity=allowed.quantity and event.source=allowed.source
    and allowed.synthetic_run_id=${sqlLiteral(auditScope.runId)};

delete from public.game_catalog_destination_audit audit using phase8_cleanup_destination_audits allowed
  where audit.id=allowed.audit_id and audit.catalog_entry_id=allowed.catalog_entry_id and audit.recorded_at=allowed.recorded_at
    and audit.catalog_entry_id in (select catalog_id from phase8_cleanup_catalog);

do $$ begin
  if exists(select 1 from public.game_catalog_destination_audit where catalog_entry_id in (select catalog_id from phase8_cleanup_catalog))
    then raise exception 'phase8_cleanup_destination_audit_remaining'; end if;
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
delete from public.game_catalog_entry_versions where catalog_entry_id in (select catalog_id from phase8_cleanup_catalog)
  and source_version_id is not null;
delete from public.game_catalog_entry_versions where catalog_entry_id in (select catalog_id from phase8_cleanup_catalog);
delete from public.game_catalog_entries where id in (select catalog_id from phase8_cleanup_catalog);
delete from public.game_external_allowed_hosts where hostname in (select hostname from phase8_cleanup_hosts)
  and not exists(select 1 from public.game_catalog_entries where external_allowed_host=public.game_external_allowed_hosts.hostname);
delete from public.game_packages where created_by in (select admin_id from phase8_cleanup_admins) and source_package_id is not null;
delete from public.game_packages where created_by in (select admin_id from phase8_cleanup_admins);
delete from public.game_package_quarantine_events where created_by in (select admin_id from phase8_cleanup_admins);
delete from public.resource_files where resource_id in (select resource_id from phase8_cleanup_resources) and replaces_file_id is not null;
delete from public.resource_files where resource_id in (select resource_id from phase8_cleanup_resources);
delete from public.topic_resource_assignments where resource_id in (select resource_id from phase8_cleanup_resources);
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
delete from public.admin_mfa_challenges where admin_user_id in (select admin_id from phase8_cleanup_admins);

alter table public.platform_retention_runs enable trigger platform_retention_runs_immutable;
alter table public.platform_feature_flag_history enable trigger platform_feature_flag_history_immutable;
alter table public.admin_user_support_notes enable trigger admin_user_support_notes_immutable;
alter table public.admin_audit_log enable trigger admin_audit_log_reject_mutation;
alter table public.cms_document_versions enable trigger cms_published_versions_immutable;
alter table public.content_resources enable trigger content_resource_no_published_delete;
alter table public.content_resource_versions enable trigger content_resource_version_immutable;
alter table public.game_catalog_destination_audit enable trigger game_catalog_destination_audit_reject_mutation;
alter table public.game_catalog_entry_versions enable trigger game_catalog_entry_versions_immutable;
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
