const ASSET_BASE = "/internal-games/crosscalc/";

export function renderCrossCalcDocument(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#071525" />
    <meta name="description" content="MathNexa CrossCalc — connect equations through shared digits." />
    <meta name="robots" content="noindex, nofollow" />
    <base href="${ASSET_BASE}" />
    <title>CrossCalc · MathNexa</title>
    <link rel="stylesheet" href="./integration.css" />
    <link rel="stylesheet" href="./assets/index-CUYr0coz.css" />
  </head>
  <body>
    <a class="native-back-link" href="/games" aria-label="Back to MathNexa Games">← Back to Games</a>
    <div id="root"></div>
    <script type="module" src="./assets/index-C7Zij5Bt.js"></script>
  </body>
</html>`;
}
