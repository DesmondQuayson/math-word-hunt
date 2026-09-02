import { afterEach, describe, expect, it } from "vitest";

import { isCanonicalAssetName } from "./canonical-assets";
import { MVH_AUDIO_RUNTIME_FILE } from "./mvh-audio-runtime-manifest.mjs";
import { gameLaunchHref, gameRuntimeGeneration } from "./runtime-generation";

/**
 * The game DOCUMENT is versioned per deployment, not only the audio asset.
 * A content-hashed runtime helps only once a new document asks for it; a
 * document kept alive in memory or keyed by URL in an intermediary can pin an
 * old generation while every server byte is correct. The launch URL therefore
 * carries an automatic, non-secret generation identifier.
 */

const originalSha = process.env.VERCEL_GIT_COMMIT_SHA;
afterEach(() => {
  if (originalSha === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA;
  else process.env.VERCEL_GIT_COMMIT_SHA = originalSha;
});

describe("mvh game runtime generation", () => {
  it("uses the deployment's own commit identity when present", () => {
    process.env.VERCEL_GIT_COMMIT_SHA = "AB12cd34EF56ab78cd90ef12ab34cd56ef78ab90";
    expect(gameRuntimeGeneration()).toBe("ab12cd34ef56");
    expect(gameLaunchHref()).toBe("/game/runtime/index.html?launch=ab12cd34ef56");
  });

  it("falls back to the audio runtime's content hash, never a hand-maintained id", () => {
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    const generation = gameRuntimeGeneration();
    expect(MVH_AUDIO_RUNTIME_FILE).toContain(generation);
    expect(generation).toMatch(/^[0-9a-f]{12}$/);
  });

  it("rejects a malformed sha instead of stamping garbage into the URL", () => {
    process.env.VERCEL_GIT_COMMIT_SHA = "not a sha; <script>";
    const generation = gameRuntimeGeneration();
    expect(generation).toMatch(/^[0-9a-f]{12}$/);
    expect(gameLaunchHref()).toBe(`/game/runtime/index.html?launch=${generation}`);
  });

  it("is identity, not authority: the runtime route resolves assets from path segments only", () => {
    // The ?launch= query never participates in asset-name validation, so an
    // old or hostile query value cannot change what is served.
    expect(isCanonicalAssetName("index.html")).toBe(true);
    expect(isCanonicalAssetName("index.html?launch=stale")).toBe(false);
    expect(isCanonicalAssetName("index.html&launch=x")).toBe(false);
  });
});
