// @vitest-environment node
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { decideMathNexaAccess } from "@math-vocabulary-hunt/platform-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  view: null as unknown,
  serviceAvailable: true,
  serviceClients: 0,
  accounts: new Map<string, Record<string, unknown>>(),
  entitlements: new Map<string, Record<string, unknown>>(),
  failTable: null as string | null,
  eqCalls: [] as Array<[string, string, unknown]>
}));
const mocks = vi.hoisted(() => ({ getGameAccessView: vi.fn() }));

// The service-role client the cookie-less re-check must use. get_own_* RPCs see auth.uid() = null under service_role.
const fakeClient = {
  rpc: vi.fn(async () => ({ data: [], error: null })),
  from: (table: string) => {
    const filters: Record<string, unknown> = {};
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => {
        filters[column] = value;
        state.eqCalls.push([table, column, value]);
        return query;
      },
      maybeSingle: async () => state.failTable === table
        ? { data: null, error: { message: "forced" } }
        : { data: (table === "consumer_accounts" ? state.accounts : state.entitlements).get(String(filters.user_id)) ?? null, error: null }
    };
    return query;
  }
};

vi.mock("@/lib/game-access/server", () => ({ getGameAccessView: mocks.getGameAccessView }));
vi.mock("@/lib/supabase/service", () => ({
  createServiceSupabaseClient: vi.fn(() => {
    if (!state.serviceAvailable) return null;
    state.serviceClients += 1;
    return fakeClient;
  })
}));
// Tripwires: the asset re-check never uses the cookie-scoped client and never reaches billing.
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn(() => { throw new Error("cookie client used"); }) }));
vi.mock("@/lib/billing/consumer-reconciliation", () => ({ reconcileConsumerBilling: vi.fn(() => { throw new Error("billing reached"); }) }));
vi.mock("@/lib/billing/consumer-provider-factory", () => ({ createConsumerBillingProvider: vi.fn(() => { throw new Error("billing reached"); }) }));

import { TICKET_ACCOUNT_COLUMNS, authorizeSubscriberGameAsset, createGameAssetTicket, ticketAccountRecord, verifyGameAssetTicket } from "./ticket";

const DELIVERY = "phase8e-unit-game-delivery-secret-value";
const SCHOOL_SECRET = "unit-school-access-session-secret-value-0001";
const pkg = "11111111-1111-4111-8111-111111111111";
const A = "22222222-2222-4222-8222-222222222222";
const B = "33333333-3333-4333-8333-333333333333";
const SID = "44444444-4444-4444-8444-444444444444";
const now = new Date("2026-08-03T00:00:00.000Z");
const at = (seconds: number) => new Date(now.getTime() + seconds * 1000);
const ENV_KEYS = ["MVH_GAME_DELIVERY_SECRET", "MATHNEXA_SCHOOL_ACCESS_CODE", "MATHNEXA_SCHOOL_ACCESS_SESSION_SECRET", "MVH_APP_ENVIRONMENT"] as const;
let savedEnv: Record<string, string | undefined> = {};

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const mac = (encoded: string, key: string) => createHmac("sha256", key).update(encoded).digest("base64url");
const schoolKey = (secret = SCHOOL_SECRET) => createHmac("sha256", DELIVERY).update(`mathnexa-game-ticket:school-access:v1:${secret}`).digest("base64url");
function sign(payload: Record<string, unknown>, key = DELIVERY) {
  const encoded = b64(payload);
  return `${encoded}.${mac(encoded, key)}`;
}
const v1 = (overrides: Record<string, unknown> = {}) => ({ v: 1, aud: "subscriber", packageId: pkg, principalId: A, issuedAt: Math.floor(now.getTime() / 1000), expiresAt: Math.floor(now.getTime() / 1000) + 300, ...overrides });
const decode = (ticket: string) => JSON.parse(Buffer.from(ticket.split(".")[0]!, "base64url").toString("utf8"));
/** Changes one character in the middle of the MAC (never the last one, whose low bits may be padding). */
function flipMiddle(ticket: string) {
  const [payload, signature] = ticket.split(".") as [string, string];
  return `${payload}.${signature.slice(0, 10)}${signature[10] === "A" ? "B" : "A"}${signature.slice(11)}`;
}
/** A last-character variant that Node's lenient base64url decoder maps to the same bytes. */
function sibling(ticket: string) {
  const [payload, signature] = ticket.split(".") as [string, string];
  const bytes = Buffer.from(signature, "base64url");
  for (const character of "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_") {
    const candidate = `${signature.slice(0, -1)}${character}`;
    if (candidate !== signature && Buffer.from(candidate, "base64url").equals(bytes)) return `${payload}.${candidate}`;
  }
  throw new Error("no non-canonical sibling");
}

const denied = decideMathNexaAccess({ authenticated: false, accountStatus: "active", emailConfirmed: false, evidence: {}, serverNow: now });
const allowed = decideMathNexaAccess({
  authenticated: true,
  accountStatus: "active",
  emailConfirmed: true,
  evidence: { capabilityKey: "MATHNEXA_ALL_ACCESS", entitlement: { state: "subscription-active", periodEndsAt: "2026-08-04T00:00:00.000Z" } },
  serverNow: now
});
const anonymousView = { context: { status: "anonymous" }, decision: denied, source: "default-deny", principal: null };
const sessionView = (kind: "consumer" | "school-access", id: string, decision = allowed) => ({ context: { status: "active" }, decision, source: "server-authoritative", principal: { kind, id } });
const account = (id: string, overrides: Record<string, unknown> = {}) => ({
  user_id: id,
  account_status: "active",
  email_confirmed_at: "2026-08-01T00:00:00.000Z",
  trial_redeemed_at: null,
  deletion_requested_at: null,
  deletion_completed_at: null,
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z",
  ...overrides
});
const entitlement = (overrides: Record<string, unknown> = {}) => ({
  capability_key: "MATHNEXA_ALL_ACCESS",
  entitlement_state: "subscription-active",
  trial_started_at: null,
  trial_ends_at: null,
  current_period_ends_at: "2026-08-04T00:00:00.000Z",
  grace_ends_at: null,
  ...overrides
});
const consumerTicket = (principalId = A, when = now) => createGameAssetTicket({ audience: "subscriber", principalKind: "consumer", packageId: pkg, principalId, now: when })!;
const schoolTicket = (principalId = SID, sessionEndsAt: string | null | undefined = at(3600).toISOString(), when = now) =>
  createGameAssetTicket({ audience: "subscriber", principalKind: "school-access", sessionEndsAt, packageId: pkg, principalId, now: when });
const adminTicket = () => createGameAssetTicket({ audience: "admin-preview", packageId: pkg, principalId: B, now })!;

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  process.env.MVH_GAME_DELIVERY_SECRET = DELIVERY;
  process.env.MATHNEXA_SCHOOL_ACCESS_CODE = "UNIT-SCHOOL";
  process.env.MATHNEXA_SCHOOL_ACCESS_SESSION_SECRET = SCHOOL_SECRET;
  process.env.MVH_APP_ENVIRONMENT = "production-platform";
  state.view = anonymousView;
  state.serviceAvailable = true;
  state.serviceClients = 0;
  state.accounts = new Map([[A, account(A)], [B, account(B)]]);
  state.entitlements = new Map([[A, entitlement()], [B, entitlement()]]);
  state.failTable = null;
  state.eqCalls = [];
  mocks.getGameAccessView.mockReset();
  mocks.getGameAccessView.mockImplementation(async () => state.view);
});
afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe("game asset tickets", () => {
  it("mints only with the delivery secret, well-formed ids and, for school access, a configured session", () => {
    expect(consumerTicket()).toBeTruthy();
    expect(createGameAssetTicket({ audience: "subscriber", principalKind: "consumer", packageId: "not-a-uuid", principalId: A, now })).toBeNull();
    expect(createGameAssetTicket({ audience: "subscriber", principalKind: "consumer", packageId: pkg, principalId: "not-a-uuid", now })).toBeNull();
    delete process.env.MATHNEXA_SCHOOL_ACCESS_SESSION_SECRET;
    expect(schoolTicket()).toBeNull();
    expect(consumerTicket()).toBeTruthy();
    delete process.env.MVH_GAME_DELIVERY_SECRET;
    expect(createGameAssetTicket({ audience: "subscriber", principalKind: "consumer", packageId: pkg, principalId: A, now })).toBeNull();
    expect(createGameAssetTicket({ audience: "admin-preview", packageId: pkg, principalId: A, now })).toBeNull();
  });

  it("golden vector: consumer and admin-preview tickets are byte-identical to the v1 wire format", () => {
    for (const aud of ["subscriber", "admin-preview"] as const) {
      const expected = sign({ v: 1, aud, packageId: pkg, principalId: A, issuedAt: 1785715200, expiresAt: 1785715500 });
      const minted = aud === "subscriber"
        ? createGameAssetTicket({ audience: aud, principalKind: "consumer", packageId: pkg, principalId: A, now })
        : createGameAssetTicket({ audience: aud, packageId: pkg, principalId: A, now });
      expect(minted).toBe(expected);
    }
  });

  it("keeps the six-field payload and a lifetime of exactly 300 s", () => {
    for (const ticket of [consumerTicket(), schoolTicket()!, adminTicket()]) {
      const payload = decode(ticket);
      expect(Object.keys(payload).sort()).toEqual(["aud", "expiresAt", "issuedAt", "packageId", "principalId", "v"]);
      expect(payload.expiresAt - payload.issuedAt).toBe(300);
      expect(ticket).not.toContain(DELIVERY);
      expect(ticket).not.toContain(SCHOOL_SECRET);
      expect(ticket).not.toContain(schoolKey());
    }
    const consumer = consumerTicket(SID);
    const school = schoolTicket(SID)!;
    expect(consumer.split(".")[0]).toBe(school.split(".")[0]);
    expect(consumer.split(".")[1]).not.toBe(school.split(".")[1]);
  });

  it("accepts until exactly 300 s, refuses at expiry and when future-dated", () => {
    const ticket = consumerTicket();
    expect(verifyGameAssetTicket(ticket, "subscriber", pkg, at(299))).toMatchObject({ principalId: A, principalKind: "consumer" });
    expect(verifyGameAssetTicket(ticket, "subscriber", pkg, at(300))).toBeNull();
    expect(verifyGameAssetTicket(ticket, "subscriber", pkg, at(301))).toBeNull();
    const issuedAt = Math.floor(now.getTime() / 1000) + 6;
    expect(verifyGameAssetTicket(sign(v1({ issuedAt, expiresAt: issuedAt + 300 })), "subscriber", pkg, now)).toBeNull();
  });

  it("refuses correctly signed tickets whose lifetime is not 300", () => {
    const issuedAt = Math.floor(now.getTime() / 1000);
    for (const lifetime of [299, 301, 3000]) {
      expect(verifyGameAssetTicket(sign(v1({ issuedAt, expiresAt: issuedAt + lifetime })), "subscriber", pkg, now)).toBeNull();
    }
  });

  it("binds audience, package and principal kind", () => {
    expect(verifyGameAssetTicket(consumerTicket(), "admin-preview", pkg, now)).toBeNull();
    expect(verifyGameAssetTicket(adminTicket(), "subscriber", pkg, now)).toBeNull();
    expect(verifyGameAssetTicket(consumerTicket(), "subscriber", "99999999-9999-4999-8999-999999999999", now)).toBeNull();
    expect(verifyGameAssetTicket(consumerTicket(), "subscriber", pkg, now)?.principalKind).toBe("consumer");
    expect(verifyGameAssetTicket(schoolTicket()!, "subscriber", pkg, now)?.principalKind).toBe("school-access");
    expect(verifyGameAssetTicket(adminTicket(), "admin-preview", pkg, now)?.principalKind).toBe("admin");
    const schoolSignedAdmin = sign(v1({ aud: "admin-preview" }), schoolKey());
    expect(verifyGameAssetTicket(schoolSignedAdmin, "admin-preview", pkg, now)).toBeNull();
    expect(verifyGameAssetTicket(schoolSignedAdmin, "subscriber", pkg, now)).toBeNull();
    delete process.env.MATHNEXA_SCHOOL_ACCESS_CODE;
    expect(verifyGameAssetTicket(adminTicket(), "admin-preview", pkg, now)?.principalKind).toBe("admin");
  });

  it("refuses forged signatures", () => {
    const ticket = consumerTicket();
    const [, realMac] = ticket.split(".") as [string, string];
    const forgeries = [
      flipMiddle(ticket),
      sibling(ticket),
      `${b64(v1({ principalId: B }))}.${realMac}`,
      sign(v1(), "x".repeat(40)),
      `${ticket.split(".")[0]}.${realMac.slice(0, 42)}`,
      `${ticket}.extra`,
      `${Buffer.from("not json").toString("base64url")}.${mac(Buffer.from("not json").toString("base64url"), DELIVERY)}`
    ];
    for (const forged of forgeries) expect(verifyGameAssetTicket(forged, "subscriber", pkg, now)).toBeNull();
  });

  it("caps the ticket at 700 characters even when it is otherwise valid", () => {
    // JSON tolerates whitespace, so padding keeps the same six fields and a valid MAC while growing the ticket.
    const padded = (spaces: number) => {
      const encoded = Buffer.from(JSON.stringify(v1()).replace("{", `{${" ".repeat(spaces)}`)).toString("base64url");
      return `${encoded}.${mac(encoded, DELIVERY)}`;
    };
    const fits = padded(300);
    expect(fits.length).toBeLessThanOrEqual(700);
    expect(verifyGameAssetTicket(fits, "subscriber", pkg, now)).toMatchObject({ principalId: A, principalKind: "consumer" });
    const tooLong = padded(340);
    expect(tooLong.length).toBeGreaterThan(700);
    expect(verifyGameAssetTicket(tooLong, "subscriber", pkg, now)).toBeNull();
  });

  it("verification fails closed without a valid delivery secret", async () => {
    const ticket = consumerTicket();
    const school = schoolTicket()!;
    for (const value of [undefined, "", "too-short-secret", " ".repeat(40)]) {
      if (value === undefined) delete process.env.MVH_GAME_DELIVERY_SECRET;
      else process.env.MVH_GAME_DELIVERY_SECRET = value;
      expect(verifyGameAssetTicket(ticket, "subscriber", pkg, now), String(value)).toBeNull();
      expect(verifyGameAssetTicket(school, "subscriber", pkg, now), String(value)).toBeNull();
      await expect(authorizeSubscriberGameAsset(ticket, pkg, now), String(value)).resolves.toBe(false);
    }
    expect(state.serviceClients).toBe(0);
  });

  it("school tickets: never outlive the session", () => {
    expect(schoolTicket(SID, at(300).toISOString())).toBeTruthy();
    for (const sessionEndsAt of [at(299).toISOString(), at(60).toISOString(), null, "not-a-date"]) {
      expect(schoolTicket(SID, sessionEndsAt)).toBeNull();
    }
    expect(createGameAssetTicket({ audience: "subscriber", principalKind: "school-access", packageId: pkg, principalId: SID, now })).toBeNull();
  });

  it("school tickets are revoked by removing school access or rotating its session secret", () => {
    const ticket = schoolTicket()!;
    expect(verifyGameAssetTicket(ticket, "subscriber", pkg, now)?.principalKind).toBe("school-access");
    process.env.MATHNEXA_SCHOOL_ACCESS_SESSION_SECRET = "rotated-school-access-session-secret-value-0002";
    expect(verifyGameAssetTicket(ticket, "subscriber", pkg, now)).toBeNull();
    delete process.env.MATHNEXA_SCHOOL_ACCESS_SESSION_SECRET;
    expect(verifyGameAssetTicket(ticket, "subscriber", pkg, now)).toBeNull();
    process.env.MATHNEXA_SCHOOL_ACCESS_SESSION_SECRET = SCHOOL_SECRET;
    delete process.env.MATHNEXA_SCHOOL_ACCESS_CODE;
    expect(verifyGameAssetTicket(ticket, "subscriber", pkg, now)).toBeNull();
  });
});

describe("the ticket principal's account row", () => {
  it("is selected and mapped exactly as resolveConsumerContext() does", () => {
    const consumerContext = readFileSync(resolve(__dirname, "../auth/consumer-context.ts"), "utf8");
    expect(consumerContext).toContain(`.select("${TICKET_ACCOUNT_COLUMNS}")`);
    expect(consumerContext).toContain('data.account_status !== "active" && data.account_status !== "suspended" && data.account_status !== "deletion_pending"');
    expect(consumerContext).toContain('accountStatus: data.account_status === "deletion_pending" ? "deletion-pending" : data.account_status,');
    expect(consumerContext).toContain("emailConfirmedAt: text(data.email_confirmed_at),");
  });

  it("maps statuses, validates dates and refuses unknown rows", () => {
    expect(ticketAccountRecord(account(A))).toMatchObject({ userId: A, accountStatus: "active", emailConfirmedAt: "2026-08-01T00:00:00.000Z" });
    expect(Object.isFrozen(ticketAccountRecord(account(A)))).toBe(true);
    expect(ticketAccountRecord(account(A, { account_status: "deletion_pending" }))?.accountStatus).toBe("deletion-pending");
    expect(ticketAccountRecord(account(A, { email_confirmed_at: "not-a-date" }))?.emailConfirmedAt).toBeNull();
    for (const row of [null, undefined, account(A, { account_status: "closed" }), account(A, { user_id: 42 })]) expect(ticketAccountRecord(row)).toBeNull();
  });
});

describe("authorizeSubscriberGameAsset", () => {
  it("serves a cookie-less entitled consumer after a service-role re-check", async () => {
    await expect(authorizeSubscriberGameAsset(consumerTicket(), pkg, now)).resolves.toBe(true);
    expect(state.serviceClients).toBe(1);
    expect(state.eqCalls).toContainEqual(["consumer_accounts", "user_id", A]);
    expect(state.eqCalls).toContainEqual(["consumer_game_entitlements", "user_id", A]);
  });

  it("refuses cookie-less consumers who are not entitled", async () => {
    const cases: Array<[string, () => void]> = [
      ["no account row", () => state.accounts.delete(A)],
      ["suspended", () => state.accounts.set(A, account(A, { account_status: "suspended" }))],
      ["deletion pending", () => state.accounts.set(A, account(A, { account_status: "deletion_pending", deletion_requested_at: "2026-08-02T00:00:00.000Z" }))],
      ["unknown status", () => state.accounts.set(A, account(A, { account_status: "closed" }))],
      ["email not confirmed", () => state.accounts.set(A, account(A, { email_confirmed_at: null }))],
      ["no entitlement row", () => state.entitlements.delete(A)],
      ["subscription expired", () => state.entitlements.set(A, entitlement({ entitlement_state: "subscription-expired" }))],
      ["clock-expired subscription", () => state.entitlements.set(A, entitlement({ current_period_ends_at: at(-1).toISOString() }))],
      ["trial expired", () => {
        state.accounts.set(A, account(A, { trial_redeemed_at: at(-90_000).toISOString() }));
        state.entitlements.set(A, entitlement({ entitlement_state: "trial-expired", trial_started_at: at(-90_000).toISOString(), trial_ends_at: at(-3600).toISOString(), current_period_ends_at: null }));
      }],
      ["another capability", () => state.entitlements.set(A, entitlement({ capability_key: "GAMES_ONLY" }))],
      ["past due", () => state.entitlements.set(A, entitlement({ entitlement_state: "subscription-past-due" }))],
      ["account read error", () => { state.failTable = "consumer_accounts"; }],
      ["entitlement read error", () => { state.failTable = "consumer_game_entitlements"; }]
    ];
    for (const [name, arrange] of cases) {
      state.accounts = new Map([[A, account(A)]]);
      state.entitlements = new Map([[A, entitlement()]]);
      state.failTable = null;
      arrange();
      await expect(authorizeSubscriberGameAsset(consumerTicket(), pkg, now), name).resolves.toBe(false);
    }
    const positives: Array<[string, () => void]> = [
      ["trial active", () => {
        state.accounts.set(A, account(A, { trial_redeemed_at: at(-3600).toISOString() }));
        state.entitlements.set(A, entitlement({ entitlement_state: "trial-active", trial_started_at: at(-3600).toISOString(), trial_ends_at: at(86400 - 3600).toISOString(), current_period_ends_at: null }));
      }],
      ["grace period", () => state.entitlements.set(A, entitlement({ entitlement_state: "subscription-grace-period", current_period_ends_at: at(-60).toISOString(), grace_ends_at: at(86400).toISOString() }))]
    ];
    for (const [name, arrange] of positives) {
      state.accounts = new Map([[A, account(A)]]);
      state.entitlements = new Map([[A, entitlement()]]);
      state.failTable = null;
      arrange();
      await expect(authorizeSubscriberGameAsset(consumerTicket(), pkg, now), name).resolves.toBe(true);
    }
  });

  it("access revoked after the ticket was minted fails closed", async () => {
    const revocations: Array<[string, () => void]> = [
      ["entitlement expired", () => state.entitlements.set(A, entitlement({ entitlement_state: "subscription-expired" }))],
      ["account suspended", () => state.accounts.set(A, account(A, { account_status: "suspended" }))],
      ["account removed", () => state.accounts.delete(A)]
    ];
    for (const [name, revoke] of revocations) {
      state.accounts = new Map([[A, account(A)]]);
      state.entitlements = new Map([[A, entitlement()]]);
      const ticket = consumerTicket();
      await expect(authorizeSubscriberGameAsset(ticket, pkg, at(30)), name).resolves.toBe(true);
      revoke();
      expect(verifyGameAssetTicket(ticket, "subscriber", pkg, at(60)), name).not.toBeNull();
      await expect(authorizeSubscriberGameAsset(ticket, pkg, at(60)), name).resolves.toBe(false);
    }
  });

  it("fails closed without a service client or outside production-platform", async () => {
    state.serviceAvailable = false;
    await expect(authorizeSubscriberGameAsset(consumerTicket(), pkg, now)).resolves.toBe(false);
    state.serviceAvailable = true;
    process.env.MVH_APP_ENVIRONMENT = "local";
    await expect(authorizeSubscriberGameAsset(consumerTicket(), pkg, now)).resolves.toBe(false);
    expect(state.serviceClients).toBe(0);
  });

  it("forged, expired or package-mismatched tickets never reach the session or the database", async () => {
    for (const [ticket, packageId, when] of [
      [flipMiddle(consumerTicket()), pkg, now],
      [consumerTicket(), pkg, at(300)],
      [consumerTicket(), "99999999-9999-4999-8999-999999999999", now],
      ["x.y", pkg, now]
    ] as Array<[string, string, Date]>) {
      await expect(authorizeSubscriberGameAsset(ticket, packageId, when)).resolves.toBe(false);
    }
    expect(mocks.getGameAccessView).not.toHaveBeenCalled();
    expect(state.serviceClients).toBe(0);
  });

  it("with a session present, the session principal must be the ticket principal and is never retried cookie-less", async () => {
    state.view = sessionView("consumer", B);
    await expect(authorizeSubscriberGameAsset(consumerTicket(A), pkg, now)).resolves.toBe(false);
    state.view = sessionView("school-access", A);
    await expect(authorizeSubscriberGameAsset(consumerTicket(A), pkg, now)).resolves.toBe(false);
    state.view = sessionView("consumer", A, denied);
    await expect(authorizeSubscriberGameAsset(consumerTicket(A), pkg, now)).resolves.toBe(false);
    expect(state.serviceClients).toBe(0);
    state.view = sessionView("consumer", A);
    await expect(authorizeSubscriberGameAsset(consumerTicket(A), pkg, now)).resolves.toBe(true);
    expect(state.serviceClients).toBe(0);
  });

  it("re-checks a cookie-less school-access principal against the current school configuration", async () => {
    const ticket = schoolTicket()!;
    await expect(authorizeSubscriberGameAsset(ticket, pkg, now)).resolves.toBe(true);
    expect(state.serviceClients).toBe(0);
    state.view = sessionView("school-access", SID);
    await expect(authorizeSubscriberGameAsset(ticket, pkg, now)).resolves.toBe(true);
    state.view = sessionView("school-access", "55555555-5555-4555-8555-555555555555");
    await expect(authorizeSubscriberGameAsset(ticket, pkg, now)).resolves.toBe(false);
    state.view = sessionView("consumer", SID);
    await expect(authorizeSubscriberGameAsset(ticket, pkg, now)).resolves.toBe(false);
    state.view = anonymousView;
    process.env.MATHNEXA_SCHOOL_ACCESS_SESSION_SECRET = "rotated-school-access-session-secret-value-0002";
    await expect(authorizeSubscriberGameAsset(ticket, pkg, now)).resolves.toBe(false);
    delete process.env.MATHNEXA_SCHOOL_ACCESS_SESSION_SECRET;
    await expect(authorizeSubscriberGameAsset(ticket, pkg, now)).resolves.toBe(false);
    process.env.MATHNEXA_SCHOOL_ACCESS_SESSION_SECRET = SCHOOL_SECRET;
    delete process.env.MATHNEXA_SCHOOL_ACCESS_CODE;
    await expect(authorizeSubscriberGameAsset(ticket, pkg, now)).resolves.toBe(false);
  });

  it("a consumer-signed ticket naming a school session id is not school access", async () => {
    await expect(authorizeSubscriberGameAsset(consumerTicket(SID), pkg, now)).resolves.toBe(false);
    expect(state.eqCalls).toContainEqual(["consumer_accounts", "user_id", SID]);
  });

  it("admin-preview tickets are unaffected and never authorize subscriber assets", async () => {
    expect(verifyGameAssetTicket(adminTicket(), "admin-preview", pkg, now)).toMatchObject({ aud: "admin-preview", principalKind: "admin" });
    await expect(authorizeSubscriberGameAsset(adminTicket(), pkg, now)).resolves.toBe(false);
  });
});
