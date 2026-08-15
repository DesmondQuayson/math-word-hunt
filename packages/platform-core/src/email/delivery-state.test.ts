import { describe, expect, it } from "vitest";

import { AUTH_EMAIL_DELIVERY_STATES, isTransactionalAuthEmailVerified, parseAuthEmailDeliveryState } from "./delivery-state";

describe("Auth email delivery state", () => {
  it.each(AUTH_EMAIL_DELIVERY_STATES)("parses %s", (state) => expect(parseAuthEmailDeliveryState(state)).toBe(state));
  it.each([undefined, null, "capture", "verified", "transactional", true])("fails closed for %j", (value) => {
    expect(parseAuthEmailDeliveryState(value)).toBeNull();
    expect(isTransactionalAuthEmailVerified(value)).toBe(false);
  });
  it("treats only the verified transactional state as verified", () => {
    expect(isTransactionalAuthEmailVerified("transactional-configured")).toBe(false);
    expect(isTransactionalAuthEmailVerified("transactional-verified")).toBe(true);
  });
});
