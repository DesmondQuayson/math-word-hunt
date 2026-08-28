import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { enhanceCanonicalGameHtml } from "./canonical-runtime-enhancements";

describe("canonical game runtime enhancements", () => {
  it("adds one same-origin music adapter and accessible credit without changing the source file", async () => {
    const sourcePath = resolve(process.cwd(), "..", "..", "docs", "index.html");
    const before = await readFile(sourcePath);
    const enhanced = enhanceCanonicalGameHtml(before).toString("utf8");
    const after = await readFile(sourcePath);
    expect(after.equals(before)).toBe(true);
    expect(enhanced.match(/data-mathnexa-game-suite="music"/g)).toHaveLength(1);
    expect(enhanced.match(/data-mathnexa-game-suite="credit"/g)).toHaveLength(1);
    expect(enhanced.match(/data-mathnexa-game-suite="voice"/g)).toHaveLength(1);
    expect(enhanced).toContain('src="/game-suite/math-vocabulary-music.js"');
    expect(enhanced).toContain('src="/game-suite/natural-voice.js"');
    // The voice adapter must sit in <head>, ahead of the inline game script.
    expect(enhanced.indexOf("natural-voice.js")).toBeLessThan(enhanced.indexOf("</head>"));
    expect(enhanced).toContain("Cosmic Candy Catchers");
    expect(enhanced).toContain("CC BY 3.0");
  });

  it("fails closed instead of applying the adapter twice", () => {
    const html = Buffer.from('<html><head></head><body data-mathnexa-game-suite="already"></body></html>');
    expect(() => enhanceCanonicalGameHtml(html)).toThrow(/missing or duplicated/i);
  });
});
