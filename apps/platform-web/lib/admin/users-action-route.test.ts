// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  inspectAdminAccess: vi.fn(),
  validateAdminMutationCsrf: vi.fn(),
  ensureAdminStepUp: vi.fn(),
  rpc: vi.fn(),
  syncConsumerBillingForTarget: vi.fn(),
  createAdminPortalForTarget: vi.fn()
}));

vi.mock("@/lib/admin/session", () => ({ inspectAdminAccess: mocks.inspectAdminAccess, validateAdminMutationCsrf: mocks.validateAdminMutationCsrf }));
vi.mock("@/lib/admin/step-up", async () => ({
  ensureAdminStepUp: mocks.ensureAdminStepUp,
  STEP_UP_ACCOUNT_OPERATIONS: (await import("./session-policy")).STEP_UP_ACCOUNT_OPERATIONS
}));
vi.mock("@/lib/supabase/service", () => ({ createServiceSupabaseClient: () => ({ rpc: mocks.rpc, auth: { admin: {} } }) }));
vi.mock("@/lib/admin/account-operations", () => ({
  syncConsumerBillingForTarget: mocks.syncConsumerBillingForTarget,
  createAdminPortalForTarget: mocks.createAdminPortalForTarget
}));
vi.mock("@/lib/operations/server", () => ({ recordAggregateSignal: vi.fn() }));

import { POST } from "@/app/admin/users/action/route";

const admin = { id: "30000000-0000-4000-8000-000000000001", user_id: "30000000-0000-4000-8000-000000000002", role: "owner", mfa_enrolled: true, created_at: "2026-09-30T09:00:00.000Z", revoked_at: null };
const session = {
  id: "30000000-0000-4000-8000-000000000003", admin_user_id: admin.id, token_hash: "c".repeat(64), assurance_level: "aal2",
  started_at: "2026-09-30T10:00:00.000Z", expires_at: "2026-09-30T12:00:00.000Z", last_activity_at: "2026-09-30T10:20:00.000Z",
  step_up_at: "2026-09-30T10:00:00.000Z", ended_at: null, revoked_at: null, end_reason: null
};
const target = "30000000-0000-4000-8000-000000000004";

function request(operation: string, extra: Record<string, string> = {}) {
  const body = new FormData();
  for (const [key, value] of Object.entries({ csrfToken: "token", operation, targetUserId: target, idempotencyKey: `phase8g:${target}:${operation}:key-0001`, ...extra })) body.set(key, value);
  return new Request("https://mathnexa.example/admin/users/action", { method: "POST", body, headers: { referer: "https://mathnexa.example/admin?section=users" } });
}

function begin(created: boolean, operationState = "prepared") {
  return { data: [{ operation_id: "30000000-0000-4000-8000-000000000005", created, operation_state: operationState }], error: null };
}

function account(response: Response) {
  return new URL(response.headers.get("location") ?? "").searchParams.get("account");
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MVH_APPLICATION_ORIGIN = "https://mathnexa.example";
  mocks.inspectAdminAccess.mockResolvedValue({ state: "authorized", admin, session });
  mocks.validateAdminMutationCsrf.mockResolvedValue(true);
  mocks.ensureAdminStepUp.mockResolvedValue("fresh");
  mocks.syncConsumerBillingForTarget.mockResolvedValue({ outcome: "synchronized", changed: false });
  mocks.rpc.mockImplementation(async (name: string) => name === "finish_admin_account_operation" ? { data: null, error: null } : begin(true));
});

describe("Phase 2B users action route", () => {
  it("runs Sync with Stripe once for the request that created the operation", async () => {
    const response = await POST(request("sync-billing"));
    expect(account(response)).toBe("sync-billing-succeeded");
    expect(mocks.rpc).toHaveBeenCalledWith("begin_admin_account_operation", expect.objectContaining({ p_operation: "sync-billing", p_admin_session_id: session.id }));
    expect(mocks.syncConsumerBillingForTarget).toHaveBeenCalledTimes(1);
    expect(mocks.ensureAdminStepUp, "Sync with Stripe is not a step-up operation").not.toHaveBeenCalled();
  });

  it("never re-runs a completed Sync with Stripe when the same form is posted again", async () => {
    mocks.rpc.mockImplementation(async () => begin(false, "succeeded"));
    const response = await POST(request("sync-billing"));
    expect(account(response)).toBe("already-completed");
    expect(mocks.syncConsumerBillingForTarget).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalledWith("finish_admin_account_operation", expect.anything());
  });

  it("suppresses a duplicate that arrives while the first request is still running", async () => {
    mocks.rpc.mockImplementation(async () => begin(false, "prepared"));
    const response = await POST(request("sync-billing"));
    expect(account(response)).toBe("already-in-progress");
    expect(mocks.syncConsumerBillingForTarget).not.toHaveBeenCalled();
  });

  it("does not open a second Stripe portal session for a duplicate", async () => {
    mocks.rpc.mockImplementation(async () => begin(false, "succeeded"));
    const response = await POST(request("open-portal"));
    expect(account(response)).toBe("already-completed");
    expect(mocks.createAdminPortalForTarget).not.toHaveBeenCalled();
  });

  it("asks for a fresh authenticator code before a sensitive operation and changes nothing", async () => {
    mocks.ensureAdminStepUp.mockResolvedValue("required");
    const response = await POST(request("suspend", { reason: "Verified owner review" }));
    expect(account(response)).toBe("step-up-required");
    expect(mocks.ensureAdminStepUp).toHaveBeenCalledWith(expect.objectContaining({ code: "" }));
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("passes the submitted code to step-up verification and stops on a wrong code", async () => {
    mocks.ensureAdminStepUp.mockResolvedValue("failed");
    const response = await POST(request("suspend", { reason: "Verified owner review", stepUpCode: "123456" }));
    expect(account(response)).toBe("step-up-failed");
    expect(mocks.ensureAdminStepUp).toHaveBeenCalledWith(expect.objectContaining({ code: "123456", admin, session }));
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("maps a database step-up refusal to a step-up prompt", async () => {
    mocks.rpc.mockImplementation(async () => ({ data: null, error: { message: "Fresh owner reauthentication required" } }));
    const response = await POST(request("open-portal"));
    expect(account(response)).toBe("step-up-required");
  });

  it("rejects a token that is not bound to this session before doing anything", async () => {
    mocks.validateAdminMutationCsrf.mockResolvedValue(false);
    const response = await POST(request("sync-billing"));
    expect(account(response)).toBe("csrf-denied");
    expect(mocks.validateAdminMutationCsrf).toHaveBeenCalledWith(expect.any(FormData), session);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("sends an administrator whose session ran out to sign in again, and conceals the route from anyone else", async () => {
    mocks.inspectAdminAccess.mockResolvedValue({ state: "reauth-required", reason: "idle", recoverable: true });
    const expired = await POST(request("sync-billing"));
    expect(expired.status).toBe(303);
    expect(expired.headers.get("location")).toBe("https://mathnexa.example/admin/sign-in?expired=1&next=%2Fadmin%3Fsection%3Dusers");
    mocks.inspectAdminAccess.mockResolvedValue({ state: "non-admin" });
    const concealed = await POST(request("sync-billing"));
    expect(concealed.status).toBe(404);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
