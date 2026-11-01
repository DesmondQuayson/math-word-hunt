import "server-only";

import { withTimeout } from "@/lib/async/with-timeout";
import { isFreeToPlayGame } from "@/lib/games/access-policy";
import { loadPublicGameCatalog, type PublicGame } from "@/lib/games/catalog";
import { loadPublicResourceLibrary, type PublicResourceLibraryData } from "@/lib/resources/catalog";
import { createTtlCache } from "@/lib/resources/ttl-cache";

/**
 * What the public product pages may say about the live catalog (P2,
 * 2026-11): the published names, descriptions, grades, skills and topics that
 * subscribers already see. Never an id, a file id, or a preview, download or
 * launch address: the summaries below are built from display fields only.
 *
 * The reads are the existing published-only catalog loaders, read-only:
 * `loadPublicGameCatalog(false)` skips the canonical-entry reconcile RPC that
 * the homepage may run. Each summary is held for five minutes per server
 * instance, and a failed or empty read is never held, so the next visit
 * retries. A slow provider costs a page at most four seconds, after which it
 * renders its general text without the list.
 */

export const CATALOG_SUMMARY_TTL_MS = 5 * 60_000;
export const CATALOG_SUMMARY_TIMEOUT_MS = 4000;

export type GameSummary = Readonly<{
  stableKey: string;
  /** Only chooses the card artwork (game-catalog-thumbnail.tsx); never rendered. */
  thumbnailReference: string;
  title: string;
  description: string;
  /** "Grades 3–9", "Grade 6", or null when the catalog gives no range. */
  grades: string | null;
  /** Catalog skill slugs as words: "absolute-value" becomes "absolute value". */
  skills: readonly string[];
  freeToPlay: boolean;
}>;

export type GameCatalogSummary = Readonly<{ available: boolean; games: readonly GameSummary[] }>;

export type PdfGradeSummary = Readonly<{ grade: string; topics: readonly string[] }>;

export type PdfLibrarySummary = Readonly<{
  available: boolean;
  grades: readonly PdfGradeSummary[];
  /** True only when every listed PDF has an answer key, inside the PDF or published beside it. */
  everyItemHasAnswerKey: boolean;
}>;

export function gradeRangeLabel(minimum: number | null, maximum: number | null): string | null {
  if (minimum === null || maximum === null || minimum > maximum) return null;
  return minimum === maximum ? `Grade ${minimum}` : `Grades ${minimum}–${maximum}`;
}

export function skillLabel(slug: string): string {
  return slug.trim().replace(/[-_]+/g, " ");
}

export function summarizeGames(games: readonly PublicGame[]): readonly GameSummary[] {
  return games.map((game) => ({
    stableKey: game.stableKey,
    thumbnailReference: game.thumbnailReference,
    title: game.title,
    description: game.description,
    grades: gradeRangeLabel(game.recommendedGradeMin, game.recommendedGradeMax),
    skills: [...new Set(game.skills.map(skillLabel).filter(Boolean))],
    freeToPlay: isFreeToPlayGame(game.stableKey)
  }));
}

/**
 * Grades and their topic names, in catalog order, for the PDFs a subscriber
 * can actually download. Answer-key resources are not listed on their own.
 */
export function summarizePdfLibrary(data: PublicResourceLibraryData): Omit<PdfLibrarySummary, "available"> {
  const items = data.resources.filter((resource) => !resource.isAnswerKey && resource.downloadable);
  const gradeOrder = new Map(data.taxonomy.grades.map((grade) => [grade.id, grade.sortOrder]));
  const grades = new Map<string, { grade: string; order: number; topics: Map<string, { title: string; order: number }> }>();
  for (const item of items) {
    const grade = grades.get(item.gradeId) ?? { grade: item.grade, order: gradeOrder.get(item.gradeId) ?? Number.MAX_SAFE_INTEGER, topics: new Map() };
    grade.topics.set(item.topicId, { title: item.topic, order: item.topicNumber });
    grades.set(item.gradeId, grade);
  }
  return {
    grades: [...grades.values()]
      .sort((a, b) => a.order - b.order || a.grade.localeCompare(b.grade))
      .map((grade) => ({
        grade: grade.grade,
        topics: [...grade.topics.values()].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title)).map((topic) => topic.title)
      })),
    everyItemHasAnswerKey: items.length > 0 && items.every((item) => item.answerKeyIncluded || item.answerKeyResourceId !== null)
  };
}

const UNAVAILABLE_GAMES: GameCatalogSummary = Object.freeze({ available: false, games: [] });
const UNAVAILABLE_PDFS: PdfLibrarySummary = Object.freeze({ available: false, grades: [], everyItemHasAnswerKey: false });

const gameSummaries = createTtlCache(async () => {
  const catalog = await loadPublicGameCatalog(false);
  // Throwing keeps an outage out of the cache, so the next visit retries.
  if (catalog.state === "unavailable") throw new Error("mathnexa-game-catalog-unavailable");
  return summarizeGames(catalog.games);
}, CATALOG_SUMMARY_TTL_MS);

function pdfSummaries(kind: "homework" | "quizzes") {
  return createTtlCache(async () => {
    const summary = summarizePdfLibrary(await loadPublicResourceLibrary(kind));
    // The loader reports a failed read as an empty library, so an empty
    // result is never held either.
    if (!summary.grades.length) throw new Error(`mathnexa-${kind}-library-empty`);
    return summary;
  }, CATALOG_SUMMARY_TTL_MS);
}

const homeworkSummaries = pdfSummaries("homework");
const quizSummaries = pdfSummaries("quizzes");

export function loadGameCatalogSummary(): Promise<GameCatalogSummary> {
  const read = gameSummaries.read().then((games): GameCatalogSummary => ({ available: true, games }), () => UNAVAILABLE_GAMES);
  return withTimeout(read, CATALOG_SUMMARY_TIMEOUT_MS, UNAVAILABLE_GAMES);
}

export function loadPdfLibrarySummary(kind: "homework" | "quizzes"): Promise<PdfLibrarySummary> {
  const cache = kind === "homework" ? homeworkSummaries : quizSummaries;
  const read = cache.read().then((summary): PdfLibrarySummary => ({ available: true, ...summary }), () => UNAVAILABLE_PDFS);
  return withTimeout(read, CATALOG_SUMMARY_TIMEOUT_MS, UNAVAILABLE_PDFS);
}
