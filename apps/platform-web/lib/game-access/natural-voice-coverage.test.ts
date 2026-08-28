import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Natural-voice hard gate for Math Vocabulary Hunt: every phrase the canonical
 * game can speak — all TERMS display names plus the fixed praise/completion
 * phrases — must have a prebuilt first-party clip in the shipped manifest,
 * and every manifest file must exist on disk. Vocabulary drift without audio
 * regeneration fails here instead of falling back at runtime.
 */
describe("math vocabulary hunt natural voice", () => {
  const repoRoot = resolve(process.cwd(), "..", "..");
  const voiceDir = resolve(process.cwd(), "public", "game-suite", "voice");
  const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

  it("covers the complete spoken corpus with existing clips", () => {
    const vocabSource = readFileSync(join(repoRoot, "docs", "vocab.js"), "utf8");
    const sandbox: { exports: { TERMS?: Record<string, unknown>; resolveGridWords?: (keys: string[]) => { display: string }[] } } = { exports: {} };
    new Function("module", "exports", vocabSource)(sandbox, sandbox.exports);
    const { TERMS, resolveGridWords } = sandbox.exports;
    expect(TERMS && resolveGridWords).toBeTruthy();
    const displays = [...new Set(resolveGridWords!(Object.keys(TERMS!)).map((t) => t.display))];
    const phrases = [
      "Good job, Chief!",
      "Nice find, Chief!",
      "That's it, Chief!",
      "Sharp eyes!",
      "You got it!",
      "Way to go, Chief!",
      "Puzzle complete! Great teamwork!"
    ];
    const manifest = JSON.parse(readFileSync(join(voiceDir, "manifest.json"), "utf8")) as {
      engine: string;
      voice: string;
      clips: Record<string, string>;
    };
    expect(manifest.engine).toBe("chirp3-hd");
    expect(manifest.voice).toBe("en-US-Chirp3-HD-Aoede");
    // Deterministic mapping gate: no two displays may collapse to one key.
    const normalizedDisplays = displays.map(normalize);
    expect(new Set(normalizedDisplays).size, "normalization collision between term displays").toBe(displays.length);
    const corpus = [...displays, ...phrases].map(normalize);
    const missing = corpus.filter((phrase) => !manifest.clips[phrase]);
    expect(missing, `phrases without a natural clip: ${missing.slice(0, 5).join(" | ")}`).toHaveLength(0);
    const absent = Object.values(manifest.clips).filter((file) => !existsSync(join(voiceDir, file)));
    expect(absent, `manifest entries without files: ${absent.slice(0, 5).join(" | ")}`).toHaveLength(0);
  });
});
