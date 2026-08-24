import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  context: {} as Record<string, unknown>,
  schoolSession: null as Record<string, unknown> | null,
  accessAllowed: false
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((destination: string) => { throw new Error(`REDIRECT:${destination}`); })
}));
vi.mock("@/app/consumer-actions", () => ({ requestConsumerDeletionAction: vi.fn() }));
vi.mock("@/app/auth-actions", () => ({ signOutAction: vi.fn() }));
vi.mock("@/app/school-access-actions", () => ({
  authorizeSchoolAccessAction: vi.fn(async (formState) => formState),
  exitSchoolAccessAction: vi.fn()
}));
vi.mock("@/lib/auth/consumer-context", () => ({
  resolveConsumerContext: vi.fn(async () => state.context)
}));
vi.mock("@/lib/game-access/server", () => ({
  getGameAccessView: vi.fn(async () => ({ decision: { allowed: state.accessAllowed } }))
}));
vi.mock("@/lib/school-access/session", () => ({
  resolveSchoolAccessSession: vi.fn(async () => state.schoolSession)
}));

import { ConsumerAccountPage } from "./consumer-account-page";

const account = {
  userId: "22222222-2222-4222-8222-222222222222",
  accountStatus: "active",
  emailConfirmedAt: "2026-08-24T12:00:00.000Z",
  trialRedeemedAt: null,
  deletionRequestedAt: null,
  deletionCompletedAt: null,
  createdAt: "2026-08-24T12:00:00.000Z",
  updatedAt: "2026-08-24T12:00:00.000Z"
};

async function renderAccount() {
  render(await ConsumerAccountPage({}));
}

function expectAuthorizedCodeField() {
  expect(screen.getByRole("heading", { name: "Enter authorized code to access MathNexa" })).toBeTruthy();
  expect(screen.getByLabelText(/^Authorized code/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();
}

beforeEach(() => {
  vi.clearAllMocks();
  state.context = { status: "anonymous", userId: null, email: null, account: null };
  state.schoolSession = null;
  state.accessAllowed = false;
});

afterEach(cleanup);

describe("permanent authorized-code visibility on consumer account controls", () => {
  it("shows active status instead of asking an active authorized-code session again", async () => {
    state.schoolSession = { id: "11111111-1111-4111-8111-111111111111" };
    await renderAccount();
    expect(screen.getByRole("heading", { name: "Authorized access active" })).toBeTruthy();
    expect(screen.queryByLabelText(/^Authorized code/)).toBeNull();
    expect(screen.getByRole("button", { name: "Exit authorized access" })).toBeTruthy();
  });

  it("is visible to an unconfirmed existing user", async () => {
    state.context = { status: "unconfirmed", userId: account.userId, email: "owner@example.test", account: null };
    await renderAccount();
    expectAuthorizedCodeField();
  });

  it("is visible when a signed-in account record is unavailable", async () => {
    state.context = { status: "missing-account", userId: account.userId, email: "owner@example.test", account: null };
    await renderAccount();
    expectAuthorizedCodeField();
  });

  it.each([
    ["active subscriber", true],
    ["expired or non-entitled subscriber", false]
  ])("is visible to a signed-in %s", async (_label, allowed) => {
    state.context = { status: "active", userId: account.userId, email: "owner@example.test", account };
    state.accessAllowed = allowed;
    await renderAccount();
    expectAuthorizedCodeField();
    expect(screen.getByText(allowed ? "Available" : "Unavailable")).toBeTruthy();
  });
});
