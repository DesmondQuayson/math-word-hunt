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
import { GET as crosscalcV2Preview } from "@/app/games/crosscalc/v2/preview/route";
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

function crosscalc(status: InternalGameLaunchRecord["status"], version = "0.1.0"): InternalGameLaunchRecord {
  return {
    ...numberCross(status, "crosscalc"),
    id: "f457a0db-98bb-4401-8584-c8ba5cd93c98",
    slug: "crosscalc",
    title: "CrossCalc",
    description: "Connected arithmetic paths.",
    thumbnailReference: "builtin:crosscalc",
    tags: ["crosscalc"],
    version
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

  it("serves V2 only to an authorized admin and keeps subscriber CrossCalc on V1", async () => {
    mocks.inspectAdminAccess.mockResolvedValueOnce({ state: "not-authorized" });
    expect((await crosscalcV2Preview()).status).toBe(404);

    mocks.inspectAdminAccess.mockResolvedValueOnce({ state: "authorized", admin: { id: "admin-id" } });
    const direct = await crosscalcV2Preview();
    expect(direct.status).toBe(200);
    expect(await direct.text()).toContain("Admin Preview · Version 0.2.0");

    mocks.loadInternalGameLaunchRecord.mockResolvedValueOnce(crosscalc("published"));
    const publicV1 = await playerPlay(new Request("https://mathnexa.com/games/crosscalc/play?version=0.2.0"), {
      params: Promise.resolve({ resourceId: "crosscalc" })
    });
    const publicBody = await publicV1.text();
    expect(publicBody).toContain('<base href="/internal-games/crosscalc/"');
    expect(publicBody).toContain("connect equations through shared digits");
    expect(publicBody).not.toContain("/internal-games/crosscalc-v2/");
    expect(publicBody).not.toContain("Preview Version 0.2.0");
  });

  it("atomically serves V2 when the existing CrossCalc catalog version advances to 0.2.0", async () => {
    mocks.loadInternalGameLaunchRecord.mockResolvedValueOnce(crosscalc("published", "0.2.0"));
    const publicV2 = await playerPlay(new Request("https://mathnexa.com/games/crosscalc/play"), {
      params: Promise.resolve({ resourceId: "crosscalc" })
    });
    const body = await publicV2.text();
    expect(publicV2.status).toBe(200);
    expect(body).toContain('<base href="/internal-games/crosscalc-v2/"');
    expect(body).toContain('<script src="./runtime-music.js"');
    expect(body).toContain('<script src="./runtime-layout.js"');
    expect(body).toContain("place whole-number tiles");
    expect(body).not.toContain("NOT LIVE");
    expect(body).not.toContain("/internal-games/crosscalc/");
  });

  it("requires explicit V2 version selection on the authorized Admin Preview route", async () => {
    mocks.loadInternalGameLaunchRecord.mockResolvedValueOnce(crosscalc("published"));
    const v2 = await adminPreview(new Request("https://mathnexa.com/admin/games/catalog/id/preview?version=0.2.0"), {
      params: Promise.resolve({ catalogId: "f457a0db-98bb-4401-8584-c8ba5cd93c98" })
    });
    expect(v2.status).toBe(200);
    expect(await v2.text()).toContain("CrossCalc V2 · NOT LIVE");

    mocks.loadInternalGameLaunchRecord.mockResolvedValueOnce(crosscalc("published"));
    const unknown = await adminPreview(new Request("https://mathnexa.com/admin/games/catalog/id/preview?version=9.9.9"), {
      params: Promise.resolve({ catalogId: "f457a0db-98bb-4401-8584-c8ba5cd93c98" })
    });
    expect(unknown.status).toBe(404);
  });
});
