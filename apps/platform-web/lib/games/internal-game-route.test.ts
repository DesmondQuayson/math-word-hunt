// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { InternalGameLaunchRecord } from "@/lib/games/catalog";

const mocks = vi.hoisted(() => ({
  inspectAdminAccess: vi.fn(),
  loadExternalGameLaunchRecord: vi.fn(),
  loadInternalGameLaunchRecord: vi.fn(),
  requireProductAccess: vi.fn()
}));

vi.mock("@/lib/access/server", () => ({ requireProductAccess: mocks.requireProductAccess }));
vi.mock("@/lib/admin/session", () => ({ inspectAdminAccess: mocks.inspectAdminAccess }));
vi.mock("@/lib/games/catalog", () => ({
  loadExternalGameLaunchRecord: mocks.loadExternalGameLaunchRecord,
  loadInternalGameLaunchRecord: mocks.loadInternalGameLaunchRecord
}));

import { GET as adminPreview } from "@/app/admin/games/catalog/[catalogId]/preview/route";
import { GET as playerPlay } from "@/app/games/[resourceId]/play/route";

function numberCross(status: InternalGameLaunchRecord["status"], stableKey = "number-cross"): InternalGameLaunchRecord {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    resourceId: null,
    packageId: null,
    stableKey,
    slug: "number-cross",
    title: "Number Cross",
    description: "Protected arithmetic puzzle.",
    launch: { type: "internal", key: stableKey },
    thumbnailReference: "builtin:number-cross",
    recommendedGradeMin: 3,
    recommendedGradeMax: 9,
    skills: ["addition"],
    topics: ["arithmetic"],
    tags: ["number-cross"],
    difficulty: "mixed",
    version: "1.0.0",
    status
  };
}

function numberLogic(status: InternalGameLaunchRecord["status"]): InternalGameLaunchRecord {
  return {
    ...numberCross(status, "number-logic"),
    id: "11000000-0000-4000-8000-000000000001",
    slug: "number-logic",
    title: "Number Logic",
    description: "Six native number-placement puzzles.",
    thumbnailReference: "builtin:number-logic",
    tags: ["number-logic"],
    version: "0.1.0"
  };
}

describe("native internal game authorization routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireProductAccess.mockResolvedValue(undefined);
    mocks.inspectAdminAccess.mockResolvedValue({ state: "authorized", admin: { id: "admin-id" } });
    mocks.loadExternalGameLaunchRecord.mockResolvedValue(null);
    mocks.loadInternalGameLaunchRecord.mockResolvedValue(null);
  });

  it("enforces subscriber access before reading or rendering the player game", async () => {
    mocks.requireProductAccess.mockRejectedValue(new Error("access-denied"));
    await expect(playerPlay(new Request("https://mathnexa.com/games/number-cross/play"), {
      params: Promise.resolve({ resourceId: "number-cross" })
    })).rejects.toThrow("access-denied");
    expect(mocks.loadInternalGameLaunchRecord).not.toHaveBeenCalled();
  });

  it("conceals Draft, Archived, unregistered, and spoofed-preview player requests", async () => {
    for (const game of [numberCross("draft"), numberCross("archived"), numberCross("published", "unregistered")]) {
      mocks.loadInternalGameLaunchRecord.mockResolvedValueOnce(game);
      const response = await playerPlay(new Request("https://mathnexa.com/games/number-cross/play?preview=true"), {
        params: Promise.resolve({ resourceId: "number-cross" })
      });
      expect(response.status).toBe(404);
    }
  });

  it("uses the MathNexa maintenance experience and renders a Published game in place", async () => {
    mocks.loadInternalGameLaunchRecord.mockResolvedValueOnce(numberCross("maintenance"));
    const maintenance = await playerPlay(new Request("https://mathnexa.com/games/number-cross/play"), {
      params: Promise.resolve({ resourceId: "number-cross" })
    });
    expect(maintenance.status).toBe(303);
    expect(maintenance.headers.get("location")).toBe("https://mathnexa.com/games/number-cross/maintenance");

    mocks.loadInternalGameLaunchRecord.mockResolvedValueOnce(numberCross("published"));
    const published = await playerPlay(new Request("https://mathnexa.com/games/number-cross/play"), {
      params: Promise.resolve({ resourceId: "number-cross" })
    });
    expect(published.status).toBe(200);
    expect(await published.text()).toContain("Number Cross · MathNexa");
    expect(published.headers.get("location")).toBeNull();
  });

  it("requires the existing MFA-backed Admin session and previews Draft directly", async () => {
    mocks.inspectAdminAccess.mockResolvedValueOnce({ state: "not-authorized" });
    const denied = await adminPreview(new Request("https://mathnexa.com/admin/games/catalog/id/preview"), {
      params: Promise.resolve({ catalogId: "10000000-0000-4000-8000-000000000001" })
    });
    expect(denied.status).toBe(404);
    expect(mocks.loadInternalGameLaunchRecord).not.toHaveBeenCalled();

    mocks.inspectAdminAccess.mockResolvedValueOnce({ state: "authorized", admin: { id: "admin-id" } });
    mocks.loadInternalGameLaunchRecord.mockResolvedValueOnce(numberCross("draft"));
    const preview = await adminPreview(new Request("https://mathnexa.com/admin/games/catalog/id/preview"), {
      params: Promise.resolve({ catalogId: "10000000-0000-4000-8000-000000000001" })
    });
    expect(preview.status).toBe(200);
    expect(preview.headers.get("location")).toBeNull();
    expect(await preview.text()).not.toContain("number-cross.vercel.app");
  });

  it("previews one Draft Number Logic registration and keeps normal play concealed", async () => {
    mocks.loadInternalGameLaunchRecord.mockResolvedValueOnce(numberLogic("draft"));
    const preview = await adminPreview(new Request("https://mathnexa.com/admin/games/catalog/id/preview"), {
      params: Promise.resolve({ catalogId: "11000000-0000-4000-8000-000000000001" })
    });
    expect(preview.status).toBe(200);
    const previewBody = await preview.text();
    expect(previewBody).toContain("Number Logic · MathNexa");
    expect(previewBody).toContain('/internal-games/number-logic/');
    expect(previewBody).not.toContain("iframe");

    mocks.loadInternalGameLaunchRecord.mockResolvedValueOnce(numberLogic("draft"));
    const play = await playerPlay(new Request("https://mathnexa.com/games/number-logic/play"), {
      params: Promise.resolve({ resourceId: "number-logic" })
    });
    expect(play.status).toBe(404);
  });
});
