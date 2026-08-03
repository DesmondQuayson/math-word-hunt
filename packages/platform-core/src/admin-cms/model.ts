export const CMS_DOCUMENT_KEYS = [
  "homepage", "featured-games", "featured-homework", "featured-quizzes", "announcements",
  "faq", "help", "support", "pricing-copy", "map-prep", "navigation", "footer",
  "terms", "privacy", "cancellation", "refunds"
] as const;

export const CMS_BLOCK_TYPES = ["hero", "section", "feature-list", "announcement", "faq-list", "link-list", "external-link", "legal-section"] as const;
export const CMS_LEGAL_KEYS = ["terms", "privacy", "cancellation", "refunds"] as const;
export const MEDIA_KINDS = ["image", "icon", "logo", "thumbnail", "preview-image", "audio", "downloadable-pdf"] as const;
export const CMS_PUBLICATION_STATES = ["draft", "ready_for_review", "published", "archived"] as const;

export type CmsDocumentKey = (typeof CMS_DOCUMENT_KEYS)[number];
export type CmsBlockType = (typeof CMS_BLOCK_TYPES)[number];
export type MediaKind = (typeof MEDIA_KINDS)[number];
export type CmsPublicationState = (typeof CMS_PUBLICATION_STATES)[number];

export type CmsBlock = Readonly<{
  type: CmsBlockType;
  heading?: string;
  body?: string;
  label?: string;
  href?: string;
  items?: readonly Readonly<{ title: string; body?: string; href?: string; resourceId?: string }>[];
  mediaId?: string;
}>;

export type StructuredCmsDraft = Readonly<{
  key: CmsDocumentKey;
  title: string;
  description: string;
  seoTitle: string;
  seoDescription: string;
  socialTitle: string;
  socialDescription: string;
  blocks: readonly CmsBlock[];
}>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FORBIDDEN_TEXT = /<\s*\/?|javascript\s*:|data\s*:\s*text\/html|on(?:click|load|error)\s*=|\beval\s*\(|\bnew\s+Function\b/i;

function text(value: unknown, maximum: number, allowEmpty = true): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if ((!allowEmpty && !normalized) || normalized.length > maximum || FORBIDDEN_TEXT.test(normalized)) return null;
  return normalized;
}

function safeHref(value: unknown, externalOnly = false): string | null {
  const candidate = text(value, 2048, false);
  if (!candidate) return null;
  if (!externalOnly && /^\/[a-z0-9/_?=&.-]*$/i.test(candidate)) return candidate;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch { return null; }
}

export function isCmsDocumentKey(value: unknown): value is CmsDocumentKey {
  return typeof value === "string" && CMS_DOCUMENT_KEYS.includes(value as CmsDocumentKey);
}

export function isLegalCmsKey(value: unknown): value is (typeof CMS_LEGAL_KEYS)[number] {
  return typeof value === "string" && CMS_LEGAL_KEYS.includes(value as (typeof CMS_LEGAL_KEYS)[number]);
}

export function canTransitionCmsState(from: CmsPublicationState, to: CmsPublicationState): boolean {
  return (from === "draft" && to === "ready_for_review") ||
    (from === "ready_for_review" && (to === "draft" || to === "published")) ||
    (from === "published" && to === "archived");
}

export function parseStructuredCmsDraft(input: unknown): StructuredCmsDraft | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const candidate = input as Record<string, unknown>;
  if (!isCmsDocumentKey(candidate.key)) return null;
  const title = text(candidate.title, 160, false), description = text(candidate.description, 5000);
  const seoTitle = text(candidate.seoTitle, 70), seoDescription = text(candidate.seoDescription, 180);
  const socialTitle = text(candidate.socialTitle, 100), socialDescription = text(candidate.socialDescription, 240);
  if ([title, description, seoTitle, seoDescription, socialTitle, socialDescription].some((entry) => entry === null)) return null;
  if (!Array.isArray(candidate.blocks) || candidate.blocks.length > 50) return null;
  const blocks: CmsBlock[] = [];
  for (const raw of candidate.blocks) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const block = raw as Record<string, unknown>;
    if (typeof block.type !== "string" || !CMS_BLOCK_TYPES.includes(block.type as CmsBlockType)) return null;
    const parsed: Record<string, unknown> = { type: block.type };
    for (const [name, limit] of [["heading",160],["body",10000],["label",120]] as const) {
      if (block[name] !== undefined) { const value = text(block[name], limit); if (value === null) return null; parsed[name] = value; }
    }
    if (block.href !== undefined) { const href = safeHref(block.href, block.type === "external-link"); if (!href) return null; parsed.href = href; }
    if (block.mediaId !== undefined) { if (typeof block.mediaId !== "string" || !UUID.test(block.mediaId)) return null; parsed.mediaId = block.mediaId; }
    if (block.items !== undefined) {
      if (!Array.isArray(block.items) || block.items.length > 24) return null;
      const items = [];
      for (const rawItem of block.items) {
        if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) return null;
        const item = rawItem as Record<string, unknown>; const itemTitle = text(item.title, 160, false); if (!itemTitle) return null;
        const result: Record<string,string> = { title:itemTitle };
        if (item.body !== undefined) { const body=text(item.body,4000); if (body===null) return null; result.body=body; }
        if (item.href !== undefined) { const href=safeHref(item.href); if (!href) return null; result.href=href; }
        if (item.resourceId !== undefined) { if (typeof item.resourceId!=="string" || !UUID.test(item.resourceId)) return null; result.resourceId=item.resourceId; }
        items.push(result);
      }
      parsed.items=items;
    }
    blocks.push(parsed as CmsBlock);
  }
  const draft = { key:candidate.key,title:title!,description:description!,seoTitle:seoTitle!,seoDescription:seoDescription!,socialTitle:socialTitle!,socialDescription:socialDescription!,blocks };
  return JSON.stringify(draft).length <= 65536 ? Object.freeze(draft) : null;
}

export function parseMediaMetadata(input: unknown): Readonly<{ kind: MediaKind; altText: string; caption: string; attribution: string; license: string }> | null {
  if (!input || typeof input!=="object" || Array.isArray(input)) return null;
  const value=input as Record<string,unknown>;
  if (typeof value.kind!=="string" || !MEDIA_KINDS.includes(value.kind as MediaKind)) return null;
  const altText=text(value.altText,500),caption=text(value.caption,1000),attribution=text(value.attribution,1000),license=text(value.license,200);
  if ([altText,caption,attribution,license].some((entry)=>entry===null)) return null;
  if (["image","icon","logo","thumbnail","preview-image"].includes(value.kind) && !altText) return null;
  return Object.freeze({kind:value.kind as MediaKind,altText:altText!,caption:caption!,attribution:attribution!,license:license!});
}
