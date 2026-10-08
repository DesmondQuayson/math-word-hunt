// Proves scripts/vercel-protection-bypass.mjs keeps the Vercel protection-bypass
// secret on the trusted origin. A local "protected deployment" (127.0.0.1)
// behaves like Vercel: it serves only requests that carry the bypass header or
// the bypass cookie it sets on request. A "foreign" host (localhost - a
// different host, since cookies ignore ports) records everything it receives.
// Real Chromium and WebKit pages load subresources and fetches from the foreign
// host, follow a same-host redirect and an off-origin redirect, and make API
// requests; the secret and the bypass cookie must never reach the foreign host,
// no URL may contain the secret, and the protected pages must still load -
// through the host-only cookie alone, with no header added to any browser
// request (no request interception, no context-wide header). A third "gated"
// deployment adds an app-level gate in front of every route, like the locked
// MathNexa staging alias, for install()'s unlock step. Static guards then hold
// every script that uses the bypass to the same confinement.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { after, before, describe, it } from "node:test";

import playwright from "@playwright/test";

import { PROTECTION_BYPASS_HEADER, SET_BYPASS_COOKIE_HEADER, SKIP_TOOLBAR_HEADER, createProtectionBypass } from "./vercel-protection-bypass.mjs";

const secret = `bypass_${randomBytes(24).toString("hex")}`;
const cookieToken = `jwt_${randomBytes(16).toString("hex")}`;
const gateToken = `gate_${randomBytes(16).toString("hex")}`;
const seen = { trusted: [], foreign: [], gated: [] };
let trustedOrigin;
let foreignOrigin;
let gatedOrigin;
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
  // Like the locked MathNexa staging alias: Vercel's protection first, then an
  // app gate that answers 404 for every route until its own cookie is set by
  // POST /unlock with the gate token.
  const gatedPort = await listen((request, response) => {
    record(seen.gated, request);
    const viaHeader = request.headers[PROTECTION_BYPASS_HEADER] === secret;
    const cookies = (request.headers.cookie ?? "").split(/;\s*/);
    if (!viaHeader && !cookies.includes(`_vercel_jwt=${cookieToken}`)) {
      response.writeHead(401, { "content-type": "text/plain" });
      response.end("protected deployment");
    } else if (viaHeader && request.headers[SET_BYPASS_COOKIE_HEADER] === "true") {
      response.writeHead(307, { "set-cookie": `_vercel_jwt=${cookieToken}; Path=/; HttpOnly; SameSite=Lax`, location: request.url });
      response.end();
    } else if (request.url === "/unlock" && request.method === "POST" && request.headers.authorization === `Bearer ${gateToken}`) {
      response.writeHead(204, { "set-cookie": "gate=open; Path=/; HttpOnly; SameSite=Lax" });
      response.end();
    } else if (!cookies.includes("gate=open")) {
      response.writeHead(404, { "cache-control": "no-store" });
      response.end();
    } else {
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("ok");
    }
  });
  gatedOrigin = `http://127.0.0.1:${gatedPort}`;
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
      // The protected page is reached through the host-only cookie alone.
      const pages = seen.trusted.filter((r) => r.url === "/");
      assert.ok(pages.length >= 1, "the protected page was requested");
      for (const request of pages) {
        assert.ok((request.headers.cookie ?? "").split(/;\s*/).includes(`_vercel_jwt=${cookieToken}`), "the page request carries the bypass cookie");
        assert.ok(!(PROTECTION_BYPASS_HEADER in request.headers), "the page request carries no bypass header");
      }
      // Nothing is added to browser traffic: the only request with any added header is the bootstrap.
      const withAddedHeader = [...seen.trusted, ...seen.foreign].filter((r) => SKIP_TOOLBAR_HEADER in r.headers || SET_BYPASS_COOKIE_HEADER in r.headers || PROTECTION_BYPASS_HEADER in r.headers);
      assert.deepEqual(withAddedHeader, withSecret, "no browser request is re-routed or given an extra header");
      // The off-origin redirect target got nothing: no secret, no bypass cookie, no added header.
      const landing = seen.foreign.filter((r) => r.url === "/landing");
      assert.ok(landing.length >= 2, "both off-origin redirects (page and API) reached the other host");
      for (const request of landing) {
        assert.ok(!JSON.stringify(request).includes(secret) && !JSON.stringify(request).includes(cookieToken), "the redirect target received neither the secret nor the cookie");
      }
    });
  });
}

describe("the cookie is what opens the review origin", () => {
  it("refuses a context that did not install the bypass", async () => {
    const browser = await playwright.chromium.launch();
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      const response = await page.goto(`${trustedOrigin}/`);
      assert.equal(response.status(), 401, "without the cookie the protected deployment refuses the page");
    } finally {
      await browser.close();
    }
  });
});

describe("an origin behind an app-level gate", () => {
  const unlockGate = async (context) => {
    const response = await context.request.post(`${gatedOrigin}/unlock`, { headers: { Authorization: `Bearer ${gateToken}` }, maxRedirects: 0 });
    assert.equal(response.status(), 204, "the app gate opened");
  };
  it("is refused as an app-level gate without unlock", async () => {
    const browser = await playwright.chromium.launch();
    try {
      const context = await browser.newContext();
      const bypass = createProtectionBypass({ origin: gatedOrigin, secret });
      await assert.rejects(bypass.install(context), /answered 404 for \/api\/health behind the bypass \(an app-level gate/);
    } finally {
      await browser.close();
    }
  });
  it("opens with unlock on the bypass cookie alone and still sends the secret once", async () => {
    seen.gated.length = 0;
    const browser = await playwright.chromium.launch();
    try {
      const context = await browser.newContext();
      const bypass = createProtectionBypass({ origin: gatedOrigin, secret });
      await bypass.install(context, { unlock: unlockGate });
      const page = await context.newPage();
      const home = await page.goto(`${gatedOrigin}/`);
      assert.equal(home.status(), 200, "the gated page loads through both cookies");
    } finally {
      await browser.close();
    }
    const withSecret = seen.gated.filter((r) => JSON.stringify(r).includes(secret));
    assert.equal(withSecret.length, 1, "the secret is sent exactly once per browser context");
    assert.equal(withSecret[0].url, "/api/health");
    assert.deepEqual(seen.gated.slice(0, 4).map((r) => r.url), ["/api/health", "/unlock", "/api/health", "/"], "bootstrap, unlock, secret-free verification, page");
    const unlock = seen.gated.find((r) => r.url === "/unlock");
    assert.ok(unlock.headers.cookie.split(/;\s*/).includes(`_vercel_jwt=${cookieToken}`), "unlock rides on the bypass cookie");
    assert.ok(!(PROTECTION_BYPASS_HEADER in unlock.headers) && !(SKIP_TOOLBAR_HEADER in unlock.headers), "unlock carries no bypass header");
  });
  it("survives a sign-out that restores the cookies captured in unlock, without resending the secret", async () => {
    // The pattern of the phase 9B/10 staging runners' sign-out.
    seen.gated.length = 0;
    const browser = await playwright.chromium.launch();
    try {
      const context = await browser.newContext();
      let protectionCookies = [];
      await createProtectionBypass({ origin: gatedOrigin, secret }).install(context, {
        unlock: async (unlocked) => {
          protectionCookies = await unlocked.cookies();
          await unlockGate(unlocked);
        }
      });
      assert.deepEqual(protectionCookies.map((cookie) => cookie.name), ["_vercel_jwt"], "only the bypass cookie is captured");
      await context.clearCookies();
      await context.addCookies(protectionCookies);
      const page = await context.newPage();
      assert.equal((await page.goto(`${gatedOrigin}/`)).status(), 404, "signed out of the app gate, still past Vercel's protection");
      await unlockGate(context);
      assert.equal((await page.goto(`${gatedOrigin}/`)).status(), 200, "the gate re-opens on the restored bypass cookie");
    } finally {
      await browser.close();
    }
    assert.equal(seen.gated.filter((r) => JSON.stringify(r).includes(secret)).length, 1, "the secret was still sent only once");
  });
  it("still runs unlock when no secret is configured", async () => {
    let unlocked = 0;
    await createProtectionBypass({ origin: gatedOrigin, secret: null }).install({}, { unlock: async () => { unlocked += 1; } });
    assert.equal(unlocked, 1);
  });
});

describe("the module never touches browser traffic", () => {
  const source = readFileSync(new URL("./vercel-protection-bypass.mjs", import.meta.url), "utf8");
  const code = source.split("\n").filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*")).join("\n");
  it("installs no request interception and no context-wide header", () => {
    assert.ok(!/\.route\(/.test(code), "no context.route() / page.route()");
    assert.ok(!/extraHTTPHeaders|setExtraHTTPHeaders/.test(code), "no context-wide headers");
    assert.ok(!/\.goto\(/.test(code), "no navigation (a URL could carry the secret)");
    assert.ok(/maxRedirects: 0/.test(code), "the bootstrap request never follows a redirect");
  });
});

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

describe("the staging Math Tug of War review uses the confined bypass", () => {
  const source = readFileSync(new URL("./review-math-tug-of-war-staging.mjs", import.meta.url), "utf8");
  it("never puts the secret in a URL or in context-wide headers", () => {
    assert.ok(!/extraHTTPHeaders/.test(source), "no context-wide headers at all");
    assert.ok(!/[?&]x-vercel-protection-bypass=/.test(source), "no bypass query parameter");
    assert.ok(!/x-vercel-protection-bypass=\$\{/.test(source), "no bypass value interpolated into a URL");
    assert.ok(!/"x-vercel-protection-bypass"/.test(source), "the header is only ever built by the module");
  });
  it("installs the confined bypass on every browser context and redacts its output", () => {
    assert.ok(source.includes('import { createProtectionBypass } from "./vercel-protection-bypass.mjs";'));
    assert.ok(source.includes("const protection = createProtectionBypass({ origin, secret: bypass });"));
    assert.ok(source.includes("await protection.install(context);"));
    assert.ok(source.includes("const redact = (text) => protection.redact(text);"), "every note is redacted");
    assert.equal((source.match(/engine\.newContext\(/g) ?? []).length, 1, "every context is created through newContext()");
    assert.ok(/headers: protection\.headersFor\([^)]*\), redirect: "manual"/.test(source), "the direct health probe neither leaks nor follows redirects");
  });
});

// The source text of every call that starts with `pattern` (e.g. fetch( ), found
// by matching parentheses outside quoted strings. Template-literal text is
// scanned as code, which is enough here: the URLs and bodies in these scripts
// hold only balanced parentheses.
function calls(source, pattern) {
  const found = [];
  for (const match of source.matchAll(pattern)) {
    let depth = 0;
    let quote = null;
    for (let index = match.index + match[0].length - 1; index < source.length; index += 1) {
      const character = source[index];
      if (quote) {
        if (character === "\\") index += 1;
        else if (character === quote) quote = null;
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === "(") {
        depth += 1;
      } else if (character === ")" && --depth === 0) {
        found.push({ start: match.index, end: index + 1, text: source.slice(match.index, index + 1) });
        break;
      }
    }
  }
  return found;
}

// The hosted staging runners and the admin-session probe used to send the
// secret context-wide (extraHTTPHeaders) or on every direct request. Each must
// now build the header only through the module, intercept nothing, install the
// confined bypass on every browser context, never follow a redirect with the
// header, and print only redacted text.
const UNCAUGHT_REDACTED = /await main\(\)\.catch\(\(error\) => \{\s*process\.stderr\.write\(`\$\{redact\(/;
for (const { file, contexts, failure } of [
  { file: "probe-admin-session.mjs", contexts: 0, failure: /process\.on\("uncaughtException", \(error\) => \{\s*process\.stderr\.write\(`\$\{redact\(/ },
  { file: "run-phase8-content-staging.mjs", contexts: 1, failure: UNCAUGHT_REDACTED },
  { file: "run-phase9b-hosted-staging.mjs", contexts: 1, failure: UNCAUGHT_REDACTED },
  { file: "run-phase10-hosted-staging.mjs", contexts: 1, failure: /catch\(error\)\{process\.stderr\.write\(`\$\{redact\(/ },
  { file: "run-subscription-lifecycle-staging.mjs", contexts: 1, failure: /console\.error\(`FAILED \$\{redact\(/ }
]) {
  describe(`${file} uses the confined bypass`, () => {
    const source = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
    const code = source.split("\n").filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*")).join("\n");
    it("never puts the secret in a URL, in context-wide headers or in its own header literal", () => {
      assert.ok(!/extraHTTPHeaders|setExtraHTTPHeaders/.test(source), "no context-wide headers at all");
      assert.ok(!/[?&]x-vercel-protection-bypass=/.test(source), "no bypass query parameter");
      assert.ok(!/x-vercel-protection-bypass=\$\{/.test(source), "no bypass value interpolated into a URL");
      assert.ok(!/["'`]x-vercel-protection-bypass["'`]/.test(source), "the header is only ever built by the module");
      assert.ok(!/\.route\(/.test(code), "no request interception (it stalled Chromium on protected previews)");
    });
    it("reaches the origin only through the module and never follows a redirect with the header", () => {
      assert.ok(source.includes('import { createProtectionBypass } from "./vercel-protection-bypass.mjs";'), "imports the module");
      assert.equal((source.match(/\.newContext\(/g) ?? []).length, contexts, "browser contexts");
      assert.equal((source.match(/\bprotection\.install\(context\b/g) ?? []).length, contexts, "every browser context installs the confined bypass");
      const fetches = calls(source, /(?<![\w.])fetch\(/g);
      const uses = [...source.matchAll(/\.headersFor\(/g)];
      assert.ok(uses.length > 0, "direct requests take their header from headersFor()");
      for (const use of uses) {
        const call = fetches.find((candidate) => candidate.start < use.index && use.index < candidate.end);
        assert.ok(call, `headersFor() at offset ${use.index} is used outside a fetch() call`);
        assert.match(call.text, /redirect:\s*"manual"/, `a fetch() carrying the header follows redirects: ${call.text.slice(0, 120)}`);
      }
      for (const post of calls(source, /\.request\.post\(/g).filter((candidate) => candidate.text.includes("staging-access/bootstrap"))) {
        assert.match(post.text, /maxRedirects:\s*0/, "the staging-gate bootstrap never follows a redirect");
      }
      const clears = (code.match(/clearCookies\(\)/g) ?? []).length;
      assert.equal((code.match(/clearCookies\(\);\s*await context\.addCookies\(protectionCookies\)/g) ?? []).length, clears, "clearing cookies keeps the bypass cookie instead of re-sending the secret");
    });
    it("prints only redacted text", () => {
      assert.ok(/\bprotection\.redact\(/.test(source), "redact() goes through the module");
      for (const write of source.matchAll(/process\.std(?:out|err)\.write\(/g)) {
        assert.ok(source.startsWith("`${redact(", write.index + write[0].length), `unredacted write at offset ${write.index}`);
      }
      if (/console\.(?:log|error)\(/.test(source)) {
        assert.match(source, /console\[method\] = \(\.\.\.parts\) => \{\s*const line = redact\(/, "every console line is redacted");
      }
      assert.match(source, failure, "an uncaught failure is printed redacted");
    });
  });
}
