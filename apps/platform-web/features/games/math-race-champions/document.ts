const ASSET_BASE = "/internal-games/math-race-champions/";

/**
 * Content hash of every runtime file under public/internal-games/math-race-champions
 * (sorted path + bytes, LF). It versions the entry URLs so a new deployment is
 * always fetched as a new module graph root. lib/games/math-race-champions/document.test.ts
 * recomputes it and fails if a runtime file changes without updating it
 * (`node scripts/math-race-champions-runtime-hash.mjs --write`).
 */
export const MATH_RACE_CHAMPIONS_RUNTIME_SHA256 = "f5013745716640875bfd31d43ddd4d0ec7542081e3a4ee137f7be46b21faf623";

type Role = "app" | "join";

function render(role: Role, options: Readonly<{ title: string; description: string; exitHref: string; exitLabel: string }>): string {
  const version = MATH_RACE_CHAMPIONS_RUNTIME_SHA256.slice(0, 16);
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
  <body class="math-race" data-role="${role}" data-screen="loading" data-exit-href="${options.exitHref}" data-exit-label="${options.exitLabel}">
    <a class="skip-link" href="#main">Skip to game</a>
    <div id="app" class="app"></div>
    <div id="announcer" class="sr-only" aria-live="polite" aria-atomic="true"></div>
    <div id="alert-announcer" class="sr-only" aria-live="assertive" aria-atomic="true"></div>
    <noscript><p class="noscript">Math Race Champions needs JavaScript.</p></noscript>
    <script type="module" src="${ASSET_BASE}src/${entry}?v=${version}"></script>
  </body>
</html>`;
}

/** The hub and all three experiences, for a signed-in account or a school session. */
export function renderMathRaceChampionsDocument(): string {
  return render("app", {
    title: "Math Race Champions · MathNexa",
    description: "Race through mathematics challenges, compete on the classroom Smart Board, unlock 3D cars, and challenge friends online.",
    exitHref: "/",
    exitLabel: "MathNexa"
  });
}

/** A racer's screen at /join once the code belongs to an Online Race. No account needed. */
export function renderMathRaceChampionsJoinDocument(): string {
  return render("join", {
    title: "Join Math Race Champions · MathNexa",
    description: "Join an Online Race with the code on the creator's screen.",
    exitHref: "/join",
    exitLabel: "Join another game"
  });
}
