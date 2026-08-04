import { describe, expect, it } from "vitest";

import {
  ACCESS_INTENT_DESTINATIONS,
  PRODUCT_DESTINATIONS,
  accessIntentHref,
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
      expect(safeAccessIntentDestination(value)).toBe("/account");
    }
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
