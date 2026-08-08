const ASSET_BASE = "/internal-games/number-cross/";

export function renderNumberCrossDocument(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#10243e" />
    <meta name="description" content="Number Cross — a mathematical logic puzzle by MathNexa." />
    <meta name="robots" content="noindex, nofollow" />
    <base href="${ASSET_BASE}" />
    <title>Number Cross · MathNexa</title>
    <link rel="stylesheet" href="./styles.css" />
    <link rel="stylesheet" href="./integration.css" />
  </head>
  <body>
    <a class="skip-link" href="#main">Skip to game</a>
    <div id="app"></div>
    <div id="announcer" class="sr-only" aria-live="polite" aria-atomic="true"></div>
    <script type="module" src="./src/app.js"></script>
  </body>
</html>`;
}
