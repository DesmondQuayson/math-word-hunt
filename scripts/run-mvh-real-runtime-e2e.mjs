/**
 * Math Vocabulary Hunt REAL-RUNTIME certification.
 *
 * This exists because the earlier harness gave a false positive. That harness
 * hand-rebuilt the enhanced game document; this one calls the shipped
 * enhanceCanonicalGameHtml() and serves the result at the real route path,
 * under the real route CSP, with the real public/ assets. The canonical
 * document is consumed READ-ONLY -- it is a protected artifact.
 *
 * The spec it runs asserts the ACTUAL playing media element's volume, never a
 * hook that recomputes what the level ought to be.
 *
 *   node scripts/run-mvh-real-runtime-e2e.mjs [--project chromium] ...
 */
import { spawn } from "node:child_process";
import { createReadStream, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const pub = join(root, "apps", "platform-web", "public");
const port = 4194;

// Byte-for-byte the header from apps/platform-web/app/game/runtime/[...asset]/route.ts.
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

// The shipped enhancement, not a copy of it. Node strips the type annotations.
const { enhanceCanonicalGameHtml } = await import(
  new URL("../apps/platform-web/lib/game-access/canonical-runtime-enhancements.ts", import.meta.url).href
);
const ENHANCED = enhanceCanonicalGameHtml(readFileSync(join(root, "docs", "index.html")));
const VOCAB = readFileSync(join(root, "docs", "vocab.js"));

const server = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
  if (pathname === "/game/runtime/index.html") {
    response.writeHead(200, {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": RUNTIME_CSP,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer"
    });
    response.end(ENHANCED);
    return;
  }
  if (pathname === "/game/runtime/vocab.js") {
    response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store" });
    response.end(VOCAB);
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
      "Cache-Control": "no-store",
      "Content-Length": info.size,
      "Content-Type": CONTENT_TYPES[extname(target).toLowerCase()] ?? "application/octet-stream"
    });
    createReadStream(target).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
  }
});

const requested = process.argv.filter((value, index) => process.argv[index - 1] === "--project");
const projects = requested.length ? requested : ["chromium", "webkit"];

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`MVH real-runtime harness: http://127.0.0.1:${port}/game/runtime/index.html (real enhancer, real CSP)\n`);
  const args = [
    join(root, "node_modules", "@playwright", "test", "cli.js"),
    "test",
    "--config",
    "playwright.mvh-real-runtime.config.mjs"
  ];
  for (const project of projects) args.push("--project", project);
  const run = spawn(process.execPath, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, MVH_REAL_RUNTIME_URL: `http://127.0.0.1:${port}` }
  });
  run.on("exit", (code) => {
    server.close();
    process.exit(code ?? 1);
  });
});
