// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  context: { status: "anonymous", userId: null, email: null, account: null } as Record<string, unknown>,
  rateAllowed: true
}));

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((destination: string) => { throw new Error(`REDIRECT:${destination}`); }),
  consume: vi.fn(async () => state.rateAllowed),
  clearAttempts: vi.fn(async () => undefined),
  startSession: vi.fn(async () => ({ id: "11111111-1111-4111-8111-111111111111", issuedAt: 1, expiresAt: 2 })),
  clearSession: vi.fn(async () => undefined)
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth/consumer-context", () => ({ resolveConsumerContext: vi.fn(async () => state.context) }));
vi.mock("@/lib/school-access/rate-limit", () => ({
  consumeSchoolAccessAttempt: mocks.consume,
  clearSchoolAccessAttempts: mocks.clearAttempts
}));
vi.mock("@/lib/school-access/session", () => ({
  startSchoolAccessSession: mocks.startSession,
  clearSchoolAccessSession: mocks.clearSession
}));

import {
  authorizeSchoolAccessAction,
  exitSchoolAccessAction
} from "@/app/school-access-actions";
import { initialAuthorizedCodeFormState } from "./form-state";

function form(code: string, next = "/map-prep"): FormData {
  const data = new FormData();
  data.set("authorizedCode", code);
  data.set("next", next);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  state.context = { status: "anonymous", userId: null, email: null, account: null };
  state.rateAllowed = true;
  process.env = {
    ...process.env,
    MATHNEXA_SCHOOL_ACCESS_CODE: "AESM",
    MATHNEXA_SCHOOL_ACCESS_SESSION_SECRET: "school-access-session-test-secret-32-bytes-minimum"
  };
});

describe("authorized-code server action", () => {
  it.each(["AESM", "aesm", "Aesm", " AESM "])("accepts normalized code %j and preserves the safe destination", async (code) => {
    await expect(authorizeSchoolAccessAction(initialAuthorizedCodeFormState, form(code)))
      .rejects.toThrow("REDIRECT:/map-prep");
    expect(mocks.startSession).toHaveBeenCalledOnce();
    expect(mocks.clearAttempts).toHaveBeenCalledOnce();
  });

  it("returns one generic denial without creating a session", async () => {
    await expect(authorizeSchoolAccessAction(initialAuthorizedCodeFormState, form("wrong")))
      .resolves.toEqual({ status: "error", message: "Invalid authorized code." });
    expect(mocks.startSession).not.toHaveBeenCalled();
  });

  it("blocks unsafe and external next destinations", async () => {
    // A destination the server does not own is refused and replaced by the
    // post-authentication default (Home) — never followed.
    for (const hostile of [
      "https://attacker.example",
      "//attacker.example/games",
      "javascript:alert(1)",
      "/games/../admin",
      "%2Fgames"
    ]) {
      await expect(authorizeSchoolAccessAction(initialAuthorizedCodeFormState, form("AESM", hostile)))
        .rejects.toThrow("REDIRECT:/");
    }
  });

  it("fails closed when persistent rate limiting is unavailable or exhausted", async () => {
    state.rateAllowed = false;
    await expect(authorizeSchoolAccessAction(initialAuthorizedCodeFormState, form("AESM")))
      .resolves.toMatchObject({ status: "error" });
    expect(mocks.startSession).not.toHaveBeenCalled();
  });

  it("keeps a registered account authoritative and does not create school access", async () => {
    state.context = { status: "active", userId: "22222222-2222-4222-8222-222222222222", email: "person@example.test", account: {} };
    await expect(authorizeSchoolAccessAction(initialAuthorizedCodeFormState, form("AESM", "/games")))
      .rejects.toThrow("REDIRECT:/games");
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.startSession).not.toHaveBeenCalled();
  });

  it("exits only the school session", async () => {
    await expect(exitSchoolAccessAction()).rejects.toThrow("REDIRECT:/");
    expect(mocks.clearSession).toHaveBeenCalledOnce();
  });
});
