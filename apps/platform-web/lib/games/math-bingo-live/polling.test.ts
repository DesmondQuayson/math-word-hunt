import { describe, expect, it } from "vitest";

import { DEADLINE_SPREAD_MS, pollInterval } from "@/public/internal-games/math-bingo-live/src/api.js";

describe("Math Bingo Live polling", () => {
  it("polls at the base rate up to 30 players", () => {
    for (const players of [0, 1, 12, 30]) expect(pollInterval(1000, players)).toBe(1000);
    expect(pollInterval(800, 25)).toBe(800);
  });

  it("slows a larger class so it makes about as many requests as 30 players", () => {
    expect(pollInterval(1000, 45)).toBe(1500);
    expect(pollInterval(1000, 50)).toBe(1667);
    expect(pollInterval(800, 50)).toBe(1333);
    for (const players of [10, 30, 45, 50, 60]) {
      const perSecond = players * (1000 / pollInterval(1000, Math.max(players, 0)));
      expect(perSecond).toBeLessThanOrEqual(30.5);
    }
  });

  it("never waits more than twice the base, even past the 60-player cap", () => {
    expect(pollInterval(1000, 60)).toBe(2000);
    expect(pollInterval(1000, 500)).toBe(2000);
  });

  it("treats a missing or malformed count as a small class", () => {
    expect(pollInterval(1000, undefined as unknown as number)).toBe(1000);
    expect(pollInterval(1000, Number.NaN)).toBe(1000);
  });

  it("spreads deadline polls over a short window", () => {
    expect(DEADLINE_SPREAD_MS).toBeGreaterThan(0);
    expect(DEADLINE_SPREAD_MS).toBeLessThanOrEqual(500);
  });
});
