import { resolveGameCatalogThumbnail } from "@/components/games/game-catalog-thumbnail";
import { freeGameEntryRoute } from "@/lib/games/free-game-entry";

/**
 * The homepage Free math games section: which games it shows, in what order,
 * and the short copy each compact card carries. The homepage shows free games
 * only; the full catalog stays on /math-games (owner, after v1.2.41).
 *
 * Which games. A game appears when, and only when, two sources of truth agree:
 * - the game catalog has it published, so an archived or maintenance game
 *   leaves the homepage with no code change;
 * - MathNexa's access rule lets any signed-in account play it with no
 *   subscription. That rule is lib/games/access-policy.ts
 *   ("authenticated-free"), enforced by requireGamePlayAccess in
 *   lib/access/server.ts, which admits a non-subscriber only when the policy
 *   says authenticated-free and the game has a free play route that sign in can
 *   return to (FREE_GAME_DESTINATIONS in lib/auth/access-intent.ts).
 *   MATHNEXA_HOME_SOURCES.freePlayRoute asks exactly that
 *   (freeGameEntryRoute in lib/games/free-game-entry.ts).
 * The policy's default is "entitled", so a game added to the catalog without a
 * free classification never reaches the homepage. Nothing here can make a game
 * free: subscription games keep their routes, their entitlement rule and their
 * place on /math-games.
 *
 * Copy. HOME_GAME_COPY is presentation only: the category, one short line, the
 * alt text and the button label of the games MathNexa already has, in the
 * owner's order (2026-11-09: Polygon Showdown first). It never decides
 * visibility: an entry whose game is not free is not shown, and a free game
 * with no entry still appears, after these, in catalog order, with its catalog
 * title and the first sentence of its catalog description.
 *
 * If the catalog cannot be read in time, the free games below are shown with
 * their known artwork, so a slow provider never empties the section.
 */

export type HomeGameAction = Readonly<{ label: string; href: string }>;

export type HomeFreeGame = Readonly<{
  stableKey: string;
  title: string;
  category: string;
  blurb: string;
  image: Readonly<{ src: string; alt: string }>;
  primary: HomeGameAction;
  secondary: HomeGameAction | null;
}>;

/** What the homepage needs from a published catalog entry. */
export type HomeCatalogGame = Readonly<{
  stableKey: string;
  title: string;
  description: string;
  thumbnailReference: string;
}>;

/**
 * Where the homepage reads access and artwork. The app always uses
 * MATHNEXA_HOME_SOURCES; tests substitute it to model a game that does not
 * exist yet.
 */
export type HomeGameSources = Readonly<{
  /** The game's play or host route when any signed-in account may play it with no subscription, otherwise null. */
  freePlayRoute: (stableKey: string) => string | null;
  /** The game's real artwork, or null: a homepage card never shows a placeholder. */
  thumbnail: (stableKey: string, thumbnailReference: string) => Readonly<{ webp: string }> | null;
}>;

export const MATHNEXA_HOME_SOURCES: HomeGameSources = Object.freeze({
  freePlayRoute: freeGameEntryRoute,
  thumbnail: resolveGameCatalogThumbnail
});

type HomeGameCopy = Readonly<{
  stableKey: string;
  /** Shown only when the catalog cannot be read; otherwise the catalog's title is used. */
  title: string;
  category: string;
  blurb: string;
  alt: string;
  label: string;
  /** Artwork reference used only when the catalog cannot be read. */
  fallbackThumbnailReference: string;
  secondary?: HomeGameAction;
}>;

export const HOME_GAME_COPY: readonly HomeGameCopy[] = Object.freeze([
  {
    stableKey: "polygon-showdown",
    title: "Polygon Showdown",
    category: "Geometry",
    blurb: "Match shapes, earn coins, and challenge friends.",
    alt: "Polygon Showdown gameplay: an 8 by 8 board of circles, triangles, squares, and rectangles beside the run's matches and score",
    label: "Play Free",
    fallbackThumbnailReference: "builtin:polygon-showdown"
  },
  {
    stableKey: "math-bingo-live",
    title: "Math Bingo Live",
    category: "Live class",
    blurb: "Host live class Bingo. Students join with a code.",
    alt: "Math Bingo Live gameplay: a student's 5 by 5 Bingo card with a completed row beside the live question and the class standings",
    label: "Host Game",
    fallbackThumbnailReference: "builtin:math-bingo-live",
    secondary: { label: "Join with a code", href: "/join" }
  },
  {
    stableKey: "math-tug-of-war",
    title: "Math Tug of War",
    category: "Multiplayer",
    blurb: "Solve the math. Pull the rope. Beat the other side!",
    alt: "Math Tug of War gameplay artwork: the Turquoise and Pink teams pulling a rope while each side answers integer questions on a keypad",
    label: "Play Free",
    fallbackThumbnailReference: "builtin:math-tug-of-war"
  },
  {
    stableKey: "crosscalc",
    title: "CrossCalc",
    category: "Equations",
    blurb: "Place number tiles so every equation works.",
    alt: "CrossCalc gameplay: connected equations with empty cells and a tray of number tiles to place",
    label: "Play Free",
    fallbackThumbnailReference: "builtin:crosscalc-v2"
  },
  {
    stableKey: "number-logic",
    title: "Number Logic",
    category: "Logic",
    blurb: "Six number puzzles. Make every route agree.",
    alt: "Number Logic gameplay: a Lines of 3 puzzle where the numbers in the circles must give every route the same total",
    label: "Play Free",
    fallbackThumbnailReference: "builtin:number-logic"
  },
  {
    stableKey: "number-cross",
    title: "Number Cross",
    category: "Number sense",
    blurb: "Cross out numbers until every line hits its target.",
    alt: "Number Cross gameplay: a 4 by 4 grid of number tiles with some crossed out so each row and column meets its target",
    label: "Play Free",
    fallbackThumbnailReference: "builtin:number-cross"
  },
  {
    stableKey: "math-vocabulary-hunt",
    title: "Math Vocabulary Hunt",
    category: "Vocabulary",
    blurb: "A fast, team vocabulary round for your class.",
    alt: "Math Vocabulary Hunt artwork: the words fraction, integer, ratio, area, and equation lit up in a letter grid",
    label: "Play Free",
    fallbackThumbnailReference: "builtin:math-vocabulary-hunt"
  }
] satisfies HomeGameCopy[]);

const COPY_BY_KEY = new Map(HOME_GAME_COPY.map((copy) => [copy.stableKey, copy]));
const COPY_RANK = new Map(HOME_GAME_COPY.map((copy, index) => [copy.stableKey, index]));

export const HOME_BLURB_LIMIT = 80;

/** One short line from a catalog description: its first sentence, cut at a word when it is long. */
export function shortBlurb(description: string, limit = HOME_BLURB_LIMIT): string {
  const text = description.replace(/\s+/g, " ").trim();
  const sentence = /^.*?[.!?](?=\s|$)/.exec(text)?.[0] ?? text;
  if (sentence.length <= limit) return sentence;
  const cut = sentence.slice(0, limit - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > limit / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:.!?-]+$/, "")}…`;
}

/**
 * The homepage cards, in homepage order. `published` is the catalog's
 * published games, or null when the catalog could not be read.
 */
export function homeFreeGames(published: readonly HomeCatalogGame[] | null, sources: HomeGameSources = MATHNEXA_HOME_SOURCES): readonly HomeFreeGame[] {
  const candidates: readonly HomeCatalogGame[] = published ?? HOME_GAME_COPY.map((copy) => ({
    stableKey: copy.stableKey,
    title: copy.title,
    description: copy.blurb,
    thumbnailReference: copy.fallbackThumbnailReference
  }));
  const rank = (stableKey: string) => COPY_RANK.get(stableKey) ?? HOME_GAME_COPY.length;
  // Array.prototype.sort is stable, so games without homepage copy keep the catalog's order.
  return [...candidates].sort((a, b) => rank(a.stableKey) - rank(b.stableKey)).flatMap((game): HomeFreeGame[] => {
    const href = sources.freePlayRoute(game.stableKey);
    // Not free for every signed-in account: never on the homepage, whatever else is known about it.
    if (href === null) return [];
    const thumbnail = sources.thumbnail(game.stableKey, game.thumbnailReference);
    if (!thumbnail) return [];
    const copy = COPY_BY_KEY.get(game.stableKey);
    return [{
      stableKey: game.stableKey,
      title: game.title,
      category: copy?.category ?? "Math game",
      blurb: copy?.blurb ?? shortBlurb(game.description),
      image: { src: thumbnail.webp, alt: copy?.alt ?? `${game.title} game artwork` },
      primary: { label: copy?.label ?? "Play Free", href },
      secondary: copy?.secondary ?? null
    }];
  });
}
