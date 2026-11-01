import { platformProductLabel, type PlatformProductPath } from "./platform-positioning";

/**
 * The public, indexable page that describes each MathNexa product (P2,
 * 2026-11). The product routes themselves (/games, /map-prep, /homework,
 * /quizzes) are unchanged: they keep their access checks, and signed-out
 * visitors still go to the noindex /access page. These pages are what search
 * engines and signed-out visitors can read instead, and each one links back
 * into its product route, so no access rule changes.
 *
 * They live in their own top-level folders: a page under app/games/ would
 * inherit that layout's access check.
 */
export const PRODUCT_PAGE_PATHS = Object.freeze({
  onlineMathPrep: "/online-math-prep",
  mathGames: "/math-games",
  mathTugOfWar: "/math-games/math-tug-of-war",
  homeworkPdfs: "/homework-pdfs",
  quizPdfs: "/quiz-pdfs"
} as const);

export type ProductPagePath = (typeof PRODUCT_PAGE_PATHS)[keyof typeof PRODUCT_PAGE_PATHS];

/** The public page for each product route: the footer's Products links and About use it. */
export const PRODUCT_PAGE_FOR_ROUTE: Readonly<Record<PlatformProductPath, ProductPagePath>> = Object.freeze({
  "/games": PRODUCT_PAGE_PATHS.mathGames,
  "/map-prep": PRODUCT_PAGE_PATHS.onlineMathPrep,
  "/homework": PRODUCT_PAGE_PATHS.homeworkPdfs,
  "/quizzes": PRODUCT_PAGE_PATHS.quizPdfs
});

export type ProductPageLink = Readonly<{ path: ProductPagePath; label: string }>;

/** Every product page, in navigation order, with the names the navigation uses. */
export const PRODUCT_PAGE_LINKS: readonly ProductPageLink[] = Object.freeze([
  { path: PRODUCT_PAGE_PATHS.onlineMathPrep, label: platformProductLabel("/map-prep") },
  { path: PRODUCT_PAGE_PATHS.mathGames, label: platformProductLabel("/games") },
  { path: PRODUCT_PAGE_PATHS.mathTugOfWar, label: "Math Tug of War" },
  { path: PRODUCT_PAGE_PATHS.homeworkPdfs, label: platformProductLabel("/homework") },
  { path: PRODUCT_PAGE_PATHS.quizPdfs, label: platformProductLabel("/quizzes") }
]);

export type BreadcrumbItem = Readonly<{ name: string; path: string }>;

const HOME: BreadcrumbItem = Object.freeze({ name: "Home", path: "/" });

function linkFor(path: ProductPagePath): BreadcrumbItem {
  const link = PRODUCT_PAGE_LINKS.find((entry) => entry.path === path);
  if (!link) throw new Error(`Unknown MathNexa product page: ${path}`);
  return { name: link.label, path: link.path };
}

/**
 * The trail each page shows above its heading. The same trail is published as
 * BreadcrumbList JSON-LD, so the markup always matches what visitors see.
 */
export function productPageTrail(path: ProductPagePath): readonly BreadcrumbItem[] {
  return path === PRODUCT_PAGE_PATHS.mathTugOfWar
    ? [HOME, linkFor(PRODUCT_PAGE_PATHS.mathGames), linkFor(path)]
    : [HOME, linkFor(path)];
}
