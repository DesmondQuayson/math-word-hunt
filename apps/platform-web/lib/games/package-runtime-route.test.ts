// @vitest-environment node
// Route-level proof for hosted package games: the public asset route, the cookie-gated launch route and the
// ticket-only Admin preview asset route, with the real ticket module and a fake service-role client.
import { createHmac } from "node:crypto";

import { decideMathNexaAccess } from "@math-vocabulary-hunt/platform-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  view: null as unknown,
  game: null as unknown,
  delivery: null as unknown,
  accounts: new Map<string, Record<string, unknown>>(),
  entitlements: new Map<string, Record<string, unknown>>(),
  launchRecorded: [] as unknown[]
}));
const mocks = vi.hoisted(() => ({
  getGameAccessView: vi.fn(),
  loadPublicGame: vi.fn(),
  loadGamePackageDelivery: vi.fn(),
  deliverPrivateGameAsset: vi.fn()
}));

const fakeClient = {
  rpc: vi.fn(async (name: string, args: unknown) => {
    if (name === "record_game_package_launch") {
      state.launchRecorded.push(args);
      return { data: true, error: null };
    }
    return { data: [], error: null };
  }),
  from: (table: string) => {
    const filters: Record<string, unknown> = {};
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => { filters[column] = value; return query; },
      maybeSingle: async () => ({ data: (table === "consumer_accounts" ? state.accounts : state.entitlements).get(String(filters.user_id)) ?? null, error: null })
    };
    return query;
  }
};

vi.mock("@/lib/game-access/server", () => ({ getGameAccessView: mocks.getGameAccessView }));
vi.mock("@/lib/games/catalog", () => ({ loadPublicGame: mocks.loadPublicGame }));
vi.mock("@/lib/games/delivery", () => ({ deliverPrivateGameAsset: mocks.deliverPrivateGameAsset, loadGamePackageDelivery: mocks.loadGamePackageDelivery }));
vi.mock("@/lib/supabase/service", () => ({ createServiceSupabaseClient: vi.fn(() => fakeClient) }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn(() => { throw new Error("cookie client used"); }) }));

import { GET as adminPreviewAsset } from "@/app/admin/games/[packageId]/preview/assets/[ticket]/[...asset]/route";
import { GET as packageLaunch } from "@/app/games/[resourceId]/runtime/route";
import { GET as packageAsset } from "@/app/games/[resourceId]/runtime/assets/[ticket]/[...asset]/route";
import { createGameAssetTicket } from "./ticket";

const DELIVERY = "phase8e-route-test-delivery-secret-value";
const SCHOOL_SECRET = "route-test-school-access-session-secret-value";
const pkg = "11111111-1111-4111-8111-111111111111";
const resource = "66666666-6666-4666-8666-666666666666";
const A = "22222222-2222-4222-8222-222222222222";
const B = "33333333-3333-4333-8333-333333333333";
const SID = "44444444-4444-4444-8444-444444444444";
const C = "77777777-7777-4777-8777-777777777777";
const ENV_KEYS = ["MVH_GAME_DELIVERY_SECRET", "MATHNEXA_SCHOOL_ACCESS_CODE", "MATHNEXA_SCHOOL_ACCESS_SESSION_SECRET", "MVH_APP_ENVIRONMENT", "MVH_APPLICATION_ORIGIN"] as const;
let savedEnv: Record<string, string | undefined> = {};

const nowS = () => Math.floor(Date.now() / 1000);
const denied = decideMathNexaAccess({ authenticated: false, accountStatus: "active", emailConfirmed: false, evidence: {}, serverNow: new Date() });
const allowed = () => decideMathNexaAccess({
  authenticated: true,
  accountStatus: "active",
  emailConfirmed: true,
  evidence: { capabilityKey: "MATHNEXA_ALL_ACCESS", entitlement: { state: "subscription-active", periodEndsAt: new Date(Date.now() + 86_400_000).toISOString() } },
  serverNow: new Date()
});
const anonymousView = () => ({ context: { status: "anonymous" }, decision: denied, source: "default-deny", principal: null });
const sessionView = (kind: "consumer" | "school-access", id: string, decision = allowed()) => ({ context: { status: "active" }, decision, source: "server-authoritative", principal: { kind, id } });
const hostedGame = { slug: "fraction-field", launch: { type: "hosted_package", packageId: pkg } };
const consumer = (principalId = A) => createGameAssetTicket({ audience: "subscriber", principalKind: "consumer", packageId: pkg, principalId })!;
const school = (principalId = SID) => createGameAssetTicket({ audience: "subscriber", principalKind: "school-access", sessionEndsAt: new Date(Date.now() + 3_600_000).toISOString(), packageId: pkg, principalId })!;
const admin = (packageId = pkg) => createGameAssetTicket({ audience: "admin-preview", packageId, principalId: B })!;
function signed(payload: Record<string, unknown>, key = DELIVERY) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${createHmac("sha256", key).update(encoded).digest("base64url")}`;
}
function flipMiddle(ticket: string) {
  const [payload, signature] = ticket.split(".") as [string, string];
  return `${payload}.${signature.slice(0, 10)}${signature[10] === "A" ? "B" : "A"}${signature.slice(11)}`;
}
const expired = () => signed({ v: 1, aud: "subscriber", packageId: pkg, principalId: A, issuedAt: nowS() - 400, expiresAt: nowS() - 100 });

async function asset(ticket: string, file = "game/main.js") {
  return packageAsset(new Request(`http://127.0.0.1:3000/games/fraction-field/runtime/assets/${ticket}/${file}`), { params: Promise.resolve({ resourceId: "fraction-field", ticket, asset: file.split("/") }) });
}
async function launch(ticket: string) {
  return packageLaunch(new Request(`http://127.0.0.1:3000/games/fraction-field/runtime?ticket=${encodeURIComponent(ticket)}`), { params: Promise.resolve({ resourceId: "fraction-field" }) });
}
async function preview(ticket: string, packageId = pkg, file = "game/main.js") {
  return adminPreviewAsset(new Request(`http://127.0.0.1:3000/admin/games/${packageId}/preview/assets/${ticket}/${file}`), { params: Promise.resolve({ packageId, ticket, asset: file.split("/") }) });
}
function expectNotFound(response: Response, label: string) {
  expect(response.status, label).toBe(404);
}

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  process.env.MVH_GAME_DELIVERY_SECRET = DELIVERY;
  process.env.MATHNEXA_SCHOOL_ACCESS_CODE = "ROUTE-SCHOOL";
  process.env.MATHNEXA_SCHOOL_ACCESS_SESSION_SECRET = SCHOOL_SECRET;
  process.env.MVH_APP_ENVIRONMENT = "production-platform";
  process.env.MVH_APPLICATION_ORIGIN = "http://127.0.0.1:3000";
  state.view = anonymousView();
  state.game = hostedGame;
  state.delivery = { id: pkg, resourceId: resource, entryFile: "game/index.html", publicationState: "published" };
  const row = (id: string) => ({ user_id: id, account_status: "active", email_confirmed_at: "2026-08-01T00:00:00.000Z", trial_redeemed_at: null, deletion_requested_at: null, deletion_completed_at: null, created_at: "2026-08-01T00:00:00.000Z", updated_at: "2026-08-01T00:00:00.000Z" });
  state.accounts = new Map([[A, row(A)], [C, row(C)]]);
  state.entitlements = new Map([[A, { capability_key: "MATHNEXA_ALL_ACCESS", entitlement_state: "subscription-active", trial_started_at: null, trial_ends_at: null, current_period_ends_at: new Date(Date.now() + 86_400_000).toISOString(), grace_ends_at: null }]]);
  state.launchRecorded = [];
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.getGameAccessView.mockImplementation(async () => state.view);
  mocks.loadPublicGame.mockImplementation(async () => state.game);
  mocks.loadGamePackageDelivery.mockImplementation(async () => state.delivery);
  mocks.deliverPrivateGameAsset.mockImplementation(async () => new Response("asset", { status: 200 }));
});
afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe("hosted package routes", () => {
  it("asset route never delivers a refused asset", async () => {
    const ok = await asset(consumer());
    expect(ok.status).toBe(200);
    expect(mocks.deliverPrivateGameAsset).toHaveBeenCalledWith(expect.any(Request), pkg, "game/main.js");
    mocks.deliverPrivateGameAsset.mockClear();

    const refusals: Array<[string, () => Promise<Response>]> = [
      ["expired", () => asset(expired())],
      ["forged", () => asset(flipMiddle(consumer()))],
      ["wrong package", () => asset(signed({ v: 1, aud: "subscriber", packageId: "99999999-9999-4999-8999-999999999999", principalId: A, issuedAt: nowS(), expiresAt: nowS() + 300 }))],
      ["unknown account", () => asset(consumer(B))],
      ["account without an entitlement", () => asset(consumer(C))],
      ["admin-preview ticket", () => asset(admin())],
      ["session mismatch", async () => { state.view = sessionView("consumer", B); return asset(consumer(A)); }],
      ["not a hosted package", async () => { state.game = { slug: "fraction-field", launch: { type: "canonical", route: "/play" } }; return asset(consumer()); }]
    ];
    for (const [label, request] of refusals) {
      state.view = anonymousView();
      state.game = hostedGame;
      const response = await request();
      expectNotFound(response, label);
      expect(response.headers.get("cache-control"), label).toBe("no-store");
    }
    expect(mocks.deliverPrivateGameAsset).not.toHaveBeenCalled();
  });

  it("runtime launch needs the cookie session and its exact principal", async () => {
    expectNotFound(await launch(consumer()), "no session");
    state.view = sessionView("consumer", A, denied);
    expectNotFound(await launch(consumer()), "denied decision");
    state.view = sessionView("consumer", A);
    expectNotFound(await launch(consumer(B)), "another principal's ticket");
    state.view = sessionView("school-access", A);
    expectNotFound(await launch(consumer(A)), "school session, consumer ticket");
    state.view = sessionView("consumer", SID);
    expectNotFound(await launch(school(SID)), "consumer session, school ticket");
    expect(state.launchRecorded).toHaveLength(0);

    state.view = sessionView("consumer", A);
    const ticket = consumer(A);
    const response = await launch(ticket);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`http://127.0.0.1:3000/games/fraction-field/runtime/assets/${ticket}/game/index.html`);
    expect(state.launchRecorded).toEqual([{ p_consumer_user_id: A, p_package_id: pkg }]);

    state.launchRecorded = [];
    state.view = sessionView("school-access", SID);
    expect((await launch(school(SID))).status).toBe(307);
    expect(state.launchRecorded).toHaveLength(0);
  });

  it("admin preview assets never consult the cookie session", async () => {
    mocks.getGameAccessView.mockImplementation(() => { throw new Error("admin preview consulted the cookie session"); });
    expect((await preview(admin())).status).toBe(200);
    expect(mocks.deliverPrivateGameAsset).toHaveBeenCalledTimes(1);
    mocks.deliverPrivateGameAsset.mockClear();
    for (const [label, request] of [
      ["subscriber ticket", () => preview(consumer())],
      ["school-key ticket", () => preview(school())],
      ["expired admin ticket", () => preview(signed({ v: 1, aud: "admin-preview", packageId: pkg, principalId: B, issuedAt: nowS() - 400, expiresAt: nowS() - 100 }))],
      ["another package", () => preview(admin("99999999-9999-4999-8999-999999999999"))],
      ["archived package", async () => { state.delivery = { id: pkg, resourceId: resource, entryFile: "game/index.html", publicationState: "archived" }; return preview(admin()); }]
    ] as Array<[string, () => Promise<Response>]>) {
      expectNotFound(await request(), label);
    }
    expect(mocks.deliverPrivateGameAsset).not.toHaveBeenCalled();
    expect(mocks.getGameAccessView).not.toHaveBeenCalled();
  });
});
