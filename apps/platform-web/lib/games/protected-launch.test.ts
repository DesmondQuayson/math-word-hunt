// @vitest-environment node

import { Buffer } from "node:buffer";
import { jwtVerify, SignJWT } from "jose";
import { describe, expect, it } from "vitest";

import type { ExternalGameLaunchRecord } from "@/lib/games/catalog";
import {
  createNumberCrossLaunchUrl,
  externalGameLaunchAction,
  NUMBER_CROSS_GAME_ID,
  NUMBER_CROSS_LAUNCH_TTL_SECONDS,
  ProtectedGameLaunchConfigurationError
} from "@/lib/games/protected-launch";

const SECRET = "number-cross-mathnexa-test-secret-with-at-least-32-bytes";
const NOW = 1_800_000_000;

function game(overrides: Partial<ExternalGameLaunchRecord> = {}): ExternalGameLaunchRecord {
  return {
    id: "9c000000-0000-4000-8000-000000000001",
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
    skills: ["addition", "multiplication"],
    topics: ["arithmetic"],
    tags: ["number cross"],
    difficulty: "mixed",
    version: "1.0.0",
    status: "published",
    ...overrides
  };
}

describe("Number Cross protected HTTPS launch", () => {
  it("signs the exact 120-second Number Cross contract without personal data", async () => {
    const destination = await createNumberCrossLaunchUrl({
      game: game(), purpose: "play", secret: SECRET, now: NOW, jti: "launch-contract-id"
    });
    expect(destination.origin).toBe("https://number-cross.vercel.app");
    expect(destination.pathname).toBe("/api/launch");
    const token = destination.searchParams.get("launch");
    expect(token).toBeTruthy();
    const verified = await jwtVerify(token!, Buffer.from(SECRET, "utf8"), {
      algorithms: ["HS256"], issuer: "mathnexa", audience: NUMBER_CROSS_GAME_ID,
      currentDate: new Date((NOW + 1) * 1000), requiredClaims: ["iat", "exp", "jti"]
    });
    expect(verified.protectedHeader).toEqual({ alg: "HS256", typ: "JWT" });
    expect(verified.payload).toMatchObject({
      game: NUMBER_CROSS_GAME_ID, purpose: "play", iat: NOW,
      exp: NOW + NUMBER_CROSS_LAUNCH_TTL_SECONDS, jti: "launch-contract-id"
    });
    expect(verified.payload).not.toHaveProperty("email");
    expect(verified.payload).not.toHaveProperty("userId");
  });

  it("uses the same signed contract for authorized Admin preview", async () => {
    const destination = await createNumberCrossLaunchUrl({
      game: game({ status: "draft" }), purpose: "admin-preview", secret: SECRET, now: NOW, jti: "admin-preview-id"
    });
    const verified = await jwtVerify(destination.searchParams.get("launch")!, Buffer.from(SECRET, "utf8"), {
      algorithms: ["HS256"], issuer: "mathnexa", audience: NUMBER_CROSS_GAME_ID,
      currentDate: new Date(NOW * 1000)
    });
    expect(verified.payload.purpose).toBe("admin-preview");
  });

  it("fails closed for missing secrets, wrong games, unsafe destinations, and open-redirect input", async () => {
    await expect(createNumberCrossLaunchUrl({ game: game(), purpose: "play", secret: "short" }))
      .rejects.toBeInstanceOf(ProtectedGameLaunchConfigurationError);
    for (const candidate of [
      game({ stableKey: "another-game", slug: "another-game" }),
      game({ launch: { type: "external_https", url: "http://number-cross.vercel.app/", host: "number-cross.vercel.app" } }),
      game({ launch: { type: "external_https", url: "https://attacker.example/", host: "attacker.example" } }),
      game({ launch: { type: "external_https", url: "https://number-cross.vercel.app/?return=https://attacker.example", host: "number-cross.vercel.app" } })
    ]) {
      expect(externalGameLaunchAction(candidate, "play")).not.toBe("protected-number-cross");
      await expect(createNumberCrossLaunchUrl({ game: candidate, purpose: "play", secret: SECRET }))
        .rejects.toBeInstanceOf(ProtectedGameLaunchConfigurationError);
    }
  });

  it("blocks Draft, Maintenance, and Archived player launches before signing", () => {
    expect(externalGameLaunchAction(game({ status: "draft" }), "play")).toBe("not-found");
    expect(externalGameLaunchAction(game({ status: "maintenance" }), "play")).toBe("maintenance");
    expect(externalGameLaunchAction(game({ status: "archived" }), "play")).toBe("not-found");
  });

  it("produces tokens that reject tampering, expiry, and wrong-game claims", async () => {
    const destination = await createNumberCrossLaunchUrl({ game: game(), purpose: "play", secret: SECRET, now: NOW, jti: "security-test-id" });
    const token = destination.searchParams.get("launch")!;
    const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;
    await expect(jwtVerify(tampered, Buffer.from(SECRET, "utf8"), {
      algorithms: ["HS256"], issuer: "mathnexa", audience: NUMBER_CROSS_GAME_ID,
      currentDate: new Date(NOW * 1000)
    })).rejects.toThrow();
    await expect(jwtVerify(token, Buffer.from(SECRET, "utf8"), {
      algorithms: ["HS256"], issuer: "mathnexa", audience: NUMBER_CROSS_GAME_ID,
      currentDate: new Date((NOW + NUMBER_CROSS_LAUNCH_TTL_SECONDS + 6) * 1000)
    })).rejects.toThrow();
    const wrongGame = await new SignJWT({ game: "another-game" })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" }).setIssuer("mathnexa").setAudience("another-game")
      .setIssuedAt(NOW).setExpirationTime(NOW + 120).setJti("wrong-game-id")
      .sign(Buffer.from(SECRET, "utf8"));
    await expect(jwtVerify(wrongGame, Buffer.from(SECRET, "utf8"), {
      algorithms: ["HS256"], issuer: "mathnexa", audience: NUMBER_CROSS_GAME_ID,
      currentDate: new Date(NOW * 1000)
    })).rejects.toThrow();
  });
});
