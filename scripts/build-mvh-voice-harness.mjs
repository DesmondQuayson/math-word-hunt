/**
 * Local QA harness for the enhanced Math Vocabulary Hunt.
 *
 * Lays the REAL enhanced game out as a static site (game + vocab + game-suite
 * assets including the version-atomic audio runtime and voice clips) so
 * browsers can exercise the enhanced output without the app's entitlement
 * gate. Testing only — never deployed.
 *
 * The document comes from the SHIPPED enhanceCanonicalGameHtml(), not a local
 * re-implementation: a hand-built copy of the injection once drifted from the
 * real thing and certified a build production could not reproduce.
 *
 *   node scripts/build-mvh-voice-harness.mjs <outDir>
 */
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const outDir = process.argv[2];
if (!outDir) {
  console.error("usage: node scripts/build-mvh-voice-harness.mjs <outDir>");
  process.exit(1);
}

const { enhanceCanonicalGameHtml } = await import(
  pathToFileURL(join(root, "apps", "platform-web", "lib", "game-access", "canonical-runtime-enhancements.ts")).href
);

const html = enhanceCanonicalGameHtml(readFileSync(join(root, "docs", "index.html")));

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "index.html"), html);
cpSync(join(root, "docs", "vocab.js"), join(outDir, "vocab.js"));
cpSync(join(root, "apps", "platform-web", "public", "game-suite"), join(outDir, "game-suite"), { recursive: true });
console.log("harness built at", outDir);
