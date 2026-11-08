const ASSET_BASE = "/internal-games/polygon-showdown/";

/**
 * Content hash of every runtime file under public/internal-games/polygon-showdown
 * (sorted path + bytes, LF). It versions the entry URLs so a new deployment is
 * always fetched as a new module graph root. lib/games/polygon-showdown/document.test.ts
 * recomputes it and fails if a runtime file changes without updating it
 * (`node scripts/polygon-showdown-runtime-hash.mjs --write`).
 */
export const POLYGON_SHOWDOWN_RUNTIME_SHA256 = "33679a72551dc303b6e95901945090ece3f8c40402ed10947d7446475d223724";

type Role = "app" | "join";

function render(role: Role, options: Readonly<{ title: string; description: string; exitHref: string; exitLabel: string }>): string {
  const version = POLYGON_SHOWDOWN_RUNTIME_SHA256.slice(0, 16);
  const entry = role === "app" ? "app.js" : "join.js";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#071525" />
    <meta name="description" content="${options.description}" />
    <meta name="robots" content="noindex, nofollow" />
    <title>${options.title}</title>
    <link rel="icon" href="/icon.png" />
    <link rel="stylesheet" href="${ASSET_BASE}styles.css?v=${version}" />
  </head>
  <body class="polygon" data-role="${role}" data-screen="loading" data-exit-href="${options.exitHref}" data-exit-label="${options.exitLabel}">
    <a class="skip-link" href="#main">Skip to game</a>
    <div id="app" class="app"></div>
    <div id="announcer" class="sr-only" aria-live="polite" aria-atomic="true"></div>
    <div id="alert-announcer" class="sr-only" aria-live="assertive" aria-atomic="true"></div>
    <noscript><p class="noscript">Polygon Showdown needs JavaScript.</p></noscript>
    <script type="module" src="${ASSET_BASE}src/${entry}?v=${version}"></script>
  </body>
</html>`;
}

/** Landing, Solo, shop, avatar and Create Showdown, for a signed-in account. */
export function renderPolygonShowdownDocument(): string {
  return render("app", {
    title: "Polygon Showdown · MathNexa",
    description: "Match geometric shapes, build combos, earn coins, shop for avatar styles, or challenge friends in a live Showdown.",
    exitHref: "/",
    exitLabel: "MathNexa"
  });
}

/** A player's screen at /join once the code belongs to a Showdown. No account needed. */
export function renderPolygonShowdownJoinDocument(): string {
  return render("join", {
    title: "Join Polygon Showdown · MathNexa",
    description: "Join a Polygon Showdown with the code on the creator's screen.",
    exitHref: "/join",
    exitLabel: "Join another game"
  });
}
