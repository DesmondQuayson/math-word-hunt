/**
 * Math Vocabulary Hunt version-atomic audio runtime builder.
 *
 * WHY THIS EXISTS
 * The game's audio used to ship as two independent files under stable names
 * (natural-voice.js and math-vocabulary-music.js). Each cached and revalidated
 * on its own, so a browser or school proxy could execute a mismatched pair --
 * new music with an old voice engine, or the reverse -- and ducking silently
 * died while every server served correct bytes. That failure was observed in
 * production and reproduced from cached historical builds.
 *
 * This builder removes the whole class: it emits ONE runtime file whose NAME
 * is a content hash, so there is exactly one fetch, one generation, and one
 * URL per build. A cache can keep an old runtime forever without harm, because
 * a new build references a new URL.
 *
 * The two source modules stay separate and maintainable; only delivery is
 * atomic. The voice engine half runs immediately (it must exist before the
 * canonical game's inline script, which is why the enhancer injects the
 * runtime into <head>); the music half used to run at the end of <body>, so
 * it is deferred to DOMContentLoaded, after the inline game script has
 * registered its controls and published its hooks.
 *
 *   node scripts/build-mvh-audio-runtime.mjs          # rebuild + write manifest
 *   node scripts/build-mvh-audio-runtime.mjs --check  # fail if committed output is stale
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const gameSuiteDir = join(root, "apps", "platform-web", "public", "game-suite");
const manifestPath = join(root, "apps", "platform-web", "lib", "game-access", "mvh-audio-runtime-manifest.mjs");
const manifestTypesPath = join(root, "apps", "platform-web", "lib", "game-access", "mvh-audio-runtime-manifest.d.mts");

const normalize = (source) => source.replace(/\r\n/g, "\n");

/**
 * Pure assembly: (voice source, music source) -> { hash, fileName, content }.
 * Deterministic across checkouts: sources are newline-normalized before
 * hashing, and the emitted file is LF (pinned via .gitattributes).
 */
export function buildMvhAudioRuntime(voiceSource, musicSource) {
  const voice = normalize(voiceSource).trimEnd();
  const music = normalize(musicSource).trimEnd();
  const body = [
    "/* ---- natural voice engine (runs immediately; must precede the inline game script) ---- */",
    voice,
    "",
    "/* ---- background music channel (needs the parsed document and the game's hooks, so it",
    "        waits for DOMContentLoaded -- the moment its old end-of-body script tag ran) ---- */",
    ";(function () {",
    '  "use strict";',
    "  var bootMvhMusic = function () {",
    music,
    "  };",
    '  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootMvhMusic);',
    "  else bootMvhMusic();",
    "})();",
    ""
  ].join("\n");
  const hash = createHash("sha256").update(body, "utf8").digest("hex").slice(0, 12);
  const fileName = `mvh-audio-runtime.${hash}.js`;
  const banner = [
    "/*",
    " * MathNexa Math Vocabulary Hunt audio runtime -- GENERATED FILE, DO NOT EDIT.",
    " *",
    ` * build ${hash}: content-addressed, one generation per URL. Edit the source`,
    " * modules (natural-voice.js, math-vocabulary-music.js) and regenerate with:",
    " *   node scripts/build-mvh-audio-runtime.mjs",
    " */",
    ""
  ].join("\n");
  return { hash, fileName, content: banner + body };
}

export function readSources() {
  return {
    voiceSource: readFileSync(join(gameSuiteDir, "natural-voice.js"), "utf8"),
    musicSource: readFileSync(join(gameSuiteDir, "math-vocabulary-music.js"), "utf8")
  };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { voiceSource, musicSource } = readSources();
  const built = buildMvhAudioRuntime(voiceSource, musicSource);
  const existing = readdirSync(gameSuiteDir).filter((name) => /^mvh-audio-runtime\.[0-9a-f]{12}\.js$/.test(name));

  if (process.argv.includes("--check")) {
    const current = existing.length === 1 ? existing[0] : null;
    const onDisk = current ? normalize(readFileSync(join(gameSuiteDir, current), "utf8")) : null;
    const manifest = readFileSync(manifestPath, "utf8");
    const fresh = current === built.fileName && onDisk === built.content && manifest.includes(`"${built.fileName}"`);
    if (!fresh) {
      console.error(`STALE: committed runtime ${current ?? "(none)"} does not match sources (expected ${built.fileName}).`);
      console.error("Run: node scripts/build-mvh-audio-runtime.mjs");
      process.exit(1);
    }
    console.log(`mvh-audio-runtime is current: ${built.fileName}`);
    process.exit(0);
  }

  for (const name of existing) if (name !== built.fileName) rmSync(join(gameSuiteDir, name));
  writeFileSync(join(gameSuiteDir, built.fileName), built.content);
  writeFileSync(
    manifestPath,
    [
      "// GENERATED by scripts/build-mvh-audio-runtime.mjs -- DO NOT EDIT.",
      "// The single version-atomic audio runtime the canonical enhancer injects.",
      "// Content-addressed: the name changes whenever either audio source changes,",
      "// so a cached older generation can never satisfy a newer document.",
      `export const MVH_AUDIO_RUNTIME_FILE = "${built.fileName}";`,
      ""
    ].join("\n")
  );
  writeFileSync(
    manifestTypesPath,
    [
      "// GENERATED by scripts/build-mvh-audio-runtime.mjs -- DO NOT EDIT.",
      "export declare const MVH_AUDIO_RUNTIME_FILE: string;",
      ""
    ].join("\n")
  );
  console.log(`built ${built.fileName} (${built.content.length} bytes) + manifest`);
}
