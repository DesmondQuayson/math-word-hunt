const ASSET_BASE = "/internal-games/crosscalc-v2/";

export const CROSSCALC_V2_VERSION = "0.2.0" as const;
export const CROSSCALC_V2_APPROVED_SOURCE = "9d27dbc21fce043569fae89ab5b4434ae2d0bac0" as const;
export const CROSSCALC_V2_ADAPTER_SOURCE = "8bc4704" as const;

export function renderCrossCalcV2PreviewDocument(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#071525" />
    <meta name="description" content="MathNexa CrossCalc V2 owner preview — place numbers to prove every equation path." />
    <meta name="robots" content="noindex, nofollow, noarchive" />
    <base href="${ASSET_BASE}" />
    <title>CrossCalc V2 · NOT LIVE · MathNexa</title>
    <link rel="stylesheet" href="./integration.css" />
    <link rel="stylesheet" href="./assets/index-B-S_H4Ce.css" />
  </head>
  <body>
    <div class="native-preview-banner" role="status">
      <strong>CrossCalc</strong>
      <span>Preview Version 0.2.0</span>
      <b>NOT LIVE</b>
      <a href="/admin?section=games">Back to Admin Games</a>
    </div>
    <div id="root"></div>
    <script type="module" src="./assets/index-B0m_QJed.js"></script>
  </body>
</html>`;
}
