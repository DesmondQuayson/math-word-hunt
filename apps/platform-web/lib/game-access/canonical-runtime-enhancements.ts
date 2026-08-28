const STYLESHEET = '<link rel="stylesheet" href="/game-suite/canonical-runtime.css" data-mathnexa-game-suite="styles">';
const CREDIT = `<details class="mathnexa-music-credit" data-mathnexa-game-suite="credit">
  <summary>Credits</summary>
  <p>Music: “Cosmic Candy Catchers” by Eric Matyas — soundimage.org · CC BY 3.0</p>
</details>`;
const SCRIPT = '<script src="/game-suite/math-vocabulary-music.js" data-mathnexa-game-suite="music"></script>';
// Natural-voice engine: must load BEFORE the inline game script so the game's
// speechSynthesis feature check finds the prebuilt-audio adapter, never the
// robotic browser voice.
const VOICE = '<script src="/game-suite/natural-voice.js" data-mathnexa-game-suite="voice"></script>';
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
      .replace("</head>", `  ${STYLESHEET}\n  ${VOICE}\n</head>`)
      .replace(/<body([^>]*)>/, (match) => `${match}\n  ${BACK_LINK}`)
      .replace("</body>", `  ${CREDIT}\n  ${SCRIPT}\n</body>`),
    "utf8"
  );
}
