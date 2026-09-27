const ASSET_BASE = "/internal-games/math-tug-of-war/";

/**
 * Content hash of every runtime file under public/internal-games/math-tug-of-war
 * (sorted path + bytes, LF). It versions the entry URLs so a new deployment is
 * always fetched as a new module graph root. lib/games/math-tug-of-war/runtime.test.ts
 * recomputes it and fails if a runtime file changes without updating it
 * (`node scripts/math-tug-of-war-runtime-hash.mjs --write`).
 */
export const MATH_TUG_OF_WAR_RUNTIME_SHA256 = "a751ec22a8be85053c7af6aa7ee2a2b5234dd951ed9c20c5b48dbe910f9dd58b";

export function renderMathTugOfWarDocument(): string {
  const version = MATH_TUG_OF_WAR_RUNTIME_SHA256.slice(0, 16);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#10243e" />
    <meta name="description" content="Math Tug of War — solve the math, pull the rope, beat the other side. A MathNexa classroom game." />
    <meta name="robots" content="noindex, nofollow" />
    <base href="${ASSET_BASE}" />
    <title>Math Tug of War · MathNexa</title>
    <link rel="stylesheet" href="./styles.css?v=${version}" />
  </head>
  <body data-screen="home">
    <a class="skip-link" href="#main">Skip to game</a>
    <div id="app"></div>
    <div id="announcer" class="sr-only" aria-live="polite" aria-atomic="true"></div>
    <div id="alert-announcer" class="sr-only" aria-live="assertive" aria-atomic="true"></div>
    <noscript><p style="padding:24px;font:600 18px system-ui">Math Tug of War needs JavaScript. <a href="/games">Back to Math Games</a></p></noscript>
    <script type="module" src="./src/app.js?v=${version}"></script>
  </body>
</html>`;
}
