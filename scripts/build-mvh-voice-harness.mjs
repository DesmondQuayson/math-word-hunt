/**
 * Local QA harness for the enhanced Math Vocabulary Hunt.
 *
 * Runs the REAL runtime enhancement over the canonical game and lays the
 * result out as a static site (game + vocab + game-suite assets incl. the
 * natural-voice engine and clips) so browsers can exercise the enhanced
 * output without the app's entitlement gate. Testing only — never deployed.
 *
 *   node scripts/build-mvh-voice-harness.mjs <outDir>
 */
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const outDir = process.argv[2];
if (!outDir) {
  console.error("usage: node scripts/build-mvh-voice-harness.mjs <outDir>");
  process.exit(1);
}

const STYLESHEET = '<link rel="stylesheet" href="/game-suite/canonical-runtime.css" data-mathnexa-game-suite="styles">';
const VOICE = '<script src="/game-suite/natural-voice.js" data-mathnexa-game-suite="voice"></script>';
const CREDIT = '<details class="mathnexa-music-credit" data-mathnexa-game-suite="credit"><summary>Credits</summary><p>Music credit</p></details>';
const SCRIPT = '<script src="/game-suite/math-vocabulary-music.js" data-mathnexa-game-suite="music"></script>';
const BACK = '<a class="mathnexa-back-link" data-mathnexa-game-suite="back" href="/games"><span aria-hidden="true">←</span> Back to Games</a>';

const html = readFileSync(join(root, "docs", "index.html"), "utf8")
  .replace("</head>", `  ${STYLESHEET}\n  ${VOICE}\n</head>`)
  .replace(/<body([^>]*)>/, (m) => `${m}\n  ${BACK}`)
  .replace("</body>", `  ${CREDIT}\n  ${SCRIPT}\n</body>`);

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "index.html"), html);
cpSync(join(root, "docs", "vocab.js"), join(outDir, "vocab.js"));
cpSync(join(root, "apps", "platform-web", "public", "game-suite"), join(outDir, "game-suite"), { recursive: true });
console.log("harness built at", outDir);
