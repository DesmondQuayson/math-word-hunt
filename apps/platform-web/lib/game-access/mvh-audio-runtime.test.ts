import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// The builder itself is under test: the same assembly that generates the
// committed artifact must regenerate it from the committed sources.
import { buildMvhAudioRuntime } from "../../../../scripts/build-mvh-audio-runtime.mjs";
import { enhanceCanonicalGameHtml } from "./canonical-runtime-enhancements";
import { MVH_AUDIO_RUNTIME_FILE } from "./mvh-audio-runtime-manifest.mjs";

/**
 * Version-atomic delivery gate for the Math Vocabulary Hunt audio runtime.
 *
 * The production failure this protects against: two independent unhashed
 * files (natural-voice.js + math-vocabulary-music.js) cached separately, so a
 * browser or proxy executed a mismatched pair and ducking silently died. The
 * fix is one content-addressed runtime; these tests fail if that atomicity is
 * ever weakened.
 */

const repoRoot = resolve(process.cwd(), "..", "..");
const gameSuite = resolve(process.cwd(), "public", "game-suite");
const normalize = (text: string) => text.replace(/\r\n/g, "\n");

const sources = () => ({
  voiceSource: readFileSync(join(gameSuite, "natural-voice.js"), "utf8"),
  musicSource: readFileSync(join(gameSuite, "math-vocabulary-music.js"), "utf8")
});

describe("mvh version-atomic audio runtime", () => {
  it("keeps exactly one committed runtime, matching the sources, the manifest and its own hash", () => {
    const onDiskNames = readdirSync(gameSuite).filter((name) => /^mvh-audio-runtime\./.test(name));
    // ONE generation on disk -- never a pile of stale hashes for a browser to find.
    expect(onDiskNames).toEqual([MVH_AUDIO_RUNTIME_FILE]);
    expect(MVH_AUDIO_RUNTIME_FILE).toMatch(/^mvh-audio-runtime\.[0-9a-f]{12}\.js$/);

    const { voiceSource, musicSource } = sources();
    const rebuilt = buildMvhAudioRuntime(voiceSource, musicSource);
    // Drift gate: editing a source module without regenerating fails here.
    expect(rebuilt.fileName).toBe(MVH_AUDIO_RUNTIME_FILE);
    expect(normalize(readFileSync(join(gameSuite, MVH_AUDIO_RUNTIME_FILE), "utf8"))).toBe(rebuilt.content);

    // The name is honestly content-addressed: recompute the hash independently
    // from the payload (everything after the generated banner).
    const payload = rebuilt.content.slice(rebuilt.content.indexOf("*/\n") + 3);
    const independent = createHash("sha256").update(payload, "utf8").digest("hex").slice(0, 12);
    expect(MVH_AUDIO_RUNTIME_FILE).toBe(`mvh-audio-runtime.${independent}.js`);
  });

  it("carries both audio authorities and their coupling contract in one file", () => {
    const runtime = normalize(readFileSync(join(gameSuite, MVH_AUDIO_RUNTIME_FILE), "utf8"));
    // Voice half.
    expect(runtime).toContain("var VOICE_CHANNEL_LEVEL = 1;");
    expect(runtime).toContain('var ACTIVITY_EVENT = "mathnexa:voice-activity";');
    // Music half.
    expect(runtime).toContain("const MUSIC_CHANNEL_LEVEL = .5;");
    expect(runtime).toContain("const DUCKED_MUSIC_LEVEL = .15;");
    expect(runtime).toMatch(/attributeFilter:\s*\[\s*"data-voice-state"\s*\]/);
    // The music half waits for the parsed document, as its end-of-body tag did.
    expect(runtime).toMatch(/readyState === "loading"\) document\.addEventListener\("DOMContentLoaded", bootMvhMusic\)/);
  });

  it("gives different builds different URLs, so an old cache can never satisfy a new document", () => {
    const { voiceSource, musicSource } = sources();
    const current = buildMvhAudioRuntime(voiceSource, musicSource);
    // A real historical generation, not a synthetic tweak: the sources as they
    // shipped in the previous production build.
    const oldVoice = execFileSync("git", ["show", "ae71504~1:apps/platform-web/public/game-suite/natural-voice.js"], {
      cwd: repoRoot,
      maxBuffer: 8e6
    }).toString("utf8");
    const oldMusic = execFileSync(
      "git",
      ["show", "ae71504~1:apps/platform-web/public/game-suite/math-vocabulary-music.js"],
      { cwd: repoRoot, maxBuffer: 8e6 }
    ).toString("utf8");
    const previous = buildMvhAudioRuntime(oldVoice, oldMusic);
    expect(previous.fileName).not.toBe(current.fileName);
    // And a synthetic one-character change also moves the URL.
    const touched = buildMvhAudioRuntime(voiceSource, musicSource + "\n// touched\n");
    expect(touched.fileName).not.toBe(current.fileName);
  });

  it("keeps the served document pointing at the exact on-disk generation", () => {
    const enhanced = enhanceCanonicalGameHtml(readFileSync(join(repoRoot, "docs", "index.html"))).toString("utf8");
    const referenced = enhanced.match(/\/game-suite\/(mvh-audio-runtime\.[0-9a-f]{12}\.js)/g) ?? [];
    expect(referenced).toEqual([`/game-suite/${MVH_AUDIO_RUNTIME_FILE}`]);
    expect(readdirSync(gameSuite)).toContain(MVH_AUDIO_RUNTIME_FILE);
  });
});
