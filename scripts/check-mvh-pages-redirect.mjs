/**
 * BS-07B3: legacy Math Vocabulary Hunt GitHub Pages redirect — artifact and canonical-file check.
 *
 * Two contracts, both required before the GitHub Pages source of math-word-hunt is switched to the
 * dedicated `pages-redirect` branch:
 *
 *  1. `pages-redirect/` (the source of the dedicated Pages branch) is exactly index.html, a
 *     byte-identical 404.html and an empty .nojekyll: noindex/nofollow, canonical and a visible link
 *     to the constant destination https://mathnexa.com/games, a meta-refresh fallback, one inline
 *     script that never reads the pathname, query string or fragment, no external resource, no
 *     storage, no service worker, no legacy marketing.
 *  2. The canonical game document `docs/index.html` is byte-identical to the pinned runtime
 *     (sha256 7f00ed67…, 113,537 bytes). Retiring the PUBLIC copy must never touch the SOURCE file
 *     that production serves through /game/runtime.
 *
 * When a local `pages-redirect` branch exists, its tree must be exactly the three files with the
 * same blob ids as `pages-redirect/`, so what gets published is what was reviewed here.
 *
 * usage: node scripts/check-mvh-pages-redirect.mjs   (from the repository root; no dependencies)
 * Exits non-zero on any failure. Never publishes, never changes the Pages source.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const DIR = "pages-redirect";
const TARGET = "https://mathnexa.com/games";
const REQUIRED_FILES = ["index.html", "404.html", ".nojekyll"];
const CANONICAL = {
  path: "docs/index.html",
  blob: "ecb36ff387bff20a3dc9222aa62e37e172b690ec",
  sha256: "7f00ed6789a2faf23b90e96c3dfdee0167aced87beb08dabf10b89c3e72c9fc5",
  bytes: 113537,
};
const OBSOLETE_STRINGS = ["Classroom Beta", "Free to use", "ShowMe Math Lab", "math-word-hunt", "github.io", "word search", "Combine Mode"];
const FORBIDDEN_CODE = [
  /<script[^>]+src=/i,
  /localStorage|sessionStorage|indexedDB|document\.cookie|serviceWorker|navigator\.sendBeacon|fetch\(|XMLHttpRequest|WebSocket/,
  /location\.(pathname|search|hash|href)|URLSearchParams|window\.name|document\.referrer/,
  /<link[^>]+rel="manifest"/i,
  /<iframe|<embed|<object|<form/i,
];

const failures = [];
const fail = (message) => failures.push(message);
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

/* 1. The redirect artifact. */
if (!existsSync(DIR) || !statSync(DIR).isDirectory()) {
  console.error(`check-mvh-pages-redirect: ${DIR}/ not found (run from the repository root).`);
  process.exit(1);
}
const entries = readdirSync(DIR).sort();
for (const name of REQUIRED_FILES) if (!entries.includes(name)) fail(`missing ${DIR}/${name}`);
for (const name of entries) {
  if (!REQUIRED_FILES.includes(name)) fail(`unexpected file in ${DIR}/: ${name}`);
  if (statSync(join(DIR, name)).isDirectory()) fail(`unexpected directory in ${DIR}/: ${name}`);
}
if (existsSync(join(DIR, ".nojekyll")) && statSync(join(DIR, ".nojekyll")).size !== 0) fail(".nojekyll must be empty");
const index = existsSync(join(DIR, "index.html")) ? readFileSync(join(DIR, "index.html"), "utf8") : "";
const notFound = existsSync(join(DIR, "404.html")) ? readFileSync(join(DIR, "404.html"), "utf8") : "";
if (index !== notFound) fail("index.html and 404.html must be byte-identical");
if (Buffer.byteLength(index, "utf8") > 8192) fail("index.html exceeds 8 KB; this must stay a tiny stub");

const html = index;
const must = (pattern, message) => {
  if (!pattern.test(html)) fail(message);
};
must(/^<!doctype html>/i, "missing <!doctype html>");
must(/<html lang="en">/, 'missing <html lang="en">');
must(/<meta charset="utf-8"/i, "missing charset");
must(/<meta name="viewport"/, "missing viewport meta");
must(/<meta name="robots" content="noindex, nofollow"/, "missing noindex, nofollow robots meta");
must(new RegExp(`<link rel="canonical" href="${TARGET}"`), `canonical must be ${TARGET}`);
must(new RegExp(`<meta http-equiv="refresh" content="1; url=${TARGET}"`), "missing meta-refresh fallback to the destination");
must(/<title>[^<]+<\/title>/, "missing <title>");
must(/<main>[\s\S]*<h1>This standalone version has moved\.<\/h1>[\s\S]*<\/main>/, "missing the visible moved message inside <main>");
must(new RegExp(`<a href="${TARGET}">Continue to MathNexa Games</a>`), "missing the visible accessible link to MathNexa Games");
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
if (scripts.length !== 1) fail(`expected exactly one inline script, found ${scripts.length}`);
const script = scripts[0] ?? "";
if (!new RegExp(`var TARGET = "${TARGET}";`).test(script)) fail(`the destination must be the constant ${TARGET}`);
if (!/window\.location\.replace\(TARGET\)/.test(script)) fail("the redirect must be location.replace(TARGET) with the constant");
if ((script.match(/location\./g) ?? []).length !== 1) fail("only location.replace may be used (nothing may be read from the URL)");
for (const text of OBSOLETE_STRINGS) if (html.includes(text)) fail(`legacy wording present: "${text}"`);
for (const pattern of FORBIDDEN_CODE) if (pattern.test(html)) fail(`forbidden construct matches ${pattern}`);
for (const url of [...html.matchAll(/https?:\/\/[^"'\s)<]+/g)].map((m) => m[0])) {
  if (url !== TARGET) fail(`unexpected absolute URL: ${url}`);
}

/* 2. The canonical game document is untouched. The COMMITTED bytes are checked (git blob), because a
 *    Windows checkout with autocrlf rewrites the working copy to CRLF without changing the commit. */
if (!existsSync(CANONICAL.path)) {
  fail(`${CANONICAL.path} is missing`);
} else {
  const committed = spawnSync("git", ["show", `HEAD:${CANONICAL.path}`], { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 });
  if (committed.status !== 0) {
    fail(`cannot read HEAD:${CANONICAL.path} from git`);
  } else {
    const actual = sha256(committed.stdout);
    if (actual !== CANONICAL.sha256) fail(`HEAD:${CANONICAL.path} sha256 ${actual} != pinned ${CANONICAL.sha256}`);
    if (committed.stdout.length !== CANONICAL.bytes) fail(`HEAD:${CANONICAL.path} is ${committed.stdout.length} bytes, pinned ${CANONICAL.bytes}`);
  }
  const blob = spawnSync("git", ["rev-parse", `HEAD:${CANONICAL.path}`], { encoding: "utf8" }).stdout.trim();
  if (blob !== CANONICAL.blob) fail(`HEAD:${CANONICAL.path} blob ${blob} != pinned ${CANONICAL.blob}`);
  const dirty = spawnSync("git", ["diff", "--quiet", "HEAD", "--", CANONICAL.path]);
  if (dirty.status !== 0) fail(`${CANONICAL.path} has uncommitted modifications in the working tree`);
  const working = readFileSync(CANONICAL.path);
  const normalised = Buffer.from(working.toString("utf8").replace(/\r\n/g, "\n"), "utf8");
  if (sha256(normalised) !== CANONICAL.sha256) fail(`${CANONICAL.path} working copy (LF-normalised) sha256 ${sha256(normalised)} != pinned`);
}

/* 3. The dedicated Pages branch, when present locally, is exactly the reviewed artifact. */
const branch = spawnSync("git", ["ls-tree", "-r", "pages-redirect"], { encoding: "utf8" });
let branchNote = "local pages-redirect branch not present (skipped)";
if (branch.status === 0) {
  const rows = branch.stdout.trim().split("\n").filter(Boolean).map((line) => {
    const [meta, path] = line.split("\t");
    return { blob: meta.split(" ")[2], path };
  });
  const names = rows.map((r) => r.path).sort();
  if (names.join(",") !== [...REQUIRED_FILES].sort().join(",")) fail(`pages-redirect branch tree is [${names.join(", ")}], expected exactly [${REQUIRED_FILES.join(", ")}]`);
  for (const row of rows) {
    const local = spawnSync("git", ["hash-object", join(DIR, row.path)], { encoding: "utf8" }).stdout.trim();
    if (local !== row.blob) fail(`pages-redirect branch ${row.path} blob ${row.blob.slice(0, 12)} != ${DIR}/${row.path} blob ${local.slice(0, 12)}`);
  }
  branchNote = `local pages-redirect branch tree == ${DIR}/ (${rows.length} files, blobs identical)`;
}

if (failures.length > 0) {
  console.error("check-mvh-pages-redirect FAILED:");
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
console.log(
  `check-mvh-pages-redirect passed: ${DIR}/ = ${REQUIRED_FILES.join(", ")} (identical pages, noindex + canonical + meta-refresh + visible link, ` +
    `constant destination ${TARGET}, nothing read from the URL, no external resource); ${CANONICAL.path} sha256 ${CANONICAL.sha256.slice(0, 16)}… ` +
    `(${CANONICAL.bytes} bytes) untouched; ${branchNote}.`,
);
