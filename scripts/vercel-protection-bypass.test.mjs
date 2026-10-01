// Proves scripts/vercel-protection-bypass.mjs keeps the Vercel protection-bypass
// secret on the trusted origin. A local "protected deployment" (127.0.0.1)
// behaves like Vercel: it serves only requests that carry the bypass header or
// the bypass cookie it sets on request. A "foreign" host (localhost - a
// different host, since cookies ignore ports) records everything it receives.
// Real Chromium and WebKit pages load subresources and fetches from the foreign
// host, follow a same-host redirect and an off-origin redirect, and make API
// requests; the secret and the bypass cookie must never reach the foreign host,
// no URL may contain the secret, and the protected pages must still load.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { after, before, describe, it } from "node:test";

import playwright from "@playwright/test";

import { PROTECTION_BYPASS_HEADER, SET_BYPASS_COOKIE_HEADER, SKIP_TOOLBAR_HEADER, createProtectionBypass } from "./vercel-protection-bypass.mjs";

const secret = `bypass_${randomBytes(24).toString("hex")}`;
const cookieToken = `jwt_${randomBytes(16).toString("hex")}`;
const seen = { trusted: [], foreign: [] };
let trustedOrigin;
let foreignOrigin;
const servers = [];

function listen(handler) {
  return new Promise((resolve) => {
    const server = createServer(handler);
    servers.push(server);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}
function record(list, request) {
  list.push({ url: request.url, headers: { ...request.headers } });
}

before(async () => {
  const foreignPort = await listen((request, response) => {
    record(seen.foreign, request);
    response.writeHead(200, { "content-type": request.url.startsWith("/script") ? "text/javascript" : "text/plain", "access-control-allow-origin": "*" });
    response.end(request.url.startsWith("/script") ? "window.foreignScriptRan = true;" : "foreign");
  });
  foreignOrigin = `http://localhost:${foreignPort}`;
  const trustedPort = await listen((request, response) => {
    record(seen.trusted, request);
    const viaHeader = request.headers[PROTECTION_BYPASS_HEADER] === secret;
    const viaCookie = (request.headers.cookie ?? "").split(/;\s*/).includes(`_vercel_jwt=${cookieToken}`);
    if (!viaHeader && !viaCookie) {
      response.writeHead(401, { "content-type": "text/plain" });
      response.end("protected deployment");
      return;
    }
    const headers = {};
    if (viaHeader && request.headers[SET_BYPASS_COOKIE_HEADER] === "true") headers["set-cookie"] = `_vercel_jwt=${cookieToken}; Path=/; HttpOnly; SameSite=Lax`;
    if (viaHeader && request.headers[SET_BYPASS_COOKIE_HEADER] === "true") {
      // Like Vercel: set the bypass cookie and send the client back to the same URL.
      response.writeHead(307, { ...headers, location: request.url });
      response.end();
    } else if (request.url === "/redirect-foreign") {
      response.writeHead(302, { ...headers, location: `${foreignOrigin}/landing` });
      response.end();
    } else if (request.url === "/redirect-same") {
      response.writeHead(302, { ...headers, location: "/ok" });
      response.end();
    } else if (request.url === "/") {
      response.writeHead(200, { ...headers, "content-type": "text/html" });
      response.end(`<!doctype html><title>protected</title><h1>protected page</h1>
        <img src="${foreignOrigin}/pixel.png" alt="">
        <script src="${foreignOrigin}/script.js"></script>
        <script>fetch("${foreignOrigin}/api/data").then(() => { document.body.dataset.fetched = "yes"; });</script>`);
    } else {
      response.writeHead(200, { ...headers, "content-type": "text/plain" });
      response.end("ok");
    }
  });
  trustedOrigin = `http://127.0.0.1:${trustedPort}`;
});
after(() => Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve)))));

describe("headersFor and redact", () => {
  it("adds the bypass only for the exact trusted origin", () => {
    const bypass = createProtectionBypass({ origin: "https://staging-abc.vercel.app", secret });
    assert.equal(bypass.headersFor("https://staging-abc.vercel.app/quizzes")[PROTECTION_BYPASS_HEADER], secret);
    for (const url of [
      "https://showme.mathnexa.com/worksheets",
      "https://staging-abc.vercel.app.evil.example/",
      "http://staging-abc.vercel.app/",
      "https://staging-abc.vercel.app:8443/",
      "https://abc.supabase.co/rest/v1/x",
      "not a url"
    ]) {
      assert.deepEqual(bypass.headersFor(url), {}, url);
    }
    assert.deepEqual(createProtectionBypass({ origin: "https://staging-abc.vercel.app", secret: null }).headersFor("https://staging-abc.vercel.app/"), {});
  });
  it("redacts the secret from any text", () => {
    const bypass = createProtectionBypass({ origin: "https://staging-abc.vercel.app", secret });
    const redacted = bypass.redact(`Error: navigation to https://x/?q=${secret} failed (${secret})`);
    assert.ok(!redacted.includes(secret));
    assert.ok(redacted.includes("[bypass-secret]"));
  });
});

for (const engineName of ["chromium", "webkit"]) {
  describe(`${engineName}: the secret stays on the trusted origin`, () => {
    it("loads protected pages, follows redirects and never leaks the secret", async () => {
      seen.trusted.length = 0;
      seen.foreign.length = 0;
      const browser = await playwright[engineName].launch();
      const urls = [];
      try {
        const context = await browser.newContext();
        const bypass = createProtectionBypass({ origin: trustedOrigin, secret });
        await bypass.install(context);
        const page = await context.newPage();
        page.on("request", (request) => urls.push(request.url()));

        const home = await page.goto(`${trustedOrigin}/`, { waitUntil: "networkidle" });
        assert.equal(home.status(), 200, "the protected page loads through the bypass");
        await page.waitForFunction(() => document.body.dataset.fetched === "yes" && window.foreignScriptRan === true);

        const sameHost = await page.goto(`${trustedOrigin}/redirect-same`);
        assert.equal(sameHost.status(), 200, "a same-host redirect is carried by the bypass cookie");
        assert.equal(await page.textContent("body"), "ok");

        const offOrigin = await page.goto(`${trustedOrigin}/redirect-foreign`);
        assert.equal(new URL(page.url()).origin, foreignOrigin, "the off-origin redirect is followed");
        assert.equal(offOrigin.status(), 200);

        const api = await context.request.get(`${trustedOrigin}/api/data`);
        assert.equal(api.status(), 200, "context API requests pass with the host-only cookie");
        const apiRedirect = await context.request.get(`${trustedOrigin}/redirect-foreign`);
        assert.equal(apiRedirect.status(), 200);
        await context.close();
      } finally {
        await browser.close();
      }

      assert.ok(seen.foreign.length >= 5, `the foreign host was exercised (${seen.foreign.length} requests)`);
      for (const request of seen.foreign) {
        const dump = JSON.stringify(request);
        assert.ok(!dump.includes(secret), `foreign request ${request.url} carried the secret`);
        assert.ok(!(PROTECTION_BYPASS_HEADER in request.headers), `foreign request ${request.url} carried the bypass header`);
        assert.ok(!dump.includes(cookieToken), `foreign request ${request.url} carried the bypass cookie`);
      }
      for (const url of [...urls, ...seen.trusted.map((r) => r.url), ...seen.foreign.map((r) => r.url)]) {
        assert.ok(!url.includes(secret), `a URL contained the secret: ${url}`);
      }
      const withSecret = seen.trusted.filter((r) => JSON.stringify(r).includes(secret));
      assert.equal(withSecret.length, 1, "the secret is sent exactly once per browser context");
      assert.equal(withSecret[0].url, "/api/health", "only to the redirect-free bootstrap request");
      assert.equal(withSecret[0].headers[SET_BYPASS_COOKIE_HEADER], "true");
      assert.ok(seen.trusted.filter((r) => r.url === "/api/health").length >= 2, "the cookie is verified with a second, secret-free request");
      assert.ok(seen.trusted.filter((r) => r.url === "/").every((r) => r.headers[SKIP_TOOLBAR_HEADER] === "1"), "pages on the review origin get the toolbar opt-out");
      // The non-secret toolbar opt-out is the only added header that can reach another host, and only
      // because the browser replays route-added headers on a redirect hop (the off-origin redirect here).
      for (const request of seen.foreign) {
        if (SKIP_TOOLBAR_HEADER in request.headers) assert.equal(request.url, "/landing", `unexpected toolbar header on ${request.url}`);
      }
    });
  });
}

describe("a refused bypass fails loudly", () => {
  it("throws when the deployment refuses the secret", async () => {
    const browser = await playwright.chromium.launch();
    try {
      const context = await browser.newContext();
      const wrong = createProtectionBypass({ origin: trustedOrigin, secret: `wrong_${randomBytes(12).toString("hex")}` });
      await assert.rejects(wrong.install(context), /protection bypass was refused/);
    } finally {
      await browser.close();
    }
  });
});

describe("the staging quiz review uses the confined bypass", () => {
  const source = readFileSync(new URL("./review-quiz-pdfs-staging.mjs", import.meta.url), "utf8");
  it("never puts the secret in a URL or in context-wide headers", () => {
    assert.ok(!/extraHTTPHeaders[^\n]*x-vercel-protection-bypass/.test(source), "no context-wide bypass header");
    assert.ok(!/[?&]x-vercel-protection-bypass=/.test(source), "no bypass query parameter");
    assert.ok(!/x-vercel-protection-bypass=\$\{/.test(source), "no bypass value interpolated into a URL");
  });
  it("installs the confined bypass on every browser context and redacts its logs", () => {
    assert.ok(source.includes('import { createProtectionBypass } from "./vercel-protection-bypass.mjs";'));
    assert.ok(source.includes("const bypass = createProtectionBypass({ origin, secret: bypassSecret });"));
    assert.ok(source.includes("await bypass.install(context);"));
    assert.ok(/const note = \(message\) => \{ const safe = bypass\.redact\(message\);/.test(source), "notes are redacted");
    assert.equal((source.match(/engine\.newContext\(/g) ?? []).length, 1, "every context is created through open()");
  });
});
