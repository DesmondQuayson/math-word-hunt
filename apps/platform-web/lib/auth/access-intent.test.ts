import { describe, expect, it } from "vitest";

import {
  ACCESS_INTENT_DESTINATIONS,
  POST_AUTH_DESTINATION,
  PRODUCT_DESTINATIONS,
  accessIntentHref,
  destinationLabel,
  safeAccessIntentDestination,
  safeProductDestination,
  subscriptionReviewHref
} from "./access-intent";

describe("consumer access intent", () => {
  it("accepts only exact server-owned destinations", () => {
    for (const destination of ACCESS_INTENT_DESTINATIONS) {
      expect(safeAccessIntentDestination(destination)).toBe(destination);
    }
    for (const value of [
      "https://attacker.example",
      "//attacker.example/games",
      "javascript:alert(1)",
      "data:text/html,attack",
      "file:///etc/passwd",
      "%2Fgames",
      "%252Fgames",
      "/games?entitlement=active",
      "/games#launch",
      "/games/../admin",
      " games",
      "/Games"
    ]) {
      expect(safeAccessIntentDestination(value)).toBe(POST_AUTH_DESTINATION);
    }
  });

  it("lands a completed sign-in on Home rather than the account page", () => {
    // The default IS the change: someone who just chose "Sign in" should get
    // the product, not a billing-and-security page.
    expect(POST_AUTH_DESTINATION).toBe("/");
    expect(safeAccessIntentDestination(undefined)).toBe("/");
    expect(safeAccessIntentDestination("")).toBe("/");
    expect(safeAccessIntentDestination(null)).toBe("/");
    // Home is server-owned, so an explicit next=/ is honoured rather than
    // silently rewritten.
    expect(safeAccessIntentDestination("/")).toBe("/");
    // Account remains reachable when it is actually asked for.
    expect(safeAccessIntentDestination("/account")).toBe("/account");
    expect(destinationLabel("/")).toBe("Home");
  });

  it("keeps Home out of the product allowlist", () => {
    // safeProductDestination answers "which product did they want"; Home is not
    // one, and widening it would let a product gate resolve to the marketing
    // page.
    expect(safeProductDestination("/")).toBe("/games");
  });

  it("keeps product and subscription paths inside exact allowlists", () => {
    for (const destination of PRODUCT_DESTINATIONS) {
      expect(safeProductDestination(destination)).toBe(destination);
      expect(accessIntentHref(destination)).toBe(`/access?next=${destination}`);
      expect(subscriptionReviewHref(destination)).toBe(`/subscription?next=${destination}`);
    }
    expect(safeProductDestination("/account")).toBe("/games");
  });
});
