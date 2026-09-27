const ASSET_BASE = "/internal-games/math-tug-of-war/";

/**
 * Content hash of every runtime file under public/internal-games/math-tug-of-war
 * (sorted path + bytes, LF). It versions the entry URLs so a new deployment is
 * always fetched as a new module graph root. lib/games/math-tug-of-war/runtime.test.ts
 * recomputes it and fails if a runtime file changes without updating it
 * (`node scripts/math-tug-of-war-runtime-hash.mjs --write`).
 */
export const MATH_TUG_OF_WAR_RUNTIME_SHA256 = "f84e8e5746e67013ae02276bd2eeac5f340ac1f363e5610f4faba92f050bc034";

// Asset URLs are absolute (no <base> element): the document then renders the
// same under the route CSP and under the platform-wide CSP, whichever a host
// applies (locally next.config headers win over route headers; on Vercel the
// route policy wins).
export function renderMathTugOfWarDocument(options: Readonly<{ mathGamesAccess?: boolean }> = {}): string {
  const version = MATH_TUG_OF_WAR_RUNTIME_SHA256.slice(0, 16);
  // Math Tug of War is free for any signed-in account. A player without the
  // Math Games subscription is taken back to Home, never to a subscription
  // screen; subscribers keep "Math Games".
  const exit = options.mathGamesAccess === false
    ? { href: "/", label: "Home" }
    : { href: "/games", label: "Math Games" };
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#10243e" />
    <meta name="description" content="Math Tug of War — solve the math, pull the rope, beat the other side. A MathNexa classroom game." />
    <meta name="robots" content="noindex, nofollow" />
    <title>Math Tug of War · MathNexa</title>
    <link rel="stylesheet" href="${ASSET_BASE}styles.css?v=${version}" />
  </head>
  <body data-screen="home" data-exit-href="${exit.href}" data-exit-label="${exit.label}">
    <a class="skip-link" href="#main">Skip to game</a>
    <div id="app"></div>
    <div id="announcer" class="sr-only" aria-live="polite" aria-atomic="true"></div>
    <div id="alert-announcer" class="sr-only" aria-live="assertive" aria-atomic="true"></div>
    <noscript><p style="padding:24px;font:600 18px system-ui">Math Tug of War needs JavaScript. <a href="/games">Back to Math Games</a></p></noscript>
    <script type="module" src="${ASSET_BASE}src/app.js?v=${version}"></script>
  </body>
</html>`;
}
