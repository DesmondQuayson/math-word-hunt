/**
 * Same-session relaunch certification for Math Vocabulary Hunt.
 *
 * Reproduces the owner's production scenario: a browser session born on an OLD
 * application generation, a deployment happening underneath it, and the game
 * relaunched through the normal UI in the SAME tab — no reload, no cache
 * clearing.
 *
 * One origin, two generations:
 *   mode A — the previous production world: the legacy enhancer imported from
 *            git history, its standalone audio modules pinned with a hostile
 *            one-year lifetime, and the historical /play redirect without a
 *            generation identity.
 *   mode B — the current world: the shipped enhancer (freshness guard +
 *            content-hashed atomic runtime) and the real generation-stamped
 *            launch redirect from lib/game-access/runtime-generation.
 *
 * The /games page and /play redirect are declared FIXTURES standing in for the
 * authenticated app chrome (which cannot run headlessly); the game documents,
 * enhancers, launch helper and audio assets are the real shipped code.
 *
 *   node scripts/run-mvh-session-e2e.mjs [--project chromium] ...
 */
import { execFileSync, spawn } from "node:child_process";
import { createReadStream, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const pub = join(root, "apps", "platform-web", "public");
const port = 4199;
const LEGACY_REF = "ae71504";

const RUNTIME_CSP =
  "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
  "img-src data:; media-src 'self'; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'";
const TYPES = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".webp": "image/webp"
};

const show = (path) => execFileSync("git", ["show", `${LEGACY_REF}:${path}`], { cwd: root, maxBuffer: 16e6 });
const legacyDir = mkdtempSync(join(tmpdir(), "mvh-session-"));
writeFileSync(join(legacyDir, "legacy-enhancer.ts"), show("apps/platform-web/lib/game-access/canonical-runtime-enhancements.ts"));
const { enhanceCanonicalGameHtml: legacyEnhance } = await import(pathToFileURL(join(legacyDir, "legacy-enhancer.ts")).href);
const { enhanceCanonicalGameHtml: currentEnhance } = await import(
  pathToFileURL(join(root, "apps", "platform-web", "lib", "game-access", "canonical-runtime-enhancements.ts")).href
);
const { gameLaunchHref } = await import(
  pathToFileURL(join(root, "apps", "platform-web", "lib", "game-access", "runtime-generation.ts")).href
);

const CANONICAL = readFileSync(join(root, "docs", "index.html"));
const VOCAB = readFileSync(join(root, "docs", "vocab.js"));
const DOC_A = legacyEnhance(CANONICAL);
const DOC_B = currentEnhance(CANONICAL);
const LEGACY_VOICE = show("apps/platform-web/public/game-suite/natural-voice.js");
const LEGACY_MUSIC = show("apps/platform-web/public/game-suite/math-vocabulary-music.js");

// FIXTURE app chrome: stands in for the authenticated /games page.
const GAMES_FIXTURE = [
  "<!doctype html><html><head><title>Games (fixture)</title></head><body>",
  '<h1>Games</h1><a id="launch" href="/play">Play Math Vocabulary Hunt</a>',
  "</body></html>"
].join("");

let mode = "A";
const requestLog = [];

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const pathname = decodeURIComponent(url.pathname);

  if (pathname === "/__control/mode/A" || pathname === "/__control/mode/B") {
    mode = pathname.endsWith("A") ? "A" : "B";
    response.writeHead(200).end(mode);
    return;
  }
  if (pathname === "/__control/log") {
    response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(requestLog));
    return;
  }
  if (pathname === "/__control/clearlog") {
    requestLog.length = 0;
    response.writeHead(200).end("ok");
    return;
  }

  requestLog.push({ mode, path: pathname, search: url.search });

  if (pathname === "/games") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    response.end(GAMES_FIXTURE);
    return;
  }
  if (pathname === "/play") {
    // Mode A replays the historical redirect; mode B uses the REAL helper.
    const destination = mode === "A" ? "/game/runtime/index.html" : gameLaunchHref();
    response.writeHead(307, { Location: destination, "Cache-Control": "no-store" });
    response.end();
    return;
  }
  if (pathname === "/game/runtime/index.html") {
    response.writeHead(200, {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": RUNTIME_CSP
    });
    response.end(mode === "A" ? DOC_A : DOC_B);
    return;
  }
  if (pathname === "/game/runtime/vocab.js") {
    response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store" });
    response.end(VOCAB);
    return;
  }
  if (mode === "A" && (pathname === "/game-suite/natural-voice.js" || pathname === "/game-suite/math-vocabulary-music.js")) {
    response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "public, max-age=31536000" });
    response.end(pathname.endsWith("natural-voice.js") ? LEGACY_VOICE : LEGACY_MUSIC);
    return;
  }
  try {
    const target = resolve(pub, "." + pathname);
    if (!target.startsWith(pub + sep)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    const info = statSync(target);
    response.writeHead(200, {
      "Cache-Control": /mvh-audio-runtime\.[0-9a-f]{12}\.js$/.test(pathname)
        ? "public, max-age=31536000, immutable"
        : "public, max-age=0, must-revalidate",
      "Content-Length": info.size,
      "Content-Type": TYPES[extname(target).toLowerCase()] ?? "application/octet-stream"
    });
    createReadStream(target).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
  }
});

const requested = process.argv.filter((value, index) => process.argv[index - 1] === "--project");
const projects = requested.length ? requested : ["chromium"];

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`MVH session harness: http://127.0.0.1:${port} (mode A legacy session / mode B current)\n`);
  const args = [join(root, "node_modules", "@playwright", "test", "cli.js"), "test", "--config", "playwright.mvh-session.config.mjs"];
  for (const project of projects) args.push("--project", project);
  const run = spawn(process.execPath, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, MVH_SESSION_URL: `http://127.0.0.1:${port}` }
  });
  run.on("exit", (code) => {
    server.close();
    process.exit(code ?? 1);
  });
});
