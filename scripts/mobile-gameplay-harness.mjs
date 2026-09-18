/**
 * Mobile gameplay harness — every MathNexa game document, exactly as a
 * learner's browser receives it, without the account/database stack.
 *
 * The game routes are protected by sign-in and entitlement, which makes them
 * expensive to reach from a layout test. Layout, however, depends only on the
 * served document, its stylesheets/scripts and the route CSP, so this harness
 * serves precisely those:
 *
 *   /game/runtime/index.html  Math Vocabulary Hunt — the SHIPPED enhancer
 *                             applied to the protected canonical document
 *                             (read-only), under the real runtime CSP.
 *   /games/crosscalc/play     CrossCalc (live catalog version 0.2.0)
 *   /games/number-cross/play  Number Cross
 *   /games/number-logic/play  Number Logic
 *   /games                    a stub landing page so "Back to Games" resolves
 *   everything else           apps/platform-web/public (internal-games,
 *                             game-suite runtime assets, media)
 *
 * The documents come from the shipped renderers (Node strips the TypeScript
 * annotations), and the headers are pinned to the production route code by
 * scripts/mobile-gameplay-harness.test.mjs, so the harness cannot drift into
 * a friendlier environment than production.
 *
 *   node scripts/mobile-gameplay-harness.mjs            # serve on :4195
 *   MOBILE_GAMEPLAY_PORT=4300 node scripts/mobile-gameplay-harness.mjs
 */
import { createReadStream, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const pub = join(root, "apps", "platform-web", "public");

/** Byte-for-byte the header from apps/platform-web/app/game/runtime/[...asset]/route.ts. */
export const MVH_RUNTIME_CSP =
  "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
  "img-src data:; media-src 'self'; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'";

/** The directive list from apps/platform-web/lib/games/internal-registry.ts. */
export function internalGameCsp(connectSource) {
  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self'",
    `connect-src ${connectSource}`,
    "frame-src 'none'",
    "child-src 'none'",
    "worker-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "manifest-src 'none'"
  ].join("; ");
}

export const GAME_ROUTES = Object.freeze({
  "math-vocabulary-hunt": "/game/runtime/index.html",
  "crosscalc": "/games/crosscalc/play",
  "number-cross": "/games/number-cross/play",
  "number-logic": "/games/number-logic/play"
});

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".webp": "image/webp",
  ".woff2": "font/woff2"
};

async function loadDocuments() {
  const load = (relative) => import(pathToFileURL(join(root, "apps", "platform-web", relative)).href);
  const [{ enhanceCanonicalGameHtml }, crosscalc, numberCross, numberLogic] = await Promise.all([
    load("lib/game-access/canonical-runtime-enhancements.ts"),
    load("features/games/crosscalc-v2/document.ts"),
    load("features/games/number-cross/document.ts"),
    load("features/games/number-logic/document.ts")
  ]);
  return {
    mvh: enhanceCanonicalGameHtml(readFileSync(join(root, "docs", "index.html"))),
    vocab: readFileSync(join(root, "docs", "vocab.js")),
    internal: {
      [GAME_ROUTES.crosscalc]: { html: crosscalc.renderCrossCalcV2Document(), connectSource: "'self'" },
      [GAME_ROUTES["number-cross"]]: { html: numberCross.renderNumberCrossDocument(), connectSource: "'none'" },
      [GAME_ROUTES["number-logic"]]: { html: numberLogic.renderNumberLogicDocument(), connectSource: "'self'" }
    }
  };
}

const GAMES_STUB = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Games · MathNexa (harness)</title></head><body><main><h1>MathNexa Games</h1><ul>${Object.entries(GAME_ROUTES).map(([key, href]) => `<li><a href="${href}">${key}</a></li>`).join("")}</ul></main></body></html>`;

export async function startMobileGameplayHarness(port = Number(process.env.MOBILE_GAMEPLAY_PORT ?? 4195)) {
  const documents = await loadDocuments();
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
    if (pathname === GAME_ROUTES["math-vocabulary-hunt"]) {
      response.writeHead(200, {
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": MVH_RUNTIME_CSP,
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer"
      });
      response.end(documents.mvh);
      return;
    }
    if (pathname === "/game/runtime/vocab.js") {
      response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store" });
      response.end(documents.vocab);
      return;
    }
    const internal = documents.internal[pathname];
    if (internal) {
      response.writeHead(200, {
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": internalGameCsp(internal.connectSource),
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer"
      });
      response.end(internal.html);
      return;
    }
    if (pathname === "/games" || pathname === "/games/") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      response.end(GAMES_STUB);
      return;
    }
    try {
      const target = resolve(pub, "." + pathname);
      if (!target.startsWith(pub + sep)) {
        response.writeHead(403).end("Forbidden");
        return;
      }
      const info = statSync(target);
      if (!info.isFile()) throw new Error("not a file");
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Length": info.size,
        "Content-Type": CONTENT_TYPES[extname(target).toLowerCase()] ?? "application/octet-stream"
      });
      createReadStream(target).pipe(response);
    } catch {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
    }
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, "127.0.0.1", resolveListen);
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const server = await startMobileGameplayHarness();
  const { port } = server.address();
  process.stdout.write(`Mobile gameplay harness on http://127.0.0.1:${port}\n`);
  for (const [key, route] of Object.entries(GAME_ROUTES)) process.stdout.write(`  ${key.padEnd(22)} http://127.0.0.1:${port}${route}\n`);
}
