const ASSET_BASE = "/internal-games/math-bingo-live/";

/**
 * Content hash of every runtime file under public/internal-games/math-bingo-live
 * (sorted path + bytes, LF). It versions the entry URLs so a new deployment is
 * always fetched as a new module graph root. lib/games/math-bingo-live/document.test.ts
 * recomputes it and fails if a runtime file changes without updating it
 * (`node scripts/math-bingo-live-runtime-hash.mjs --write`).
 */
export const MATH_BINGO_LIVE_RUNTIME_SHA256 = "fdbf0e6a67d3e50a61ab3e45363184ab91b99d1cc60e8e1737c72a381a1eaeb1";

type Role = "host" | "player";

function render(role: Role, options: Readonly<{ title: string; description: string; exitHref: string; exitLabel: string }>): string {
  const version = MATH_BINGO_LIVE_RUNTIME_SHA256.slice(0, 16);
  const entry = role === "host" ? "host.js" : "player.js";
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
  <body class="bingo" data-role="${role}" data-screen="loading" data-exit-href="${options.exitHref}" data-exit-label="${options.exitLabel}">
    <a class="skip-link" href="#main">Skip to game</a>
    <div id="app" class="app"></div>
    <div id="announcer" class="sr-only" aria-live="polite" aria-atomic="true"></div>
    <div id="alert-announcer" class="sr-only" aria-live="assertive" aria-atomic="true"></div>
    <noscript><p class="noscript">Math Bingo Live needs JavaScript.</p></noscript>
    <script type="module" src="${ASSET_BASE}src/${entry}?v=${version}"></script>
  </body>
</html>`;
}

/** The teacher's screen: setup, lobby, live game, results. */
export function renderMathBingoLiveHostDocument(): string {
  return render("host", {
    title: "Math Bingo Live · Host · MathNexa",
    description: "Host Math Bingo Live: a live classroom math bingo game from MathNexa.",
    exitHref: "/",
    exitLabel: "MathNexa"
  });
}

/** The student's screen at /join: code, name, card. No account needed. */
export function renderMathBingoLivePlayerDocument(): string {
  return render("player", {
    title: "Join Math Bingo Live · MathNexa",
    description: "Join a Math Bingo Live game with the code on your teacher's screen.",
    exitHref: "/join",
    exitLabel: "Join another game"
  });
}
