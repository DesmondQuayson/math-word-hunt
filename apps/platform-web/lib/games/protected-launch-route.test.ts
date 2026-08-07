// @vitest-environment node
import { jwtVerify } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ExternalGameLaunchRecord } from "@/lib/games/catalog";

const mocks = vi.hoisted(() => ({
  inspectAdminAccess: vi.fn(),
  loadExternalGameLaunchRecord: vi.fn(),
  loadPublicGame: vi.fn(),
  requireProductAccess: vi.fn()
}));

vi.mock("@/lib/access/server", () => ({ requireProductAccess: mocks.requireProductAccess }));
vi.mock("@/lib/admin/session", () => ({ inspectAdminAccess: mocks.inspectAdminAccess }));
vi.mock("@/lib/games/catalog", () => ({
  loadExternalGameLaunchRecord: mocks.loadExternalGameLaunchRecord,
  loadPublicGame: mocks.loadPublicGame
}));

import { GET as adminPreview } from "@/app/admin/games/catalog/[catalogId]/preview/route";
import { GET as playerLaunch } from "@/app/games/[resourceId]/launch/route";

const SECRET = "route-test-number-cross-secret-with-at-least-32-bytes";

function numberCross(status: ExternalGameLaunchRecord["status"]): ExternalGameLaunchRecord {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    resourceId: null,
    packageId: null,
    stableKey: "number-cross",
    slug: "number-cross",
    title: "Number Cross",
    description: "Protected arithmetic puzzle.",
    launch: { type: "external_https", url: "https://number-cross.vercel.app/", host: "number-cross.vercel.app" },
    thumbnailReference: "builtin:number-cross",
    recommendedGradeMin: 3,
    recommendedGradeMax: 9,
    skills: ["addition"],
    topics: ["arithmetic"],
    tags: ["number-cross"],
    difficulty: "mixed",
    version: "1",
    status
  };
}

describe("protected Number Cross launch routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MATHNEXA_GAME_LAUNCH_SECRET = SECRET;
    mocks.requireProductAccess.mockResolvedValue(undefined);
    mocks.inspectAdminAccess.mockResolvedValue({ state: "authorized", admin: { id: "admin-id" } });
    mocks.loadPublicGame.mockResolvedValue(null);
  });

  afterEach(() => {
    delete process.env.MATHNEXA_GAME_LAUNCH_SECRET;
  });

  it("checks subscriber access before issuing a valid player assertion", async () => {
    mocks.loadExternalGameLaunchRecord.mockResolvedValue(numberCross("published"));
    const response = await playerLaunch(new Request("https://mathnexa.com/games/number-cross/launch"), {
      params: Promise.resolve({ resourceId: "number-cross" })
    });
    expect(mocks.requireProductAccess).toHaveBeenCalledWith("/games");
    expect(mocks.requireProductAccess.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.loadExternalGameLaunchRecord.mock.invocationCallOrder[0]
    );
    expect(response.status).toBe(303);
    const destination = new URL(response.headers.get("location")!);
    expect(destination.origin).toBe("https://number-cross.vercel.app");
    expect(destination.pathname).toBe("/api/launch");
    const verified = await jwtVerify(destination.searchParams.get("launch")!, Buffer.from(SECRET), {
      algorithms: ["HS256"], issuer: "mathnexa", audience: "number-cross"
    });
    expect(verified.payload).toMatchObject({ game: "number-cross", purpose: "play" });
    expect(Number(verified.payload.exp) - Number(verified.payload.iat)).toBe(120);
  });

  it("does not query or sign when the existing premium gate denies access", async () => {
    mocks.requireProductAccess.mockRejectedValue(new Error("access-denied"));
    await expect(playerLaunch(new Request("https://mathnexa.com/games/number-cross/launch"), {
      params: Promise.resolve({ resourceId: "number-cross" })
    })).rejects.toThrow("access-denied");
    expect(mocks.loadExternalGameLaunchRecord).not.toHaveBeenCalled();
  });

  it("blocks Draft and redirects Maintenance without creating a bearer URL", async () => {
    mocks.loadExternalGameLaunchRecord.mockResolvedValueOnce(numberCross("draft"));
    const draft = await playerLaunch(new Request("https://mathnexa.com/games/number-cross/launch"), {
      params: Promise.resolve({ resourceId: "number-cross" })
    });
    expect(draft.status).toBe(404);

    mocks.loadExternalGameLaunchRecord.mockResolvedValueOnce(numberCross("maintenance"));
    const maintenance = await playerLaunch(new Request("https://mathnexa.com/games/number-cross/launch"), {
      params: Promise.resolve({ resourceId: "number-cross" })
    });
    expect(maintenance.status).toBe(303);
    expect(maintenance.headers.get("location")).toBe("https://mathnexa.com/games/number-cross/maintenance");
    expect(maintenance.headers.get("location")).not.toContain("launch=");
  });

  it("conceals Admin preview from ordinary users and signs only after MFA-backed authorization", async () => {
    mocks.inspectAdminAccess.mockResolvedValueOnce({ state: "not-authorized" });
    const denied = await adminPreview(new Request("https://mathnexa.com/admin/games/catalog/id/preview"), {
      params: Promise.resolve({ catalogId: "10000000-0000-4000-8000-000000000001" })
    });
    expect(denied.status).toBe(404);
    expect(mocks.loadExternalGameLaunchRecord).not.toHaveBeenCalled();

    mocks.inspectAdminAccess.mockResolvedValueOnce({ state: "authorized", admin: { id: "admin-id" } });
    mocks.loadExternalGameLaunchRecord.mockResolvedValueOnce(numberCross("draft"));
    const preview = await adminPreview(new Request("https://mathnexa.com/admin/games/catalog/id/preview"), {
      params: Promise.resolve({ catalogId: "10000000-0000-4000-8000-000000000001" })
    });
    expect(preview.status).toBe(303);
    const token = new URL(preview.headers.get("location")!).searchParams.get("launch")!;
    const verified = await jwtVerify(token, Buffer.from(SECRET), {
      algorithms: ["HS256"], issuer: "mathnexa", audience: "number-cross"
    });
    expect(verified.payload).toMatchObject({ game: "number-cross", purpose: "admin-preview" });
  });
});
