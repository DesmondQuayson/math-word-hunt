import { describe, expect, it } from "vitest";

import {
  ADMIN_SESSION_IDLE_MINUTES,
  ADMIN_SESSION_MAX_MINUTES,
  ADMIN_STEP_UP_FRESH_MINUTES,
  adminSessionDeadline,
  isAdminSessionIdle,
  isAdminStepUpFresh,
  safeAdminNextPath,
  shouldRecordAdminActivity,
  STEP_UP_ACCOUNT_OPERATIONS
} from "./session-policy";

const clock = {
  expires_at: "2026-09-30T12:00:00.000Z",
  last_activity_at: "2026-09-30T10:30:00.000Z",
  step_up_at: "2026-09-30T10:00:00.000Z"
};

describe("Phase 2B admin session policy", () => {
  it("is the approved policy", () => {
    expect(ADMIN_SESSION_MAX_MINUTES).toBe(120);
    expect(ADMIN_SESSION_IDLE_MINUTES).toBe(60);
    expect(ADMIN_STEP_UP_FRESH_MINUTES).toBe(5);
  });

  it("ends at whichever comes first: the absolute expiry or 60 minutes after the last activity", () => {
    expect(adminSessionDeadline(clock)).toMatchObject({ idleExpiresAt: Date.parse("2026-09-30T11:30:00.000Z"), endsBy: "idle" });
    expect(adminSessionDeadline({ ...clock, last_activity_at: "2026-09-30T11:45:00.000Z" }))
      .toMatchObject({ effectiveExpiresAt: Date.parse(clock.expires_at), endsBy: "absolute" });
  });

  it("never lets activity move the absolute expiry", () => {
    const late = adminSessionDeadline({ ...clock, last_activity_at: "2026-09-30T11:59:00.000Z" });
    expect(late.absoluteExpiresAt).toBe(Date.parse(clock.expires_at));
    expect(late.effectiveExpiresAt).toBe(Date.parse(clock.expires_at));
  });

  it("detects idle expiry at exactly 60 minutes", () => {
    expect(isAdminSessionIdle(clock, new Date("2026-09-30T11:29:59.000Z"))).toBe(false);
    expect(isAdminSessionIdle(clock, new Date("2026-09-30T11:30:00.000Z"))).toBe(true);
  });

  it("writes activity at most once a minute", () => {
    expect(shouldRecordAdminActivity(clock, new Date("2026-09-30T10:30:59.000Z"))).toBe(false);
    expect(shouldRecordAdminActivity(clock, new Date("2026-09-30T10:31:00.000Z"))).toBe(true);
  });

  it("treats a step-up as fresh for 5 minutes", () => {
    expect(isAdminStepUpFresh(clock, new Date("2026-09-30T10:04:59.000Z"))).toBe(true);
    expect(isAdminStepUpFresh(clock, new Date("2026-09-30T10:05:00.000Z"))).toBe(false);
    expect(isAdminStepUpFresh({ ...clock, step_up_at: "not a date" }, new Date("2026-09-30T10:01:00.000Z"))).toBe(false);
  });

  it("requires step-up for the dangerous account operations but not the safe ones", () => {
    for (const operation of ["suspend", "restore", "revoke-sessions", "emergency-revoke", "grant-complimentary", "remove-complimentary", "deny-refund-review", "submit-refund-review", "open-portal", "cancel-at-period-end"]) {
      expect(STEP_UP_ACCOUNT_OPERATIONS.has(operation), operation).toBe(true);
    }
    expect(STEP_UP_ACCOUNT_OPERATIONS.has("sync-billing")).toBe(false);
    expect(STEP_UP_ACCOUNT_OPERATIONS.has("resend-confirmation")).toBe(false);
  });
});

describe("Phase 2B return destination after signing in again", () => {
  it("accepts admin pages", () => {
    expect(safeAdminNextPath("/admin")).toBe("/admin");
    expect(safeAdminNextPath("/admin?section=users")).toBe("/admin?section=users");
    expect(safeAdminNextPath("/admin/resources/3f2504e0-4f89-41d3-9a0c-0305e82c3301")).toBe("/admin/resources/3f2504e0-4f89-41d3-9a0c-0305e82c3301");
    expect(safeAdminNextPath("/admin/games/3f2504e0-4f89-41d3-9a0c-0305e82c3301/preview")).toBe("/admin/games/3f2504e0-4f89-41d3-9a0c-0305e82c3301/preview");
    expect(safeAdminNextPath("/admin/map-prep")).toBe("/admin/map-prep");
  });

  it("drops one-shot flags and fragments", () => {
    expect(safeAdminNextPath("/admin?section=users&csrf=invalid#top")).toBe("/admin?section=users");
  });

  it("rejects other sites, protocol-relative and scheme URLs", () => {
    for (const value of ["https://evil.example/admin", "//evil.example/admin", "/\\evil.example", "javascript:alert(1)", "http:/admin", "evil.example/admin"]) {
      expect(safeAdminNextPath(value), value).toBeNull();
    }
  });

  it("rejects non-admin paths, lookalikes, traversal and API routes", () => {
    for (const value of ["/", "/account", "/administrator", "/admin/../account", "/admin/%2e%2e/account", "/admin/users/action", "/admin/analytics/export", "/admin/sign-in", "/admin/mfa", "/admin/session/activity"]) {
      expect(safeAdminNextPath(value), value).toBeNull();
    }
  });

  it("rejects control characters, oversized values and non-strings", () => {
    expect(safeAdminNextPath("/admin\n?section=users")).toBeNull();
    expect(safeAdminNextPath(`/admin?query=${"x".repeat(600)}`)).toBeNull();
    expect(safeAdminNextPath(undefined)).toBeNull();
    expect(safeAdminNextPath(["/admin"])).toBeNull();
    expect(safeAdminNextPath("")).toBeNull();
  });
});
