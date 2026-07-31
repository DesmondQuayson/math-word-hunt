import { describe, expect, it } from "vitest";

import { readBoundedBillingBody } from "./bounded-body";

describe("bounded Stripe webhook body", () => {
  it("preserves the raw body and rejects oversized payloads", async () => {
    await expect(readBoundedBillingBody(new Request("https://example.invalid", {
      method: "POST",
      body: "signed payload"
    }))).resolves.toBe("signed payload");
    await expect(readBoundedBillingBody(new Request("https://example.invalid", {
      method: "POST",
      headers: { "content-length": "999999" },
      body: "small"
    }))).resolves.toBeNull();
    await expect(readBoundedBillingBody(new Request("https://example.invalid", {
      method: "POST",
      body: "x".repeat(64 * 1024 + 1)
    }))).resolves.toBeNull();
  });
});
