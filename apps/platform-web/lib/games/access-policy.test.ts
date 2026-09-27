// @vitest-environment node

import { MATHNEXA_ALL_ACCESS } from "@math-vocabulary-hunt/platform-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FREE_GAME_DESTINATIONS, POST_AUTH_DESTINATION, destinationLabel, isFreeGameDestination, safeAccessIntentDestination, safeProductDestination } from "@/lib/auth/access-intent";
import { safeInternalRedirect } from "@/lib/auth/safe-redirect";

import { MATH_TUG_OF_WAR_PLAY_ROUTE, freeGameKeyForSlug, freeGamePlayRoute, gameAccessPolicy, isFreeToPlayGame } from "./access-policy";
import { internalGameKeys } from "./internal-registry";

const mocks = vi.hoisted(() => ({
  getGameAccessView: vi.fn(),
  redirect: vi.fn((target: string) => { throw new Error(`REDIRECT ${target}`); })
}));
vi.mock("@/lib/game-access/server", () => ({ getGameAccessView: mocks.getGameAccessView }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { canPlayGame, isSignedInFreePlayer, requireGamePlayAccess } from "@/lib/access/server";

const CONFIRMED = "2026-09-01T00:00:00Z";
const entitled = { allowed: true, capabilityKey: MATHNEXA_ALL_ACCESS, modules: ["games", "map_prep", "homework", "quizzes"], reason: "active", nextAction: null };
const denied = { allowed: false, capabilityKey: null, modules: [], reason: "subscription-required", nextAction: "subscribe" };
function consumer(status: "active" | "suspended" | "deletion-pending", decision: object, emailConfirmedAt: string | null = CONFIRMED) {
  return {
    context: { status, userId: "u", email: null, account: { userId: "u", accountStatus: status, emailConfirmedAt, trialRedeemedAt: null, deletionRequestedAt: null, deletionCompletedAt: null, createdAt: CONFIRMED, updatedAt: CONFIRMED } },
    decision, source: "server-authoritative", principal: { kind: "consumer", id: "u" }
  };
}
const VIEWS = {
  anonymous: { context: { status: "anonymous", userId: null, email: null, account: null }, decision: { ...denied, reason: "authentication-required" }, source: "default-deny", principal: null },
  unconfirmed: { context: { status: "unconfirmed", userId: "u", email: null, account: null }, decision: denied, source: "default-deny", principal: { kind: "consumer", id: "u" } },
  missingAccount: { context: { status: "missing-account", userId: "u", email: null, account: null }, decision: denied, source: "default-deny", principal: { kind: "consumer", id: "u" } },
  freeAccount: consumer("active", denied),
  usedTrial: consumer("active", { ...denied, reason: "trial-expired" }),
  activeTrial: consumer("active", entitled),
  subscriber: consumer("active", entitled),
  cancellationScheduled: consumer("active", entitled),
  paymentProblem: consumer("active", { ...denied, reason: "payment-problem" }),
  suspended: consumer("suspended", denied),
  deletionPending: consumer("deletion-pending", denied),
  school: { context: { status: "anonymous", userId: null, email: null, account: null }, decision: entitled, source: "school-access", principal: { kind: "school-access", id: "s" } }
} as const;

beforeEach(() => {
  mocks.getGameAccessView.mockReset();
  mocks.redirect.mockClear();
});

describe("game access classification", () => {
  it("only Math Tug of War is authenticated-free; every other game (and anything unknown) stays entitled", () => {
    expect(gameAccessPolicy("math-tug-of-war")).toBe("authenticated-free");
    for (const key of [...internalGameKeys().filter((key) => key !== "math-tug-of-war"), "math-vocabulary-hunt", "unknown", "__proto__", "constructor"]) {
      expect(gameAccessPolicy(key), key).toBe("entitled");
      expect(isFreeToPlayGame(key), key).toBe(false);
      expect(freeGameKeyForSlug(key), key).toBeNull();
    }
    expect(freeGameKeyForSlug("math-tug-of-war")).toBe("math-tug-of-war");
    expect(freeGamePlayRoute("math-tug-of-war")).toBe(MATH_TUG_OF_WAR_PLAY_ROUTE);
  });

  it("the free game's route is an exact server-owned return destination, but never a product/subscription destination", () => {
    expect(FREE_GAME_DESTINATIONS).toEqual([MATH_TUG_OF_WAR_PLAY_ROUTE]);
    expect(isFreeGameDestination(MATH_TUG_OF_WAR_PLAY_ROUTE)).toBe(true);
    expect(safeAccessIntentDestination(MATH_TUG_OF_WAR_PLAY_ROUTE)).toBe(MATH_TUG_OF_WAR_PLAY_ROUTE);
    expect(safeInternalRedirect(MATH_TUG_OF_WAR_PLAY_ROUTE)).toBe(MATH_TUG_OF_WAR_PLAY_ROUTE);
    expect(destinationLabel(MATH_TUG_OF_WAR_PLAY_ROUTE)).toBe("Math Tug of War");
    expect(safeProductDestination(MATH_TUG_OF_WAR_PLAY_ROUTE)).toBe("/games");
    for (const lookalike of ["/games/math-tug-of-war/play/", "/games/math-tug-of-war", "/games/number-logic/play", "/games/math-tug-of-war/play?x=1", "//games/math-tug-of-war/play"]) {
      expect(isFreeGameDestination(lookalike), lookalike).toBe(false);
      expect(safeAccessIntentDestination(lookalike), lookalike).toBe(POST_AUTH_DESTINATION);
    }
  });
});

describe("Math Tug of War access matrix (signed-in free)", () => {
  it.each([
    ["authenticated no subscription", "freeAccount", true],
    ["used trial / no entitlement", "usedTrial", true],
    ["active trial", "activeTrial", true],
    ["paid subscriber", "subscriber", true],
    ["scheduled cancellation with access", "cancellationScheduled", true],
    ["payment problem, still signed in", "paymentProblem", true],
    ["school-code session", "school", true],
    ["anonymous", "anonymous", false],
    ["unconfirmed email", "unconfirmed", false],
    ["missing account record", "missingAccount", false],
    ["account-level suspension", "suspended", false],
    ["account pending deletion", "deletionPending", false]
  ] as const)("%s → %s", (_label, view, allowed) => {
    expect(isSignedInFreePlayer(VIEWS[view] as never)).toBe(allowed);
    expect(canPlayGame(VIEWS[view] as never, "math-tug-of-war")).toBe(allowed);
  });

  it("other games keep the entitlement rule: a signed-in non-subscriber cannot play them", () => {
    for (const game of ["number-cross", "number-logic", "crosscalc", "math-vocabulary-hunt"]) {
      expect(canPlayGame(VIEWS.freeAccount as never, game), game).toBe(false);
      expect(canPlayGame(VIEWS.usedTrial as never, game), game).toBe(false);
      expect(canPlayGame(VIEWS.subscriber as never, game), game).toBe(true);
      expect(canPlayGame(VIEWS.school as never, game), game).toBe(true);
      expect(canPlayGame(VIEWS.anonymous as never, game), game).toBe(false);
    }
  });

  it("the play gate lets signed-in players through and sends others to sign-in, confirmation or account — never pricing, checkout, subscription or trial", async () => {
    for (const view of ["freeAccount", "subscriber", "school", "usedTrial"] as const) {
      mocks.getGameAccessView.mockResolvedValue(VIEWS[view]);
      await expect(requireGamePlayAccess("math-tug-of-war")).resolves.toBe(VIEWS[view]);
    }
    const expectations = [
      ["anonymous", `/access?next=${MATH_TUG_OF_WAR_PLAY_ROUTE}`],
      ["unconfirmed", `/confirmation-required?next=${MATH_TUG_OF_WAR_PLAY_ROUTE}`],
      ["suspended", "/account"],
      ["missingAccount", "/account"]
    ] as const;
    for (const [view, target] of expectations) {
      mocks.getGameAccessView.mockResolvedValue(VIEWS[view]);
      await expect(requireGamePlayAccess("math-tug-of-war")).rejects.toThrow(`REDIRECT ${target}`);
      expect(target).not.toMatch(/pricing|checkout|subscription|trial/);
    }
  });
});
