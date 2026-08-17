const STYLESHEET = '<link rel="stylesheet" href="/game-suite/canonical-runtime.css" data-mathnexa-game-suite="styles">';
const CREDIT = `<details class="mathnexa-music-credit" data-mathnexa-game-suite="credit">
  <summary>Credits</summary>
  <p>Music: “Cosmic Candy Catchers” by Eric Matyas — soundimage.org · CC BY 3.0</p>
</details>`;
const SCRIPT = '<script src="/game-suite/math-vocabulary-music.js" data-mathnexa-game-suite="music"></script>';

export function enhanceCanonicalGameHtml(source: Buffer): Buffer {
  const html = source.toString("utf8");
  if (!html.includes("</head>") || !html.includes("</body>") || html.includes("data-mathnexa-game-suite")) {
    throw new Error("Canonical game enhancement markers are missing or duplicated.");
  }
  return Buffer.from(
    html
      .replace("</head>", `  ${STYLESHEET}\n</head>`)
      .replace("</body>", `  ${CREDIT}\n  ${SCRIPT}\n</body>`),
    "utf8"
  );
}
