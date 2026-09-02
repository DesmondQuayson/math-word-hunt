import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { enhanceCanonicalGameHtml } from "./canonical-runtime-enhancements";
import { MVH_AUDIO_RUNTIME_FILE } from "./mvh-audio-runtime-manifest.mjs";

describe("canonical game runtime enhancements", () => {
  it("injects exactly one version-atomic audio runtime and never the legacy standalone pair", async () => {
    const sourcePath = resolve(process.cwd(), "..", "..", "docs", "index.html");
    const before = await readFile(sourcePath);
    const enhanced = enhanceCanonicalGameHtml(before).toString("utf8");
    const after = await readFile(sourcePath);
    expect(after.equals(before)).toBe(true);

    // ONE audio authority, content-addressed, taken from the generated manifest.
    expect(enhanced.match(/data-mathnexa-game-suite="audio-runtime"/g)).toHaveLength(1);
    expect(enhanced).toContain(`src="/game-suite/${MVH_AUDIO_RUNTIME_FILE}"`);
    expect(MVH_AUDIO_RUNTIME_FILE).toMatch(/^mvh-audio-runtime\.[0-9a-f]{12}\.js$/);

    // The independent unhashed generations caused the production version-skew
    // failure. They must never come back as active scripts in the real game.
    expect(enhanced).not.toMatch(/<script[^>]*natural-voice\.js/);
    expect(enhanced).not.toMatch(/<script[^>]*math-vocabulary-music\.js/);
    expect(enhanced).not.toMatch(/data-mathnexa-game-suite="voice"/);
    expect(enhanced).not.toMatch(/data-mathnexa-game-suite="music"/);

    // The runtime must sit in <head>, ahead of the inline game script.
    expect(enhanced.indexOf(MVH_AUDIO_RUNTIME_FILE)).toBeLessThan(enhanced.indexOf("</head>"));

    // A back/forward-cache revival resurrects an old document FROM MEMORY with
    // its audio already torn down by pagehide cleanup — the document must
    // reload itself into the current generation instead of resuming stale.
    expect(enhanced.match(/data-mathnexa-game-suite="freshness"/g)).toHaveLength(1);
    const freshness = enhanced.match(/<script data-mathnexa-game-suite="freshness">([^<]*)<\/script>/)?.[1] ?? "";
    expect(freshness).toContain('addEventListener("pageshow"');
    expect(freshness, "reload must be gated on a persisted (bfcache) restore, never a plain load").toContain(
      "if(event.persisted)location.reload()"
    );
    expect(enhanced.indexOf('data-mathnexa-game-suite="freshness"')).toBeLessThan(enhanced.indexOf("</head>"));

    // Attribution and chrome are unchanged.
    expect(enhanced.match(/data-mathnexa-game-suite="credit"/g)).toHaveLength(1);
    expect(enhanced).toContain("Cosmic Candy Catchers");
    expect(enhanced).toContain("CC BY 3.0");
    expect(enhanced.match(/data-mathnexa-game-suite="back"/g)).toHaveLength(1);
  });

  it("fails closed instead of applying the adapter twice", () => {
    const html = Buffer.from('<html><head></head><body data-mathnexa-game-suite="already"></body></html>');
    expect(() => enhanceCanonicalGameHtml(html)).toThrow(/missing or duplicated/i);
  });
});
