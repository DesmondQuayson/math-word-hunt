import { resolveGameCatalogThumbnail } from "@/components/games/game-catalog-thumbnail";
import { freeGamePlayRoute, isFreeToPlayGame } from "@/lib/games/access-policy";

/**
 * The homepage game library: which games the homepage shows, in what order,
 * and the short copy each compact card carries.
 *
 * The game catalog stays the source of truth for what is live: when it can be
 * read, only its published games appear, so an archived or maintenance game
 * leaves the homepage without a code change. If the catalog cannot be read in
 * time, the full curated list is shown with its known routes, so a slow
 * provider never empties the section. This file owns presentation only.
 *
 * Access is decided by lib/games/access-policy.ts and by the game routes,
 * never here. A card is marked Free only when that policy says
 * authenticated-free; every other game is labelled Subscription. Free games
 * link straight to their play or host route (a signed-out visitor goes
 * through sign in and comes back), never to pricing.
 *
 * Order (owner, 2026-11-09): Polygon Showdown first, then the other free
 * games, then the subscription games.
 */

export type HomeFeaturedAction = Readonly<{ label: string; href: string }>;

export type HomeFeaturedGame = Readonly<{
  stableKey: string;
  title: string;
  category: string;
  blurb: string;
  free: boolean;
  image: Readonly<{ src: string; alt: string }>;
  primary: HomeFeaturedAction;
  secondary: HomeFeaturedAction | null;
}>;

/** What the homepage needs from a published catalog entry. */
export type HomeCatalogGame = Readonly<{
  stableKey: string;
  title: string;
  thumbnailReference: string;
  playHref: string;
}>;

type HomeGamePresentation = Readonly<{
  stableKey: string;
  title: string;
  category: string;
  blurb: string;
  alt: string;
  /** Button label while the game is free; subscription games always say "Play Now". */
  freeLabel: string;
  /** Route used only when the catalog cannot be read. */
  fallbackHref: string;
  fallbackThumbnailReference: string;
  secondary?: HomeFeaturedAction;
}>;

export const HOME_FEATURED_GAME_ORDER: readonly HomeGamePresentation[] = Object.freeze([
  {
    stableKey: "polygon-showdown",
    title: "Polygon Showdown",
    category: "Geometry",
    blurb: "Match shapes, earn coins, and challenge friends.",
    alt: "Polygon Showdown gameplay: an 8 by 8 board of circles, triangles, squares, and rectangles beside the run's matches and score",
    freeLabel: "Play Free",
    fallbackHref: "/games/polygon-showdown/play",
    fallbackThumbnailReference: "builtin:polygon-showdown"
  },
  {
    stableKey: "math-bingo-live",
    title: "Math Bingo Live",
    category: "Live class",
    blurb: "Host live class Bingo. Students join with a code.",
    alt: "Math Bingo Live gameplay: a student's 5 by 5 Bingo card with a completed row beside the live question and the class standings",
    freeLabel: "Host Game",
    fallbackHref: "/games/math-bingo-live/host",
    fallbackThumbnailReference: "builtin:math-bingo-live",
    secondary: { label: "Join with a code", href: "/join" }
  },
  {
    stableKey: "math-tug-of-war",
    title: "Math Tug of War",
    category: "Multiplayer",
    blurb: "Solve the math. Pull the rope. Beat the other side!",
    alt: "Math Tug of War gameplay artwork: the Turquoise and Pink teams pulling a rope while each side answers integer questions on a keypad",
    freeLabel: "Play Free",
    fallbackHref: "/games/math-tug-of-war/play",
    fallbackThumbnailReference: "builtin:math-tug-of-war"
  },
  {
    stableKey: "crosscalc",
    title: "CrossCalc",
    category: "Equations",
    blurb: "Place number tiles so every equation works.",
    alt: "CrossCalc gameplay: connected equations with empty cells and a tray of number tiles to place",
    freeLabel: "Play Free",
    fallbackHref: "/games/crosscalc/play",
    fallbackThumbnailReference: "builtin:crosscalc-v2"
  },
  {
    stableKey: "number-logic",
    title: "Number Logic",
    category: "Logic",
    blurb: "Six number puzzles. Make every route agree.",
    alt: "Number Logic gameplay: a Lines of 3 puzzle where the numbers in the circles must give every route the same total",
    freeLabel: "Play Free",
    fallbackHref: "/games/number-logic/play",
    fallbackThumbnailReference: "builtin:number-logic"
  },
  {
    stableKey: "number-cross",
    title: "Number Cross",
    category: "Number sense",
    blurb: "Cross out numbers until every line hits its target.",
    alt: "Number Cross gameplay: a 4 by 4 grid of number tiles with some crossed out so each row and column meets its target",
    freeLabel: "Play Free",
    fallbackHref: "/games/number-cross/play",
    fallbackThumbnailReference: "builtin:number-cross"
  },
  {
    stableKey: "math-vocabulary-hunt",
    title: "Math Vocabulary Hunt",
    category: "Vocabulary",
    blurb: "A fast, team vocabulary round for your class.",
    alt: "Math Vocabulary Hunt artwork: the words fraction, integer, ratio, area, and equation lit up in a letter grid",
    freeLabel: "Play Free",
    fallbackHref: "/play",
    fallbackThumbnailReference: "builtin:math-vocabulary-hunt"
  }
] satisfies HomeGamePresentation[]);

/**
 * The homepage cards, in homepage order. `published` is the catalog's
 * published games, or null when the catalog could not be read.
 */
export function homeFeaturedGames(published: readonly HomeCatalogGame[] | null): readonly HomeFeaturedGame[] {
  const live = published ? new Map(published.map((game) => [game.stableKey, game])) : null;
  return HOME_FEATURED_GAME_ORDER.flatMap((entry): HomeFeaturedGame[] => {
    const catalogEntry = live?.get(entry.stableKey);
    if (live && !catalogEntry) return [];
    const thumbnail = resolveGameCatalogThumbnail(entry.stableKey, catalogEntry?.thumbnailReference ?? entry.fallbackThumbnailReference);
    // A homepage card always shows the game's real artwork, never a placeholder.
    if (!thumbnail) return [];
    const free = isFreeToPlayGame(entry.stableKey);
    const freeRoute = free ? freeGamePlayRoute(entry.stableKey) : null;
    return [{
      stableKey: entry.stableKey,
      title: catalogEntry?.title ?? entry.title,
      category: entry.category,
      blurb: entry.blurb,
      free,
      image: { src: thumbnail.webp, alt: entry.alt },
      primary: {
        label: free ? entry.freeLabel : "Play Now",
        href: freeRoute ?? catalogEntry?.playHref ?? entry.fallbackHref
      },
      secondary: entry.secondary ?? null
    }];
  });
}
