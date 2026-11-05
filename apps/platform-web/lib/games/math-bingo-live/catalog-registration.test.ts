// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Math Bingo Live in the shared catalog machinery (internal game registry):
 * listed only once PUBLISHED, opened on the host screen, publishable and
 * archivable by Super Admin, and never served as a draft through the generic
 * /games/<slug>/play route.
 */

type Row = Record<string, unknown>;

const mocks = vi.hoisted(() => ({
  rows: [] as Row[],
  catalogRow: null as Row | null,
  rpc: vi.fn(),
  inspectAdminAccess: vi.fn(),
  validateAdminMutationCsrf: vi.fn(),
  revalidatePath: vi.fn(),
  loadInternalGameLaunchRecord: vi.fn(),
  requireProductAccess: vi.fn(),
  requireGamePlayAccess: vi.fn()
}));

function catalogQuery() {
  const filters: [string, unknown][] = [];
  const query = {
    select: () => query,
    eq: (column: string, value: unknown) => { filters.push([column, value]); return query; },
    order: () => query,
    maybeSingle: async () => ({ data: mocks.catalogRow, error: null }),
    then: (resolve: (value: unknown) => unknown) =>
      resolve({ data: mocks.rows.filter((row) => filters.every(([column, value]) => row[column] === value)), error: null })
  };
  return query;
}

vi.mock("@/lib/supabase/service", () => ({
  createServiceSupabaseClient: () => ({
    from: (table: string) => table === "game_external_allowed_hosts"
      ? { select: () => ({ eq: async () => ({ data: [], error: null }) }) }
      : catalogQuery(),
    rpc: mocks.rpc
  })
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/admin/session", () => ({ inspectAdminAccess: mocks.inspectAdminAccess, validateAdminMutationCsrf: mocks.validateAdminMutationCsrf }));
vi.mock("@/lib/admin/access-response", () => ({ adminAccessDeniedResponse: () => new Response("denied", { status: 403 }) }));
vi.mock("@/lib/access/server", () => ({ requireProductAccess: mocks.requireProductAccess, requireGamePlayAccess: mocks.requireGamePlayAccess }));

import { gamePlayHref, loadPublicGameCatalog } from "@/lib/games/catalog";
import { POST as transitionStatus } from "@/app/admin/games/catalog/status/route";
import { GET as bingoPlay } from "@/app/games/math-bingo-live/play/route";

const BINGO_ID = "b1a6260b-0000-4000-8000-000000000001";

function entry(stableKey: string, status: string, extra: Row = {}): Row {
  return {
    id: `${stableKey}-id`, resource_id: null, package_id: null, stable_key: stableKey, slug: stableKey, title: stableKey,
    description: "", launch_type: "internal", canonical_route: null, external_url: null, external_allowed_host: null,
    thumbnail_reference: `builtin:${stableKey}`, recommended_grade_min: 1, recommended_grade_max: 6, skills: [], topics: [], tags: [],
    difficulty: "mixed", display_order: 1, version: "1.0.0", status, ...extra
  };
}

const MVH = entry("math-vocabulary-hunt", "published", { launch_type: "canonical", canonical_route: "/play" });

describe("Math Bingo Live in the public catalog", () => {
  it("is never listed while it is a draft", async () => {
    mocks.rows = [MVH, entry("math-tug-of-war", "published"), entry("math-bingo-live", "draft")];
    const catalog = await loadPublicGameCatalog(false);
    expect(catalog.state).toBe("ready");
    expect(catalog.games.map((game) => game.stableKey)).toEqual(["math-vocabulary-hunt", "math-tug-of-war"]);
  });

  it("is listed once published, and its catalog card opens the host screen", async () => {
    mocks.rows = [MVH, entry("math-bingo-live", "published")];
    const catalog = await loadPublicGameCatalog(false);
    const bingo = catalog.games.find((game) => game.stableKey === "math-bingo-live");
    expect(bingo?.launch).toEqual({ type: "internal", key: "math-bingo-live" });
    expect(gamePlayHref(bingo!)).toBe("/games/math-bingo-live/host");
  });
});

describe("Super Admin publish and archive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.inspectAdminAccess.mockResolvedValue({ state: "authorized", admin: { id: "admin-id" }, session: {} });
    mocks.validateAdminMutationCsrf.mockResolvedValue(true);
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    mocks.catalogRow = { slug: "math-bingo-live", stable_key: "math-bingo-live", launch_type: "internal" };
  });

  function form(status: string) {
    const body = new FormData();
    body.set("catalogId", BINGO_ID);
    body.set("lockVersion", "3");
    body.set("status", status);
    return new Request("https://mathnexa.com/admin/games/catalog/status", { method: "POST", body });
  }

  it.each(["published", "archived"])("the registered game reaches the catalog transition (%s)", async (status) => {
    const response = await transitionStatus(form(status));
    expect(mocks.rpc).toHaveBeenCalledWith("transition_game_catalog_entry", {
      p_actor_admin_id: "admin-id", p_catalog_entry_id: BINGO_ID, p_expected_lock_version: 3, p_status: status
    });
    expect(new URL(response.headers.get("location")!).searchParams.get("package")).toBe(status);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/games");
  });

  it("an unregistered internal key still fails closed before any transition", async () => {
    mocks.catalogRow = { slug: "math-bingo-live", stable_key: "math-bingo-live-v2", launch_type: "internal" };
    const response = await transitionStatus(form("published"));
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(new URL(response.headers.get("location")!).searchParams.get("package")).toBe("failed-closed");
  });
});

describe("/games/math-bingo-live/play", () => {
  it("only points at the host screen; it never serves a document itself", async () => {
    const response = bingoPlay(new Request("https://mathnexa.com/games/math-bingo-live/play"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://mathnexa.com/games/math-bingo-live/host");
    expect(mocks.requireGamePlayAccess).not.toHaveBeenCalled();
    expect(mocks.loadInternalGameLaunchRecord).not.toHaveBeenCalled();
  });
});
