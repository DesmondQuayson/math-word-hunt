import { describe, expect, it } from "vitest";
import { parseAdminAccountAction } from "./model";

const base = { targetUserId: "81000000-0000-4000-8000-000000000001", idempotencyKey: "admin-op:81000000-0000-4000-8000-000000000001" };

describe("Phase 8G admin account action contract", () => {
  it("accepts bounded low-risk and complimentary operations", () => {
    expect(parseAdminAccountAction({ ...base, operation: "resend-confirmation" })?.reason).toBeNull();
    expect(parseAdminAccountAction({ ...base, operation: "grant-complimentary", reason: "Owner-approved access", durationDays: "30" })?.durationDays).toBe(30);
  });

  it("requires bounded reasons and rejects browser-shaped authority", () => {
    expect(parseAdminAccountAction({ ...base, operation: "suspend" })).toBeNull();
    expect(parseAdminAccountAction({ ...base, operation: "grant-complimentary", reason: "ok", durationDays: "365" })).toBeNull();
    expect(parseAdminAccountAction({ ...base, operation: "make-owner", reason: "attempt" })).toBeNull();
    expect(parseAdminAccountAction({ ...base, operation: "suspend", reason: "x".repeat(501) })).toBeNull();
  });
});
