export const CONTENT_GRADE_NUMBERS = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9] as const);

export const CONTENT_RESOURCE_TYPES = Object.freeze([
  "game",
  "homework_pdf",
  "homework_answer_key",
  "quiz_pdf",
  "quiz_answer_key",
  "preview_image",
  "thumbnail",
  "map_prep_link"
] as const);

export const CONTENT_PUBLICATION_STATES = Object.freeze([
  "draft",
  "validating",
  "ready_for_review",
  "published",
  "archived"
] as const);

export type ContentGradeNumber = (typeof CONTENT_GRADE_NUMBERS)[number];
export type ContentResourceType = (typeof CONTENT_RESOURCE_TYPES)[number];
export type ContentPublicationState = (typeof CONTENT_PUBLICATION_STATES)[number];

export type ContentManifest = Readonly<Record<string, unknown>>;

export type ContentResourceDraft = Readonly<{
  resourceType: ContentResourceType;
  slug: string;
  title: string;
  description: string;
  sortOrder: number;
  thumbnailPath: string | null;
  tags: readonly string[];
  manifest: ContentManifest;
}>;

export type ResourceRevisionPlan = Readonly<{
  expectedLockVersion: number;
  nextLockVersion: number;
  nextVersionNumber: number;
}>;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TAG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PRIVATE_OBJECT_PATH = /^[a-z0-9][a-z0-9/_.-]*$/;

export function isContentGradeNumber(value: unknown): value is ContentGradeNumber {
  return typeof value === "number" && CONTENT_GRADE_NUMBERS.includes(value as ContentGradeNumber);
}

export function isContentResourceType(value: unknown): value is ContentResourceType {
  return typeof value === "string" && CONTENT_RESOURCE_TYPES.includes(value as ContentResourceType);
}

export function isContentPublicationState(value: unknown): value is ContentPublicationState {
  return typeof value === "string" && CONTENT_PUBLICATION_STATES.includes(value as ContentPublicationState);
}

export function parseContentSlug(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 96 || !SLUG.test(value)) return null;
  return value;
}

export function parsePrivateObjectPath(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > 512 || value.includes("..") || value.includes("\\")) return null;
  return PRIVATE_OBJECT_PATH.test(value) ? value : null;
}

export function normalizeContentTags(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || value.length > 20) return null;
  const normalized = [...new Set(value.map((tag) => typeof tag === "string" ? tag.trim().toLowerCase() : ""))].sort();
  if (normalized.some((tag) => tag.length > 48 || !TAG.test(tag))) return null;
  return Object.freeze(normalized);
}

export function validateContentManifest(resourceType: ContentResourceType, value: unknown): ContentManifest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const manifest = value as Record<string, unknown>;
  if (JSON.stringify(manifest).length > 16_384) return null;
  const externalUrl = manifest.external_url;
  if (resourceType === "map_prep_link") {
    if (typeof externalUrl !== "string") return null;
    try {
      const url = new URL(externalUrl);
      if (url.protocol !== "https:" || url.username || url.password) return null;
    } catch {
      return null;
    }
    for (const forbidden of ["html", "script", "package", "file_path", "storage_path"]) {
      if (forbidden in manifest) return null;
    }
    return Object.freeze({ ...manifest });
  }
  if (externalUrl !== undefined) return null;
  return Object.freeze({ ...manifest });
}

export function parseContentResourceDraft(value: unknown): ContentResourceDraft | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const draft = value as Record<string, unknown>;
  if (!isContentResourceType(draft.resourceType)) return null;
  const slug = parseContentSlug(draft.slug);
  if (!slug || typeof draft.title !== "string" || draft.title !== draft.title.trim() || draft.title.length < 1 || draft.title.length > 160) return null;
  if (typeof draft.description !== "string" || draft.description !== draft.description.trim() || draft.description.length > 4_000) return null;
  if (!Number.isSafeInteger(draft.sortOrder) || Number(draft.sortOrder) < 1 || Number(draft.sortOrder) > 32_767) return null;
  const thumbnailPath = parsePrivateObjectPath(draft.thumbnailPath ?? null);
  if (draft.thumbnailPath != null && thumbnailPath === null) return null;
  const tags = normalizeContentTags(draft.tags);
  const manifest = validateContentManifest(draft.resourceType, draft.manifest);
  if (!tags || !manifest) return null;
  return Object.freeze({
    resourceType: draft.resourceType,
    slug,
    title: draft.title,
    description: draft.description,
    sortOrder: Number(draft.sortOrder),
    thumbnailPath,
    tags,
    manifest
  });
}

export function canTransitionContentState(from: ContentPublicationState, to: ContentPublicationState): boolean {
  if (from === "draft") return to === "validating" || to === "archived";
  if (from === "validating") return to === "draft" || to === "ready_for_review" || to === "archived";
  if (from === "ready_for_review") return to === "draft" || to === "published" || to === "archived";
  return false;
}

export function planResourceRevision(
  currentVersionNumber: number,
  currentLockVersion: number,
  expectedLockVersion: number
): ResourceRevisionPlan | null {
  if (![currentVersionNumber, currentLockVersion, expectedLockVersion].every(Number.isSafeInteger)) return null;
  if (currentVersionNumber < 1 || currentLockVersion < 1 || currentLockVersion !== expectedLockVersion) return null;
  return Object.freeze({
    expectedLockVersion,
    nextLockVersion: currentLockVersion + 1,
    nextVersionNumber: currentVersionNumber + 1
  });
}
