// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  context: { status: "anonymous", userId: null, email: null, account: null } as Record<string, unknown>,
  schoolSession: {
    id: "11111111-1111-4111-8111-111111111111",
    issuedAt: 1_788_000_000,
    expiresAt: 1_788_043_200
  } as Record<string, unknown> | null
}));

const resolveSchool = vi.hoisted(() => vi.fn(async () => state.schoolSession));

vi.mock("@/lib/auth/consumer-context", () => ({ resolveConsumerContext: vi.fn(async () => state.context) }));
vi.mock("@/lib/school-access/session", () => ({ resolveSchoolAccessSession: resolveSchool }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn(async () => null) }));

import { MATHNEXA_ALL_ACCESS, MATHNEXA_PRODUCT_MODULES } from "@math-vocabulary-hunt/platform-core";
import { getGameAccessView } from "./server";

beforeEach(() => {
  vi.clearAllMocks();
  state.context = { status: "anonymous", userId: null, email: null, account: null };
  state.schoolSession = {
    id: "11111111-1111-4111-8111-111111111111",
    issuedAt: 1_788_000_000,
    expiresAt: 1_788_043_200
  };
});

describe("central all-access decision for authorized school sessions", () => {
  it("grants every existing all-access module through one server-owned decision", async () => {
    const view = await getGameAccessView(new Date(1_788_000_100 * 1000));
    expect(view.source).toBe("school-access");
    expect(view.principal).toEqual({ kind: "school-access", id: state.schoolSession?.id });
    expect(view.decision.allowed).toBe(true);
    expect(view.decision.capabilityKey).toBe(MATHNEXA_ALL_ACCESS);
    expect(view.decision.modules).toEqual(MATHNEXA_PRODUCT_MODULES);
  });

  it("does not consult school access when a registered account is present", async () => {
    state.context = {
      status: "unconfirmed",
      userId: "22222222-2222-4222-8222-222222222222",
      email: "person@example.test",
      account: null
    };
    const view = await getGameAccessView(new Date(1_788_000_100 * 1000));
    expect(view.source).toBe("default-deny");
    expect(view.decision.allowed).toBe(false);
    expect(resolveSchool).not.toHaveBeenCalled();
  });
});
