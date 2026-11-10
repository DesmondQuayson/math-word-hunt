import { describe, expect, it } from "vitest";

import { resolveGameCatalogThumbnail } from "@/components/games/game-catalog-thumbnail";
import { FREE_GAME_DESTINATIONS } from "@/lib/auth/access-intent";
import { gameAccessPolicy, isFreeToPlayGame } from "@/lib/games/access-policy";

import {
  HOME_BLURB_LIMIT,
  HOME_GAME_COPY,
  MATHNEXA_HOME_SOURCES,
  homeFreeGames,
  shortBlurb,
  type HomeCatalogGame,
  type HomeGameSources
} from "./home-free-games";

// Production's game catalog as read on 2026-11-10: all seven entries published, in catalog display order.
const PRODUCTION_CATALOG_KEYS = ["math-vocabulary-hunt", "number-cross", "number-logic", "crosscalc", "math-tug-of-war", "math-bingo-live", "polygon-showdown"];
const FREE_IN_HOME_ORDER = ["polygon-showdown", "math-bingo-live", "math-tug-of-war"];
const freeDestinations: readonly string[] = FREE_GAME_DESTINATIONS;

const catalogGame = (stableKey: string, overrides: Partial<HomeCatalogGame> = {}): HomeCatalogGame => ({
  stableKey,
  title: `${stableKey} (catalog title)`,
  description: `${stableKey} catalog description. A second sentence.`,
  thumbnailReference: stableKey === "crosscalc" ? "builtin:crosscalc-v2" : `builtin:${stableKey}`,
  ...overrides
});
const productionCatalog = () => PRODUCTION_CATALOG_KEYS.map((key) => catalogGame(key));
const keys = (games: readonly { stableKey: string }[]) => games.map((game) => game.stableKey);

/** The real access rule and artwork, plus artwork (and, if given, a free route) for games that do not exist yet. */
const withFutureGames = (artwork: Record<string, string>, freeRoutes: Record<string, string> = {}): HomeGameSources => ({
  freePlayRoute: (stableKey) => freeRoutes[stableKey] ?? MATHNEXA_HOME_SOURCES.freePlayRoute(stableKey),
  thumbnail: (stableKey, reference) => (artwork[stableKey] ? { webp: artwork[stableKey] } : resolveGameCatalogThumbnail(stableKey, reference))
});

describe("homepage free games", () => {
  it("shows exactly the published catalog games the access policy makes free, Polygon Showdown first", () => {
    const catalog = productionCatalog();
    const games = homeFreeGames(catalog);
    // Derived, not listed: the catalog entries whose access policy is authenticated-free.
    expect(new Set(keys(games))).toEqual(new Set(catalog.filter((game) => isFreeToPlayGame(game.stableKey)).map((game) => game.stableKey)));
    expect(keys(games)).toEqual(FREE_IN_HOME_ORDER);
    for (const key of PRODUCTION_CATALOG_KEYS.filter((entry) => !FREE_IN_HOME_ORDER.includes(entry))) {
      expect(gameAccessPolicy(key), key).toBe("entitled");
      expect(keys(games), key).not.toContain(key);
    }
  });

  it("links every card to its game's free route, the one the play gate admits any signed-in account to", () => {
    const games = homeFreeGames(productionCatalog());
    expect(games.map((game) => [game.stableKey, game.primary.label, game.primary.href])).toEqual([
      ["polygon-showdown", "Play Free", "/games/polygon-showdown/play"],
      ["math-bingo-live", "Host Game", "/games/math-bingo-live/host"],
      ["math-tug-of-war", "Play Free", "/games/math-tug-of-war/play"]
    ]);
    for (const game of games) expect(freeDestinations, game.stableKey).toContain(game.primary.href);
    expect(games[1].secondary).toEqual({ label: "Join with a code", href: "/join" });
    expect(games[0]).toMatchObject({
      title: "polygon-showdown (catalog title)",
      category: "Geometry",
      secondary: null,
      image: { src: "/media/games/polygon-showdown.webp" }
    });
  });

  it("asks the play gate's question: free in the policy, with a free route that sign in can return to", () => {
    for (const key of [...PRODUCTION_CATALOG_KEYS, "a-game-nobody-has-classified"]) {
      const route = MATHNEXA_HOME_SOURCES.freePlayRoute(key);
      expect(route !== null, key).toBe(isFreeToPlayGame(key));
      if (route) expect(freeDestinations, key).toContain(route);
    }
  });

  it("never shows a new subscription game, even one with real artwork", () => {
    const games = homeFreeGames([...productionCatalog(), catalogGame("fraction-frenzy")], withFutureGames({ "fraction-frenzy": "/media/games/fraction-frenzy.webp" }));
    expect(keys(games)).toEqual(FREE_IN_HOME_ORDER);
    // Homepage copy never makes a game appear: these four have copy and stay off while they need a subscription.
    expect(HOME_GAME_COPY.filter((copy) => !isFreeToPlayGame(copy.stableKey)).map((copy) => copy.stableKey)).toEqual(["crosscalc", "number-logic", "number-cross", "math-vocabulary-hunt"]);
  });

  it("shows a new free game with no homepage list to edit: catalog title, first sentence, free route, after the games with copy", () => {
    const future = catalogGame("fraction-frenzy", {
      title: "Fraction Frenzy",
      description: "Race to build equivalent fractions before the timer ends. Up to 30 players."
    });
    const sources = withFutureGames({ "fraction-frenzy": "/media/games/fraction-frenzy.webp" }, { "fraction-frenzy": "/games/fraction-frenzy/play" });
    const games = homeFreeGames([future, ...productionCatalog()], sources);
    expect(keys(games)).toEqual([...FREE_IN_HOME_ORDER, "fraction-frenzy"]);
    expect(games[3]).toEqual({
      stableKey: "fraction-frenzy",
      title: "Fraction Frenzy",
      category: "Math game",
      blurb: "Race to build equivalent fractions before the timer ends.",
      image: { src: "/media/games/fraction-frenzy.webp", alt: "Fraction Frenzy game artwork" },
      primary: { label: "Play Free", href: "/games/fraction-frenzy/play" },
      secondary: null
    });
    // Without real artwork it stays off: a homepage card never shows a placeholder.
    expect(homeFreeGames([future], { ...sources, thumbnail: () => null })).toEqual([]);
  });

  it("follows the access policy when a game's classification changes, keeping the owner's order and copy", () => {
    const games = homeFreeGames(productionCatalog(), withFutureGames({}, { crosscalc: "/games/crosscalc/play" }));
    expect(keys(games)).toEqual([...FREE_IN_HOME_ORDER, "crosscalc"]);
    expect(games[3]).toMatchObject({
      category: "Equations",
      image: { src: "/media/games/crosscalc-v2-rc.webp" },
      primary: { label: "Play Free", href: "/games/crosscalc/play" }
    });
  });

  it("shows only published games: an unpublished free game leaves the homepage", () => {
    expect(keys(homeFreeGames(productionCatalog().filter((game) => game.stableKey !== "polygon-showdown")))).toEqual(["math-bingo-live", "math-tug-of-war"]);
    expect(homeFreeGames([])).toEqual([]);
  });

  it("falls back to the free games MathNexa has when the catalog cannot be read", () => {
    const games = homeFreeGames(null);
    expect(keys(games)).toEqual(FREE_IN_HOME_ORDER);
    expect(games.map((game) => game.title)).toEqual(["Polygon Showdown", "Math Bingo Live", "Math Tug of War"]);
    expect(games.map((game) => game.primary.href)).toEqual(["/games/polygon-showdown/play", "/games/math-bingo-live/host", "/games/math-tug-of-war/play"]);
  });

  it("keeps card copy short enough for a compact card", () => {
    for (const entry of HOME_GAME_COPY) {
      expect(entry.blurb.length, entry.stableKey).toBeLessThanOrEqual(60);
      expect(entry.category.length, entry.stableKey).toBeLessThanOrEqual(14);
      // Alt text names the game, then says what the picture shows.
      expect(entry.alt.startsWith(entry.title), entry.stableKey).toBe(true);
      expect(entry.alt.length, entry.stableKey).toBeGreaterThan(30);
      expect(entry.blurb).not.toMatch(/[“”‘’]|\d+\s?%|\$/);
    }
    expect(shortBlurb("Short and sweet.")).toBe("Short and sweet.");
    expect(shortBlurb("Version 1.0 is here. More soon.")).toBe("Version 1.0 is here.");
    expect(shortBlurb("First sentence here! Second one.")).toBe("First sentence here!");
    const long = shortBlurb("A very long description without any full stop that keeps going on and on about everything the game offers to every player");
    expect(long.length).toBeLessThanOrEqual(HOME_BLURB_LIMIT);
    expect(long.endsWith("…")).toBe(true);
    expect(long).not.toMatch(/\s…$/);
  });
});
