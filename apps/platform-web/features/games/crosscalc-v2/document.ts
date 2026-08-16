const ASSET_BASE = "/internal-games/crosscalc-v2/";

export const CROSSCALC_V2_VERSION = "0.2.0" as const;
export const CROSSCALC_V2_APPROVED_SOURCE = "9d27dbc21fce043569fae89ab5b4434ae2d0bac0" as const;
export const CROSSCALC_V2_ADAPTER_SOURCE = "8bc4704" as const;

function renderCrossCalcV2DocumentBody(previewState: "not-live" | "published" | "inspection" | null): string {
  const previewBanner = previewState === null ? `
    <a class="native-back-link" href="/games" aria-label="Back to MathNexa Games">← Back to Games</a>` : `
    <div class="native-preview-banner" role="status">
      <strong>CrossCalc</strong>
      <span>Admin Preview · Version 0.2.0</span>
      <b>${previewState === "published" ? "LIVE" : previewState === "not-live" ? "NOT LIVE" : "VERSION INSPECTION"}</b>
      <a href="/admin?section=games">Back to Admin Games</a>
    </div>`;
  const title = previewState === "not-live"
    ? "CrossCalc V2 · NOT LIVE · MathNexa"
    : previewState === "published"
      ? "CrossCalc V2 · LIVE · MathNexa"
      : previewState === "inspection"
        ? "CrossCalc V2 · ADMIN PREVIEW · MathNexa"
        : "CrossCalc · MathNexa";
  const description = previewState === null
    ? "MathNexa CrossCalc — place whole-number tiles to prove every connected equation."
    : "MathNexa CrossCalc V2 admin preview — place numbers to prove every equation path.";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#071525" />
    <meta name="description" content="${description}" />
    <meta name="robots" content="noindex, nofollow, noarchive" />
    <base href="${ASSET_BASE}" />
    <title>${title}</title>
    <link rel="stylesheet" href="./integration.css" />
    <link rel="stylesheet" href="./assets/index-B-S_H4Ce.css" />
  </head>
  <body>${previewBanner}
    <div id="root"></div>
    <script type="module" src="./assets/index-B0m_QJed.js"></script>
  </body>
</html>`;
}

export function renderCrossCalcV2Document(): string {
  return renderCrossCalcV2DocumentBody(null);
}

export function renderCrossCalcV2PreviewDocument(isPublished: boolean | null = null): string {
  return renderCrossCalcV2DocumentBody(isPublished === null ? "inspection" : isPublished ? "published" : "not-live");
}
