import { MVH_AUDIO_RUNTIME_FILE } from "./mvh-audio-runtime-manifest.mjs";

const STYLESHEET = '<link rel="stylesheet" href="/game-suite/canonical-runtime.css" data-mathnexa-game-suite="styles">';
const CREDIT = `<details class="mathnexa-music-credit" data-mathnexa-game-suite="credit">
  <summary>Credits</summary>
  <p>Music: “Cosmic Candy Catchers” by Eric Matyas — soundimage.org · CC BY 3.0</p>
</details>`;
// ONE version-atomic audio runtime (voice engine + music channel), injected
// under a content-hashed URL taken from the generated manifest. The two halves
// used to be separate scripts under stable names, and a browser or proxy
// holding a stale copy of just ONE of them executed a mismatched pair:
// pronunciation kept working while ducking silently died in production. A
// single content-addressed file removes that class of failure — one fetch,
// one generation, a new URL every build — so a cached older runtime can never
// satisfy a newer document.
//
// It must load in <head>, BEFORE the inline game script, so the game's
// speechSynthesis feature check finds the prebuilt-audio adapter, never the
// robotic browser voice. The music half defers itself to DOMContentLoaded,
// the moment its old end-of-body tag used to run.
const AUDIO_RUNTIME = `<script src="/game-suite/${MVH_AUDIO_RUNTIME_FILE}" data-mathnexa-game-suite="audio-runtime"></script>`;
// Math Vocabulary Hunt was the only game with no way back to MathNexa — a
// navigational dead end reached from the homepage's most prominent link. The
// injected link matches the other games' Back to Games affordance.
const BACK_LINK = '<a class="mathnexa-back-link" data-mathnexa-game-suite="back" href="/games"><span aria-hidden="true">←</span> Back to Games</a>';

export function enhanceCanonicalGameHtml(source: Buffer): Buffer {
  const html = source.toString("utf8");
  if (!html.includes("</head>") || !html.includes("</body>") || html.includes("data-mathnexa-game-suite")) {
    throw new Error("Canonical game enhancement markers are missing or duplicated.");
  }
  return Buffer.from(
    html
      .replace("</head>", `  ${STYLESHEET}\n  ${AUDIO_RUNTIME}\n</head>`)
      .replace(/<body([^>]*)>/, (match) => `${match}\n  ${BACK_LINK}`)
      .replace("</body>", `  ${CREDIT}\n</body>`),
    "utf8"
  );
}
