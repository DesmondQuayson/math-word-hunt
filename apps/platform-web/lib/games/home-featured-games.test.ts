import { describe, expect, it } from "vitest";

import { isFreeToPlayGame } from "@/lib/games/access-policy";

import { HOME_FEATURED_GAME_ORDER, homeFeaturedGames, type HomeCatalogGame } from "./home-featured-games";

const ORDER = ["polygon-showdown", "math-bingo-live", "math-tug-of-war", "crosscalc", "number-logic", "number-cross", "math-vocabulary-hunt"];

const catalogGame = (stableKey: string, overrides: Partial<HomeCatalogGame> = {}): HomeCatalogGame => ({
  stableKey,
  title: `${stableKey} (catalog title)`,
  thumbnailReference: `builtin:${stableKey}`,
  playHref: `/games/${stableKey}/play`,
  ...overrides
});

describe("homepage game library", () => {
  it("lists the seven games once each, Polygon Showdown first, then the other free games, then the subscription games", () => {
    expect(HOME_FEATURED_GAME_ORDER.map((entry) => entry.stableKey)).toEqual(ORDER);
    const firstPaid = ORDER.findIndex((key) => !isFreeToPlayGame(key));
    expect(ORDER.slice(0, firstPaid).every(isFreeToPlayGame)).toBe(true);
    expect(ORDER.slice(firstPaid).some(isFreeToPlayGame)).toBe(false);
  });

  it("shows only published catalog games, in homepage order, with the catalog's titles", () => {
    const games = homeFeaturedGames([catalogGame("number-cross"), catalogGame("math-tug-of-war"), catalogGame("polygon-showdown"), catalogGame("some-future-game")]);
    expect(games.map((game) => game.stableKey)).toEqual(["polygon-showdown", "math-tug-of-war", "number-cross"]);
    expect(games[0].title).toBe("polygon-showdown (catalog title)");
    expect(homeFeaturedGames([])).toEqual([]);
  });

  it("falls back to the full curated list when the catalog cannot be read", () => {
    const games = homeFeaturedGames(null);
    expect(games.map((game) => game.stableKey)).toEqual(ORDER);
    expect(games.map((game) => game.primary.href)).toEqual([
      "/games/polygon-showdown/play",
      "/games/math-bingo-live/host",
      "/games/math-tug-of-war/play",
      "/games/crosscalc/play",
      "/games/number-logic/play",
      "/games/number-cross/play",
      "/play"
    ]);
  });

  it("marks a game Free only when the access policy does, and sends free games straight to their play or host route", () => {
    const games = homeFeaturedGames(ORDER.map((key) => catalogGame(key, { playHref: "/somewhere-else" })));
    for (const game of games) {
      expect(game.free, game.stableKey).toBe(isFreeToPlayGame(game.stableKey));
      if (game.free) {
        expect(game.primary.href).toMatch(/^\/games\/[a-z-]+\/(play|host)$/);
        expect(game.primary.label).toMatch(/^(Play Free|Host Game)$/);
      } else {
        // Subscription games keep the catalog's own route and never claim to be free.
        expect(game.primary.href).toBe("/somewhere-else");
        expect(game.primary.label).toBe("Play Now");
      }
    }
    const polygon = games.find((game) => game.stableKey === "polygon-showdown")!;
    expect(polygon).toMatchObject({ free: true, category: "Geometry", primary: { label: "Play Free", href: "/games/polygon-showdown/play" }, secondary: null });
    const bingo = games.find((game) => game.stableKey === "math-bingo-live")!;
    expect(bingo.primary).toEqual({ label: "Host Game", href: "/games/math-bingo-live/host" });
    expect(bingo.secondary).toEqual({ label: "Join with a code", href: "/join" });
  });

  it("uses each game's real thumbnail, following the catalog's CrossCalc artwork version", () => {
    const games = homeFeaturedGames(ORDER.map((key) => catalogGame(key, key === "crosscalc" ? { thumbnailReference: "builtin:crosscalc-v2" } : {})));
    for (const game of games) {
      expect(game.image.src, game.stableKey).toMatch(/^\/media\/games\/[a-z0-9-]+\.(webp|svg)$/);
      // Alt text names the game, then says what the picture shows.
      expect(game.image.alt.startsWith(HOME_FEATURED_GAME_ORDER.find((entry) => entry.stableKey === game.stableKey)!.title), game.stableKey).toBe(true);
    }
    expect(games.find((game) => game.stableKey === "polygon-showdown")!.image.src).toBe("/media/games/polygon-showdown.webp");
    expect(games.find((game) => game.stableKey === "crosscalc")!.image.src).toBe("/media/games/crosscalc-v2-rc.webp");
    expect(homeFeaturedGames([catalogGame("crosscalc", { thumbnailReference: "builtin:crosscalc" })])[0].image.src).toBe("/media/games/crosscalc.svg");
  });

  it("keeps card copy short enough for a compact card", () => {
    for (const entry of HOME_FEATURED_GAME_ORDER) {
      expect(entry.blurb.length, entry.stableKey).toBeLessThanOrEqual(60);
      expect(entry.category.length, entry.stableKey).toBeLessThanOrEqual(14);
      expect(entry.alt.length, entry.stableKey).toBeGreaterThan(30);
      expect(entry.blurb).not.toMatch(/[“”‘’]|\d+\s?%|\$/);
    }
  });
});
