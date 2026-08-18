const ASSET_BASE = "/internal-games/number-logic/";
const RUNTIME_SHA256 = "1801220e5b7688626aaf926c7f023f3bc2d108d9f91bdb5426f142e9726fabda";
const RUNTIME_SRC = `./assets/index-DXexJzA-.js?v=${RUNTIME_SHA256}`;

export function renderNumberLogicDocument(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#3A119E" />
    <meta name="description" content="MathNexa Number Logic — place numbers, follow the relationships, and solve." />
    <meta name="robots" content="noindex, nofollow" />
    <base href="${ASSET_BASE}" />
    <title>Number Logic · MathNexa</title>
    <link rel="stylesheet" href="./integration.css" />
    <link rel="stylesheet" href="./assets/index-0S0ADVv9.css" />
  </head>
  <body>
    <a class="native-back-link" href="/games" aria-label="Back to MathNexa Games">← Back to Games</a>
    <div id="root"></div>
    <details class="native-music-credit">
      <summary>Credits</summary>
      <p>Music: “Cosmic Candy Catchers” by Eric Matyas — soundimage.org · CC BY 3.0</p>
    </details>
    <script type="module" src="${RUNTIME_SRC}"></script>
  </body>
</html>`;
}
