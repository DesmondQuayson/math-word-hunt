/**
 * BS-07B3: runs the EXACT inline script shipped in pages-redirect/index.html against hostile window
 * shapes and proves the destination is always the constant https://mathnexa.com/games, that nothing is
 * read from the URL, that 404.html is the same bytes, and that the canonical docs/index.html is untouched.
 *
 * usage: node --test scripts/mvh-pages-redirect.test.mjs   (from the repository root; no dependencies)
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const TARGET = "https://mathnexa.com/games";
const indexHtml = readFileSync("pages-redirect/index.html", "utf8");
const notFoundHtml = readFileSync("pages-redirect/404.html", "utf8");
const script = (() => {
  const scripts = [...indexHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.equal(scripts.length, 1, "exactly one inline script");
  return scripts[0];
})();

function runShippedScript(location) {
  const calls = [];
  const fakeWindow = { location: { ...location, replace: (url) => calls.push(url) } };
  new Function("window", script)(fakeWindow);
  return calls;
}

test("index.html and 404.html are byte-identical", () => {
  assert.equal(notFoundHtml, indexHtml);
});

for (const location of [
  { pathname: "/math-word-hunt/", search: "", hash: "" },
  { pathname: "/math-word-hunt/docs/", search: "", hash: "" },
  { pathname: "/math-word-hunt/docs/index.html", search: "", hash: "#combine" },
  { pathname: "/math-word-hunt/unknown/deep/path", search: "", hash: "" },
  { pathname: "/math-word-hunt/docs/", search: "?redirect=https://evil.example", hash: "" },
  { pathname: "/math-word-hunt/docs/", search: "?next=//evil.example&url=javascript:alert(1)", hash: "#https://evil.example" },
  { pathname: "//evil.example/x", search: "", hash: "" },
  { pathname: "/math-word-hunt/../../etc/passwd", search: "", hash: "" },
  { pathname: undefined, search: undefined, hash: undefined },
]) {
  test(`always replaces with the constant destination for ${JSON.stringify(location)}`, () => {
    const calls = runShippedScript(location);
    assert.deepEqual(calls, [TARGET]);
  });
}

test("the test hook exposes the same constant and prevents navigation", () => {
  const calls = [];
  const fakeWindow = { __MVH_REDIRECT_TEST__: true, location: { pathname: "/math-word-hunt/docs/", replace: (url) => calls.push(url) } };
  new Function("window", script)(fakeWindow);
  assert.deepEqual(calls, []);
  assert.equal(fakeWindow.__mvhRedirectTarget, TARGET);
});

test("never reads the pathname, query string, fragment, referrer or any storage", () => {
  assert.doesNotMatch(script, /location\.(pathname|search|hash|href)|URLSearchParams|document\.referrer|window\.name/);
  assert.doesNotMatch(script, /localStorage|sessionStorage|cookie|indexedDB|serviceWorker|fetch\(|XMLHttpRequest/);
  assert.match(script, /window\.location\.replace\(TARGET\)/);
  assert.equal((script.match(/location\./g) ?? []).length, 1);
});

test("is noindex, canonical to MathNexa Games, with a meta-refresh fallback and a visible link", () => {
  assert.match(indexHtml, /<meta name="robots" content="noindex, nofollow"/);
  assert.match(indexHtml, /<link rel="canonical" href="https:\/\/mathnexa\.com\/games"/);
  assert.match(indexHtml, /<meta http-equiv="refresh" content="1; url=https:\/\/mathnexa\.com\/games"/);
  assert.match(indexHtml, /<a href="https:\/\/mathnexa\.com\/games">Continue to MathNexa Games<\/a>/);
  assert.match(indexHtml, /<h1>This standalone version has moved\.<\/h1>/);
  assert.match(indexHtml, /<html lang="en">/);
});

test("carries no legacy marketing, no external resource and no other absolute URL", () => {
  for (const text of ["Classroom Beta", "Free to use", "ShowMe Math Lab", "github.io", "word search"]) assert.ok(!indexHtml.includes(text), text);
  assert.doesNotMatch(indexHtml, /<script[^>]+src=/);
  assert.doesNotMatch(indexHtml, /<link[^>]+rel="(stylesheet|manifest)"/);
  const urls = [...indexHtml.matchAll(/https?:\/\/[^"'\s)<]+/g)].map((m) => m[0]);
  assert.ok(urls.length > 0);
  for (const url of urls) assert.equal(url, TARGET);
});

test("the canonical game document docs/index.html is untouched (committed bytes and working copy)", () => {
  // Committed bytes: immune to the CRLF rewrite an autocrlf checkout applies to the working copy.
  const committed = spawnSync("git", ["show", "HEAD:docs/index.html"], { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 });
  assert.equal(committed.status, 0);
  assert.equal(createHash("sha256").update(committed.stdout).digest("hex"), "7f00ed6789a2faf23b90e96c3dfdee0167aced87beb08dabf10b89c3e72c9fc5");
  assert.equal(committed.stdout.length, 113537);
  assert.equal(spawnSync("git", ["rev-parse", "HEAD:docs/index.html"], { encoding: "utf8" }).stdout.trim(), "ecb36ff387bff20a3dc9222aa62e37e172b690ec");
  assert.equal(spawnSync("git", ["diff", "--quiet", "HEAD", "--", "docs/index.html"]).status, 0, "working tree differs from HEAD");
  const working = readFileSync("docs/index.html", "utf8").replace(/\r\n/g, "\n");
  assert.equal(createHash("sha256").update(Buffer.from(working, "utf8")).digest("hex"), "7f00ed6789a2faf23b90e96c3dfdee0167aced87beb08dabf10b89c3e72c9fc5");
});
