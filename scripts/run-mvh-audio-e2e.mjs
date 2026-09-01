/**
 * Math Vocabulary Hunt audio-balance cross-browser certification.
 *
 * Builds the REAL enhanced game (canonical HTML + the shipped music and
 * natural-voice modules), serves it under the EXACT Content-Security-Policy the
 * production /game/runtime route sends, and drives it with Playwright so the
 * 50% music / 100% voice contract is proven in real browser audio stacks
 * rather than in a DOM double.
 *
 * The CSP replay is not optional: a CSP-less harness once passed while
 * connect-src 'none' silently blocked every voice lookup in production.
 *
 *   node scripts/run-mvh-audio-e2e.mjs [--project chromium] [--project webkit]
 */
import { execFileSync, spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const port = 4188;

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

const harness = mkdtempSync(join(tmpdir(), "mvh-audio-"));
execFileSync(process.execPath, [join(here, "build-mvh-voice-harness.mjs"), harness], { stdio: "inherit" });

// The background track lives outside the game-suite folder the harness copies.
execFileSync(
  process.execPath,
  [
    "-e",
    `const {cpSync,mkdirSync}=require("node:fs");mkdirSync(${JSON.stringify(join(harness, "media", "audio"))},{recursive:true});` +
      `cpSync(${JSON.stringify(join(root, "apps", "platform-web", "public", "media", "audio"))},${JSON.stringify(join(harness, "media", "audio"))},{recursive:true});`
  ],
  { stdio: "inherit" }
);

const server = createServer((request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
    let target = resolve(harness, "." + pathname);
    if (target !== harness && !target.startsWith(harness + sep)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    let info = statSync(target);
    if (info.isDirectory()) {
      target = resolve(target, "index.html");
      info = statSync(target);
    }
    const extension = extname(target).toLowerCase();
    const headers = {
      "Cache-Control": "no-store",
      "Content-Length": info.size,
      "Content-Type": CONTENT_TYPES[extension] ?? "application/octet-stream"
    };
    // The production route sends the policy on the game document itself.
    if (extension === ".html") headers["Content-Security-Policy"] = RUNTIME_CSP;
    response.writeHead(200, headers);
    createReadStream(target).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
  }
});

const requested = process.argv.filter((value, index) => process.argv[index - 1] === "--project");
const projects = requested.length ? requested : ["chromium", "webkit"];

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`MVH audio harness: http://127.0.0.1:${port} (CSP replayed)\n`);
  // The CLI entry is invoked directly: spawning npx.cmd fails with EINVAL on
  // Node 24 for Windows batch shims.
  const args = [join(root, "node_modules", "@playwright", "test", "cli.js"), "test", "--config", "playwright.mvh-audio.config.mjs"];
  for (const project of projects) args.push("--project", project);
  const run = spawn(process.execPath, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, MVH_AUDIO_HARNESS_URL: `http://127.0.0.1:${port}` }
  });
  run.on("exit", (code) => {
    server.close();
    rmSync(harness, { recursive: true, force: true });
    process.exit(code ?? 1);
  });
});
