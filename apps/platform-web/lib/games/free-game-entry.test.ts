import { describe, expect, it } from "vitest";

import { FREE_GAME_DESTINATIONS } from "@/lib/auth/access-intent";
import { gameAccessPolicy } from "@/lib/games/access-policy";

import { freeGameEntryRoute } from "./free-game-entry";
import { MATHNEXA_HOME_SOURCES } from "./home-free-games";

// Production's game catalog as read on 2026-11-10, in catalog display order.
const PRODUCTION_CATALOG_KEYS = ["math-vocabulary-hunt", "number-cross", "number-logic", "crosscalc", "math-tug-of-war", "math-bingo-live", "polygon-showdown"];
const freeDestinations: readonly string[] = FREE_GAME_DESTINATIONS;

describe("freeGameEntryRoute", () => {
  it("gives each free game the route the play gate admits any signed-in account to", () => {
    expect(PRODUCTION_CATALOG_KEYS.map((key) => [key, freeGameEntryRoute(key)])).toEqual([
      ["math-vocabulary-hunt", null],
      ["number-cross", null],
      ["number-logic", null],
      ["crosscalc", null],
      ["math-tug-of-war", "/games/math-tug-of-war/play"],
      ["math-bingo-live", "/games/math-bingo-live/host"],
      ["polygon-showdown", "/games/polygon-showdown/play"]
    ]);
    for (const key of PRODUCTION_CATALOG_KEYS) {
      const route = freeGameEntryRoute(key);
      if (route === null) expect(gameAccessPolicy(key), key).toBe("entitled");
      else expect(freeDestinations, key).toContain(route);
    }
  });

  it("gives no route to a game it does not know, whatever its name", () => {
    for (const key of ["fraction-frenzy", "", "constructor", "__proto__", "toString", "hasOwnProperty"]) expect(freeGameEntryRoute(key), key).toBeNull();
  });

  it("is the rule the homepage cards use", () => {
    expect(MATHNEXA_HOME_SOURCES.freePlayRoute).toBe(freeGameEntryRoute);
  });
});
