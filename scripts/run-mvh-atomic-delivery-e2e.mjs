/**
 * Version-atomic delivery certification for the Math Vocabulary Hunt audio
 * runtime — the returning-browser test.
 *
 * The server below simulates two deployments on ONE origin:
 *
 *   mode A — the legacy production architecture: the enhancer AS IT SHIPPED in
 *            the previous build (imported from git history, not re-implemented)
 *            injecting the two standalone modules under their stable names,
 *            served with a hostile one-year cache lifetime. This models the
 *            browser/proxy world where those files were pinned and never
 *            revalidated — the world that broke production ducking.
 *
 *   mode B — the current architecture: the shipped enhancer injecting the one
 *            content-hashed runtime.
 *
 * The spec loads A, keeps the SAME browser context (cache intact), flips the
 * server to B, and proves the new runtime is fetched and ducking works with no
 * cache clearing of any kind. Every request is logged so the assertions are
 * about what the browser actually fetched.
 *
 *   node scripts/run-mvh-atomic-delivery-e2e.mjs [--project chromium] ...
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
const port = 4198;
const LEGACY_REF = "ae71504";

const RUNTIME_CSP =
  "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
  "img-src data:; media-src 'self'; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'";
const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".webp": "image/webp"
};

const show = (path) => execFileSync("git", ["show", `${LEGACY_REF}:${path}`], { cwd: root, maxBuffer: 16e6 });

// The legacy enhancer exactly as it shipped, imported from history.
const legacyDir = mkdtempSync(join(tmpdir(), "mvh-legacy-"));
writeFileSync(join(legacyDir, "legacy-enhancer.ts"), show("apps/platform-web/lib/game-access/canonical-runtime-enhancements.ts"));
const { enhanceCanonicalGameHtml: legacyEnhance } = await import(pathToFileURL(join(legacyDir, "legacy-enhancer.ts")).href);
const { enhanceCanonicalGameHtml: currentEnhance } = await import(
  pathToFileURL(join(root, "apps", "platform-web", "lib", "game-access", "canonical-runtime-enhancements.ts")).href
);

const CANONICAL = readFileSync(join(root, "docs", "index.html"));
const VOCAB = readFileSync(join(root, "docs", "vocab.js"));
const DOC_A = legacyEnhance(CANONICAL);
const DOC_B = currentEnhance(CANONICAL);
const LEGACY_VOICE = show("apps/platform-web/public/game-suite/natural-voice.js");
const LEGACY_MUSIC = show("apps/platform-web/public/game-suite/math-vocabulary-music.js");

let mode = "A";
const requestLog = [];

const server = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);

  // Test-control surface (harness only, never shipped).
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

  requestLog.push({ mode, path: pathname });

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
  // The legacy standalone modules under their stable names: in mode A they are
  // the historical builds, pinned with a hostile one-year lifetime so the
  // browser will NOT revalidate them after the "redeploy".
  if (mode === "A" && pathname === "/game-suite/natural-voice.js") {
    response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "public, max-age=31536000" });
    response.end(LEGACY_VOICE);
    return;
  }
  if (mode === "A" && pathname === "/game-suite/math-vocabulary-music.js") {
    response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "public, max-age=31536000" });
    response.end(LEGACY_MUSIC);
    return;
  }
  try {
    const target = resolve(pub, "." + pathname);
    if (!target.startsWith(pub + sep)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    const info = statSync(target);
    const headers = {
      "Cache-Control": /mvh-audio-runtime\.[0-9a-f]{12}\.js$/.test(pathname)
        ? "public, max-age=31536000, immutable"
        : "public, max-age=0, must-revalidate",
      "Content-Length": info.size,
      "Content-Type": CONTENT_TYPES[extname(target).toLowerCase()] ?? "application/octet-stream"
    };
    response.writeHead(200, headers);
    createReadStream(target).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
  }
});

const requested = process.argv.filter((value, index) => process.argv[index - 1] === "--project");
const projects = requested.length ? requested : ["chromium"];

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`MVH atomic-delivery harness: http://127.0.0.1:${port} (mode A legacy / mode B atomic)\n`);
  const args = [join(root, "node_modules", "@playwright", "test", "cli.js"), "test", "--config", "playwright.mvh-atomic.config.mjs"];
  for (const project of projects) args.push("--project", project);
  const run = spawn(process.execPath, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, MVH_ATOMIC_URL: `http://127.0.0.1:${port}` }
  });
  run.on("exit", (code) => {
    server.close();
    process.exit(code ?? 1);
  });
});
