import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  context: {} as Record<string, unknown>,
  schoolSession: null as Record<string, unknown> | null
}));

vi.mock("@/app/auth-actions", () => ({ signOutAction: vi.fn() }));
vi.mock("@/app/school-access-actions", () => ({
  authorizeSchoolAccessAction: vi.fn(async (formState) => formState),
  exitSchoolAccessAction: vi.fn()
}));
vi.mock("@/lib/auth/consumer-context", () => ({
  resolveConsumerContext: vi.fn(async () => state.context)
}));
vi.mock("@/lib/school-access/session", () => ({
  resolveSchoolAccessSession: vi.fn(async () => state.schoolSession)
}));

import AccessIntentPage from "@/app/access/page";

async function renderAccessPage() {
  render(await AccessIntentPage({ searchParams: Promise.resolve({ next: "/map-prep" }) }));
}

function expectInlineAuthorizedCode() {
  expect(screen.getByRole("heading", { name: "Enter authorized code to access MathNexa" })).toBeTruthy();
  expect(screen.getByLabelText(/^Authorized code/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();
}

beforeEach(() => {
  vi.clearAllMocks();
  state.context = { status: "anonymous", userId: null, email: null, account: null };
  state.schoolSession = null;
});

afterEach(cleanup);

describe("authorized-code initial visibility on /access", () => {
  it("renders sign-in, account creation, and the code field together for signed-out visitors", async () => {
    await renderAccessPage();
    expect(screen.getByRole("link", { name: "Sign in" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Create account" })).toBeTruthy();
    expectInlineAuthorizedCode();
    expect(document.body.textContent).not.toContain("Use the code provided by your school. No personal account is created.");
  });

  it.each([
    ["unconfirmed", null],
    ["missing-account", null],
    ["active", { userId: "22222222-2222-4222-8222-222222222222" }],
    ["suspended", { userId: "22222222-2222-4222-8222-222222222222" }]
  ])("does not redirect a signed-in %s user away from the visible code field", async (status, account) => {
    state.context = {
      status,
      userId: "22222222-2222-4222-8222-222222222222",
      email: "owner@example.test",
      account
    };
    await renderAccessPage();
    expect(screen.getByRole("link", { name: "Account" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Subscription" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
    expectInlineAuthorizedCode();
  });

  it("shows active status and exit without asking an authorized-code session again", async () => {
    state.schoolSession = { id: "11111111-1111-4111-8111-111111111111" };
    await renderAccessPage();
    expect(screen.getByRole("heading", { name: "Authorized access active" })).toBeTruthy();
    expect(screen.queryByLabelText(/^Authorized code/)).toBeNull();
    expect(screen.getByRole("button", { name: "Exit authorized access" })).toBeTruthy();
  });

  it("keeps a signed-in account authoritative even when a school-session cookie also exists", async () => {
    state.context = {
      status: "active",
      userId: "22222222-2222-4222-8222-222222222222",
      email: "owner@example.test",
      account: { userId: "22222222-2222-4222-8222-222222222222" }
    };
    state.schoolSession = { id: "11111111-1111-4111-8111-111111111111" };
    await renderAccessPage();
    expectInlineAuthorizedCode();
    expect(screen.queryByRole("heading", { name: "Authorized access active" })).toBeNull();
  });
});
