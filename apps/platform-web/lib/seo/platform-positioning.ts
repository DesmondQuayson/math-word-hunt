/**
 * MathNexa customer-facing positioning: ONE place for the homepage copy, the
 * product names and the Google-facing metadata, so the hero, the navigation,
 * the footer, the access flow and the search snippet can never drift apart.
 *
 * Positioning (owner direction, 2026-09): the Grades 3–8 product is "online
 * math prep" first; Missouri MAP alignment is a supported use case inside it,
 * not the identity. Route paths are deliberately NOT part of this change:
 * /games, /map-prep, /homework and /quizzes stay exactly as indexed and
 * bookmarked, and internal identifiers such as the "map-prep" entitlement key
 * are untouched. Only the words people read change.
 */

export const PLATFORM_HERO_EYEBROW = "Teacher-led math resources";
export const PLATFORM_HERO_HEADLINE = "Make every math lesson clearer, more engaging, and ready to teach.";
export const PLATFORM_HERO_DESCRIPTION =
  "Math games, online math prep for Grades 3–8, Homework PDFs, Quiz PDFs, and a worksheet generator—all in one teacher-friendly platform.";
export const PLATFORM_HERO_AUDIENCE =
  "Built for teachers. Useful for families. Designed for classroom instruction, extra practice, and middle school math review.";

/**
 * Google-facing homepage metadata (production platform only). The description
 * is the owner's exact sentence and is the same text the hero shows, so the
 * visible page and the snippet source agree (V2: no "MathNexa offers" prefix,
 * no Missouri or Praxis wording).
 */
export const PLATFORM_HOMEPAGE_TITLE = "MathNexa | Online Math Prep, Homework PDFs, Quiz PDFs & Worksheets";
export const PLATFORM_HOMEPAGE_DESCRIPTION = PLATFORM_HERO_DESCRIPTION;

/**
 * Missouri stays a supported, truthful alignment claim wherever product detail
 * allows it. No DESE branding, no implied official affiliation.
 */
export const MISSOURI_ALIGNMENT_NOTE =
  "Includes practice aligned to Missouri MAP-style Grades 3–8 mathematics while also covering broadly useful grade-level math skills.";
export const MISSOURI_NON_AFFILIATION =
  "MathNexa is an independent product and is not affiliated with or endorsed by the Missouri Department of Elementary and Secondary Education.";

/**
 * Planned work only. It must never read as an existing Praxis course, and any
 * public mention of Praxis travels with the non-affiliation clarification.
 */
export const ROADMAP_MIDDLE_SCHOOL_REVIEW =
  "Middle School Math Review resources for educators, including content review useful when preparing for Praxis® Mathematics (5164).";
export const PRAXIS_NON_AFFILIATION =
  "Praxis® is a registered trademark of ETS. MathNexa is an independent product that is not affiliated with, sponsored by, or endorsed by ETS, and does not offer a Praxis preparation course.";

export type PlatformProductPath = "/games" | "/map-prep" | "/homework" | "/quizzes";

export type PlatformProduct = Readonly<{
  /** Route path: unchanged and never derived from the label. */
  href: PlatformProductPath;
  /** Navigation, footer and access-flow label. */
  label: string;
  /** Homepage card title (may carry the grade band). */
  cardTitle: string;
  /** Homepage card feature line. */
  features: string;
}>;

export const PLATFORM_PRODUCTS: readonly [PlatformProduct, PlatformProduct, PlatformProduct, PlatformProduct] = [
  { href: "/games", label: "Math Games", cardTitle: "Math Games", features: "Engage · Practice" },
  {
    href: "/map-prep",
    label: "Online Math Prep",
    cardTitle: "Online Math Prep (Grades 3–8)",
    features: "Learn · Practice · Review · Worksheet Generator"
  },
  { href: "/homework", label: "Homework PDFs", cardTitle: "Homework PDFs", features: "Practice · Print" },
  { href: "/quizzes", label: "Quiz PDFs", cardTitle: "Quiz PDFs", features: "Assess · Print" }
];

export function platformProductLabel(href: PlatformProductPath): string {
  const product = PLATFORM_PRODUCTS.find((entry) => entry.href === href);
  if (!product) throw new Error(`Unknown MathNexa product path: ${href}`);
  return product.label;
}
