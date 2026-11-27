import test from "node:test";
import assert from "node:assert/strict";
import { auditPublicSites } from "./public-audit.mjs";

const origin = "https://mathnexa.com";
test('documented ShowMe protection is verified, while unexpected exposure or missing noindex fails', async () => {
  for (const [status, robots, expected] of [[401,'noindex, nofollow',true],[200,'noindex',false],[401,'',false],[503,'noindex',false]]) {
    const source = fixture(validHtml, { 'https://showme.mathnexa.com/': () => new Response('access required', {status,headers:{'x-robots-tag':robots}}) });
    const result = await auditPublicSites({ ...config, accessChecks:['https://showme.mathnexa.com/'] }, source);
    assert.equal(result.accessChecks[0].matched, expected);
    assert.equal(result.complete, expected);
    assert.equal(source.calls.at(-1).options.headers.Accept, 'text/plain');
  }
});
const config = { sites: [{ origin, paths: ["/"] }], timeoutMs: 100, maxRequests: 12, maxBytes: 10000 };
const validHtml = '<!doctype html><html><head><title>MathNexa</title><meta name="description" content="Checked math practice"><link rel="canonical" href="https://mathnexa.com/"><script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite"}</script></head><body><h1>Math practice</h1><a href="/about">About</a><a href="https://elsewhere.example/">Elsewhere</a></body></html>';
function fixture(page = validHtml, overrides = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (overrides[url]) return overrides[url](options);
    if (url.endsWith("/robots.txt")) return new Response("User-agent: *\nAllow: /\n", { headers: { "content-type": "text/plain" } });
    if (url.endsWith("/sitemap.xml")) return new Response(`<urlset><url><loc>${origin}/</loc></url></urlset>`, { headers: { "content-type": "application/xml" } });
    return new Response(page, { headers: { "content-type": "text/html" } });
  };
  return { calls, fetchImpl };
}

test("extracts public summaries without storing HTML or following links", async () => {
  const source = fixture();
  const result = await auditPublicSites(config, { ...source, now: "2026-11-26T12:00:00Z" });
  assert.equal(result.observedAt, "2026-11-26T12:00:00.000Z");
  assert.equal(result.requestsUsed, 3);
  assert.equal(result.complete, true);
  assert.deepEqual(result.findings, []);
  assert.equal(result.sites[0].pages[0].internalLinkCount, 1);
  assert.equal(result.sites[0].pages[0].inSitemap, true);
  assert.deepEqual(result.sites[0].pages[0].schemaTypes, ["WebSite"]);
  assert.doesNotMatch(JSON.stringify(result), /<!doctype|<body|@context/);
  assert.ok(source.calls.every(({ options }) => options.redirect === "manual" && options.credentials === "omit"));
});

test("reports absent metadata, noindex and malformed JSON-LD with stable finding IDs", async () => {
  const source = fixture('<html><meta name="robots" content="noindex,follow"><script type="application/ld+json">{broken</script><h1>A</h1><h1>B</h1></html>');
  const result = await auditPublicSites(config, source);
  for (const code of ["title-missing", "description-missing", "canonical-missing", "h1-review", "noindex", "schema-json-invalid"]) assert.ok(result.findings.some(({ id }) => id === `${origin}/#${code}`), code);
  assert.equal(result.sites[0].pages[0].schemaParseFailures, 1);
});

test("blocks off-origin, auth, query and credential redirects before fetching them", async () => {
  for (const location of ["https://attacker.example/", "/sign-in", "/?token=private", "https://name:secret@mathnexa.com/", "/%61dmin", "http://mathnexa.com/"]) {
    const source = fixture(validHtml, { [`${origin}/`]: () => new Response(null, { status: 302, headers: { location } }) });
    const result = await auditPublicSites(config, source);
    assert.equal(result.sites[0].pages[0].error, "redirect-blocked", location);
    assert.equal(source.calls.length, 3);
    assert.doesNotMatch(JSON.stringify(result), /attacker|secret|token=private/);
  }
});

test("allows only explicitly configured same-origin redirect destinations and bounds loops", async () => {
  const source = fixture(validHtml, { [`${origin}/`]: () => new Response(null, { status: 301, headers: { location: "/about" } }) });
  const result = await auditPublicSites({ ...config, sites: [{ origin, paths: ["/", "/about"] }] }, source);
  assert.equal(result.sites[0].pages[0].finalUrl, `${origin}/about`);
  const loop = fixture(validHtml, { [`${origin}/`]: () => new Response(null, { status: 302, headers: { location: "/" } }) });
  const stopped = await auditPublicSites(config, loop);
  assert.equal(stopped.sites[0].pages[0].error, "redirect-limit");
  assert.equal(stopped.requestsUsed, 6);
});

test("counts retries against global request budget and leaves skipped reads explicit", async () => {
  const source = fixture(validHtml, { [`${origin}/robots.txt`]: () => new Response(null, { status: 503, headers: { "retry-after": "0" } }) });
  const result = await auditPublicSites({ ...config, maxRequests: 2 }, source);
  assert.equal(source.calls.length, 2);
  assert.equal(result.requestsUsed, 2);
  assert.equal(result.sites[0].sitemap.error, "request-budget-exhausted");
  assert.equal(result.sites[0].pages[0].error, "request-budget-exhausted");
  assert.equal(result.complete, false);
});

test("retries a transient status at most once and respects long Retry-After", async () => {
  for (const retryAfter of ["0", "120"]) {
    const source = fixture(validHtml, { [`${origin}/robots.txt`]: () => new Response(null, { status: 429, headers: { "retry-after": retryAfter } }) });
    const result = await auditPublicSites(config, source);
    assert.equal(source.calls.filter(({ url }) => url.endsWith("robots.txt")).length, retryAfter === "0" ? 2 : 1);
    assert.equal(result.sites[0].robots.status, 429);
    assert.equal(result.complete, false);
  }
});

test("times out a fetch that ignores AbortSignal and continues within request budget", async () => {
  const source = fixture(validHtml, { [`${origin}/robots.txt`]: () => new Promise(() => {}) });
  const result = await auditPublicSites({ ...config, timeoutMs: 10 }, source);
  assert.equal(result.sites[0].robots.error, "timeout");
  assert.equal(result.requestsUsed, 3);
  assert.equal(result.sites[0].pages[0].title, "MathNexa");
  assert.equal(source.calls[0].options.signal.aborted, true);
});

test("times out stalled streaming bodies", async () => {
  let cancelled = false;
  const source = fixture(validHtml, { [`${origin}/`]: () => new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { "content-type": "text/html" } }) });
  const result = await auditPublicSites({ ...config, timeoutMs: 10 }, source);
  assert.equal(result.sites[0].pages[0].error, "timeout");
  assert.equal(cancelled, true);
});

test("rejects declared and streamed oversized bodies without persisting payload", async () => {
  for (const headers of [{ "content-length": "20000" }, {}]) {
    const source = fixture(validHtml, { [`${origin}/`]: () => new Response("private-payload".repeat(1000), { headers }) });
    const result = await auditPublicSites({ ...config, maxBytes: 1000 }, source);
    assert.equal(result.sites[0].pages[0].error, "response-too-large");
    assert.doesNotMatch(JSON.stringify(result), /private-payload/);
  }
});

test("keeps sitemap-index membership unknown without following child locations", async () => {
  const source = fixture(validHtml, { [`${origin}/sitemap.xml`]: () => new Response('<sitemapindex><sitemap><loc>https://elsewhere.example/private.xml</loc></sitemap></sitemapindex>') });
  const result = await auditPublicSites(config, source);
  assert.equal(result.sites[0].sitemap.kind, "index");
  assert.equal(result.sites[0].pages[0].inSitemap, null);
  assert.equal(source.calls.length, 3);
  assert.doesNotMatch(JSON.stringify(result), /elsewhere.example/);
});

test("sanitizes and bounds public text and observes HTTP noindex", async () => {
  const source = fixture(validHtml, { [`${origin}/`]: () => new Response(`<title>Safe\u202e<script>bad</script>${"a".repeat(500)}</title><h1>A</h1>`, { headers: { "content-type": "text/html", "x-robots-tag": "googlebot: noindex" } }) });
  const result = await auditPublicSites(config, source);
  assert.equal(result.sites[0].pages[0].title.length, 240);
  assert.doesNotMatch(result.sites[0].pages[0].title, /[<>\u202e]/);
  assert.ok(result.findings.some(({ id }) => id.endsWith("#noindex")));
});

test("rejects protected or ambiguous configuration before issuing a request", async () => {
  let calls = 0;
  const fetchImpl = () => { calls++; throw new Error("must not fetch"); };
  for (const path of ["/admin", "/games", "/homework", "/map-prep", "/logout", "/a/../admin", "/%61dmin", "/?x=1", "//elsewhere.example/"]) {
    await assert.rejects(auditPublicSites({ ...config, sites: [{ origin, paths: [path] }] }, { fetchImpl }));
  }
  for (const badOrigin of ["http://mathnexa.com", "https://127.0.0.1", "https://localhost", "https://mathnexa.com/path", "https://user:pass@mathnexa.com"]) {
    await assert.rejects(auditPublicSites({ ...config, sites: [{ origin: badOrigin, paths: ["/"] }] }, { fetchImpl }));
  }
  assert.equal(calls, 0);
});

test("redacts network exception details and never treats failed page reads as empty metadata", async () => {
  const source = fixture(validHtml, { [`${origin}/`]: () => { throw new Error("provider credential secret_123"); } });
  const result = await auditPublicSites(config, source);
  assert.equal(result.sites[0].pages[0].error, "network-error");
  assert.equal(result.sites[0].pages[0].title, null);
  assert.equal(result.findings.filter(({ target }) => target === `${origin}/`).length, 1);
  assert.doesNotMatch(JSON.stringify(result), /secret_123|credential/);
});

test("rejects non-HTML pages and ignores commented markup and empty canonicals", async () => {
  const binary = fixture(validHtml, { [`${origin}/`]: () => new Response("binary", { headers: { "content-type": "application/octet-stream" } }) });
  assert.equal((await auditPublicSites(config, binary)).sites[0].pages[0].error, "non-html-page");
  const source = fixture('<title>A</title><link rel="canonical"><h1>A</h1><!--<h1>Not visible</h1><script type="application/ld+json">broken</script>-->');
  const result = await auditPublicSites(config, source);
  assert.equal(result.sites[0].pages[0].canonical, null);
  assert.equal(result.sites[0].pages[0].h1Count, 1);
  assert.equal(result.sites[0].pages[0].schemaParseFailures, 0);
});

test("preserves separate training-crawler blocks without suggesting search changes", async () => {
  const body = "User-agent: *\nAllow: /\n\nUser-agent: GPTBot\nUser-agent: ClaudeBot\nDisallow: /\n\nUser-agent: Google-Extended\nDisallow: /\n";
  const source = fixture(validHtml, { [`${origin}/robots.txt`]: () => new Response(body) });
  const result = await auditPublicSites(config, source);
  assert.equal(result.complete, true);
  assert.deepEqual(result.sites[0].robots.searchFullDisallowAgents, []);
  assert.equal(result.sites[0].robots.groups.length, 3);
  assert.deepEqual(result.sites[0].robots.groups[1].userAgents, ["gptbot", "claudebot"]);
  assert.deepEqual(result.sites[0].robots.groups[1].disallow, ["/"]);
  assert.ok(!result.findings.some(({ id }) => id.endsWith("#robots-full-disallow")));
});

test("warns on general or search full blocks but respects same-group and merged Allow rules", async () => {
  for (const [body, expected] of [
    ["User-agent: *\nDisallow: /\n", ["*"]],
    ["User-agent: Googlebot\nDisallow: /\nUser-agent: GPTBot\nAllow: /\n", ["googlebot"]],
    ["User-agent: OAI-SearchBot\nDisallow: /\n", ["oai-searchbot"]],
    ["User-agent: *\nDisallow: /\nAllow: /\n", []],
    ["User-agent: Bingbot\nDisallow: /\nUser-agent: bingbot\nAllow: /\n", []],
    ["Disallow: /\nUser-agent: *\nAllow: /\n", []]
  ]) {
    const source = fixture(validHtml, { [`${origin}/robots.txt`]: () => new Response(body) });
    const result = await auditPublicSites(config, source);
    assert.deepEqual(result.sites[0].robots.searchFullDisallowAgents, expected, body);
    assert.equal(result.findings.some(({ id }) => id.endsWith("#robots-full-disallow")), Boolean(expected.length), body);
  }
});

test("HTML robots and invalid or truncated sitemaps make coverage incomplete", async () => {
  const htmlRobots = fixture(validHtml, { [`${origin}/robots.txt`]: () => new Response("<html><title>Login</title></html>") });
  const robotsResult = await auditPublicSites(config, htmlRobots);
  assert.equal(robotsResult.complete, false);
  assert.equal(robotsResult.sites[0].robots.error, "robots-html");
  for (const body of ["", "<html>Not XML</html>", "<urlset><url>", "<html><urlset></urlset></html>"]) {
    const source = fixture(validHtml, { [`${origin}/sitemap.xml`]: () => new Response(body) });
    const result = await auditPublicSites(config, source);
    assert.equal(result.complete, false, body);
    assert.equal(result.sites[0].sitemap.error, "sitemap-invalid", body);
    assert.equal(result.sites[0].pages[0].inSitemap, null, body);
  }
});

test("accepts complete empty sitemap roots and keeps sitemap-index checks bounded", async () => {
  for (const body of ['<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>', "<sitemapindex></sitemapindex>"]) {
    const source = fixture(validHtml, { [`${origin}/sitemap.xml`]: () => new Response(body) });
    const result = await auditPublicSites(config, source);
    assert.equal(result.complete, true);
    assert.equal(result.sites[0].sitemap.error, null);
    assert.equal(source.calls.length, 3);
  }
});
