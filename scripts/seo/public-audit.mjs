/** Bounded, read-only public HTML diagnostics. No browser execution or private data access. */
const BLOCKED_PATH = /^\/(?:access|account|my-account|admin|api|auth|billing|checkout|confirmation-required|forgot-password|game|games|game-access|homework|quizzes|map-prep|play|sign-in|sign-up|signin|signup|login|logout|signout|subscription|subscriber-management|update-password|teacher|student|pilot)(?:\/|$)/i;
const REDIRECTS = new Set([301, 302, 303, 307, 308]);
// Explicit search crawlers only. Training-specific and unknown agents remain observations.
const SEARCH_AGENTS = new Set(["*", "googlebot", "bingbot", "oai-searchbot", "claude-searchbot", "perplexitybot", "duckduckbot", "applebot", "slurp", "baiduspider", "yandex", "yandexbot"]);

function clean(value, limit = 240) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&#(x[\da-f]+|\d+);/gi, (_, digits) => {
      const point = digits[0].toLowerCase() === "x" ? parseInt(digits.slice(1), 16) : Number(digits);
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : " ";
    })
    .replace(/&(?:amp|quot|apos|lt|gt|nbsp);/gi, (entity) => ({ "&amp;": "&", "&quot;": '"', "&apos;": "'", "&lt;": " ", "&gt;": " ", "&nbsp;": " " })[entity.toLowerCase()])
    .replace(/[<>\p{Cc}\p{Cf}]/gu, " ")
    .replace(/\s+/g, " ").trim().slice(0, limit);
}

function bound(value, fallback, maximum, name) {
  const result = value ?? fallback;
  if (!Number.isInteger(result) || result < 1 || result > maximum) throw new Error(`Invalid ${name}`);
  return result;
}

function checkedConfig(config) {
  if (!Array.isArray(config?.sites) || config.sites.length < 1 || config.sites.length > 10) throw new Error("Invalid sites");
  const seen = new Set();
  const sites = config.sites.map((site) => {
    const url = new URL(site.origin);
    if (url.protocol !== "https:" || url.origin !== site.origin || url.username || url.password || url.port ||
      !url.hostname.includes(".") || /^(?:\d+\.){3}\d+$/.test(url.hostname) ||
      /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(url.hostname) || seen.has(url.origin)) throw new Error("Invalid public origin");
    seen.add(url.origin);
    if (!Array.isArray(site.paths) || !site.paths.length || site.paths.length > 60) throw new Error("Invalid public paths");
    const paths = [...new Set(site.paths)];
    for (const path of paths) {
      if (typeof path !== "string" || !/^\/(?:[a-zA-Z0-9._~!$&'()*+,;=@/-]*)$/.test(path) || path.startsWith("//") ||
        new URL(path, url).pathname !== path || BLOCKED_PATH.test(path) || path === "/robots.txt" || path === "/sitemap.xml") throw new Error("Invalid or protected public path");
    }
    return { origin: url.origin, paths, allowed: new Set(["/robots.txt", "/sitemap.xml", ...paths].map((path) => `${url.origin}${path}`)) };
  });
  return {
    sites,
    accessChecks: (() => {
      const urls = config.accessChecks ?? [];
      const permitted = new Set(["https://showme.mathnexa.com/", "https://showme.mathnexa.com/sitemap.xml"]);
      if (!Array.isArray(urls) || urls.some(url => !permitted.has(url))) throw new Error("Invalid protected access check");
      return [...new Set(urls)];
    })(),
    maxRequests: bound(config.maxRequests, 30, 60, "maxRequests"),
    timeoutMs: bound(config.timeoutMs, 10000, 30000, "timeoutMs"),
    maxBytes: bound(config.maxBytes, 1500000, 5000000, "maxBytes")
  };
}

function attributes(tag) {
  const values = {};
  const pattern = /([^\s=<>/]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  for (const match of tag.matchAll(pattern)) values[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4];
  return values;
}

function publicUrl(value, base) {
  try {
    // Decode common HTML URL escaping only; never request values extracted here.
    const url = new URL(String(value).replace(/&amp;/g, "&"), base);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search) return null;
    url.hash = "";
    return clean(url.href, 500);
  } catch { return null; }
}

function inspectRobots(body) {
  const groups = [];
  const directives = [];
  let current = null;
  let hasRules = false;
  for (const line of body.split(/\r?\n/)) {
    const match = line.split("#")[0].match(/^\s*(user-agent|allow|disallow|sitemap)\s*:\s*(.*?)\s*$/i);
    if (!match) continue;
    const key = match[1].toLowerCase();
    const value = match[2];
    if (directives.length < 80) directives.push(clean(`${key}: ${value}`, 240));
    if (key === "user-agent") {
      if (!current || hasRules) {
        current = { userAgents: [], allow: [], disallow: [] };
        groups.push(current);
        hasRules = false;
      }
      current.userAgents.push(value.toLowerCase());
    } else if (current && (key === "allow" || key === "disallow")) {
      current[key].push(value);
      hasRules = true;
    }
  }
  // Repeated groups for one agent combine. An equally specific Allow: / wins.
  const searchRules = new Map();
  for (const group of groups) for (const agent of group.userAgents) {
    if (!SEARCH_AGENTS.has(agent) && !/^googlebot-(?:image|news|video)$/.test(agent)) continue;
    const rules = searchRules.get(agent) ?? { fullAllow: false, fullDisallow: false };
    rules.fullAllow ||= group.allow.includes("/");
    rules.fullDisallow ||= group.disallow.includes("/");
    searchRules.set(agent, rules);
  }
  return {
    directives,
    groups: groups.slice(0, 40).map((group) => ({
      userAgents: group.userAgents.slice(0, 30).map((agent) => clean(agent, 80)),
      allow: group.allow.slice(0, 40).map((path) => clean(path, 200)),
      disallow: group.disallow.slice(0, 40).map((path) => clean(path, 200))
    })),
    groupsTruncated: groups.length > 40 || groups.some((group) => group.userAgents.length > 30 || group.allow.length > 40 || group.disallow.length > 40),
    searchFullDisallowAgents: [...searchRules].filter(([, rules]) => rules.fullDisallow && !rules.fullAllow).map(([agent]) => agent).sort()
  };
}

function sitemapKind(body) {
  // Basic root/completeness check, not a general XML validator. No DTD/entity evaluation.
  const xml = body.replace(/^\uFEFF/, "").replace(/<!--[\s\S]*?-->/g, "").replace(/^\s*<\?xml\b[^?]*\?>/i, "").trim();
  if (/^<urlset\b[^>]*(?:\/\s*>|>[\s\S]*<\/urlset\s*>)$/i.test(xml)) return "urlset";
  if (/^<sitemapindex\b[^>]*(?:\/\s*>|>[\s\S]*<\/sitemapindex\s*>)$/i.test(xml)) return "index";
  return "unknown";
}

function inspectHtml(html, url, headerRobots) {
  // Strip executable/template content before counting visible document elements.
  const uncommented = html.replace(/<!--[\s\S]*?-->/g, "");
  const document = uncommented.replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  const title = clean(document.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1] ?? "");
  let description = "";
  let canonical = null;
  const robots = [];
  for (const [tag] of document.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = attributes(tag);
    if (attrs.name?.toLowerCase() === "description" && !description) description = clean(attrs.content);
    if (["robots", "googlebot", "bingbot"].includes(attrs.name?.toLowerCase())) robots.push(clean(attrs.content, 200).toLowerCase());
  }
  for (const [tag] of document.matchAll(/<link\b[^>]*>/gi)) {
    const attrs = attributes(tag);
    if (attrs.rel?.toLowerCase().split(/\s+/).includes("canonical")) { canonical = attrs.href?.trim() ? publicUrl(attrs.href, url) : null; break; }
  }
  const schemaTypes = new Set();
  let schemaParseFailures = 0;
  for (const match of uncommented.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (attributes(match[1]).type?.toLowerCase() !== "application/ld+json") continue;
    try {
      const pending = [JSON.parse(match[2])];
      let inspected = 0;
      while (pending.length && inspected++ < 10000) {
        const value = pending.pop();
        if (!value || typeof value !== "object") continue;
        const types = Array.isArray(value["@type"]) ? value["@type"] : [value["@type"]];
        for (const type of types) if (typeof type === "string" && schemaTypes.size < 30) schemaTypes.add(clean(type, 80));
        for (const nested of Object.values(value)) if (nested && typeof nested === "object") pending.push(nested);
      }
    } catch { schemaParseFailures++; }
  }
  let internalLinkCount = 0;
  for (const [tag] of document.matchAll(/<a\b[^>]*>/gi)) {
    const href = attributes(tag).href;
    const link = href ? publicUrl(href, url) : null;
    if (link && new URL(link).origin === new URL(url).origin) internalLinkCount++;
  }
  return { title, description, canonical, robots, xRobotsTag: clean(headerRobots, 200).toLowerCase(), h1Count: [...document.matchAll(/<h1\b/gi)].length, schemaTypes: [...schemaTypes].sort(), schemaParseFailures, internalLinkCount };
}

/**
 * config: { sites: [{origin: 'https://example.com', paths: ['/','/about']}],
 * maxRequests?: 30 (cap 60), timeoutMs?: 10000 (cap 30000), maxBytes?: 1500000 (cap 5000000) }
 * Each response/redirect/retry counts against one global request budget. No URLs are discovered/followed.
 * now may be a Date, ISO string, or function returning either. fetchImpl is injectable for offline tests.
 */
export async function auditPublicSites(config, { fetchImpl = globalThis.fetch, now = () => new Date() } = {}) {
  const settings = checkedConfig(config);
  const observedAt = new Date(typeof now === "function" ? now() : now).toISOString();
  const findings = [];
  let requestsUsed = 0;
  let complete = true;
  const add = (target, code, severity, message) => findings.push({ id: `${target}#${code}`, severity, target, message });

  async function attempt(url, accept) {
    const controller = new AbortController();
    let timer;
    let reader;
    let bytes = 0;
    const read = async () => {
      const response = await fetchImpl(url, { method: "GET", redirect: "manual", credentials: "omit", signal: controller.signal, headers: { Accept: accept, "User-Agent": "MathNexaPublicAudit/1.0" } });
      if (controller.signal.aborted) { if (response.body) await response.body.cancel(); return { status: null, error: "timeout" }; }
      const metadata = { status: response.status, location: response.headers.get("location"), retryAfter: response.headers.get("retry-after"), contentType: response.headers.get("content-type") ?? "", xRobotsTag: response.headers.get("x-robots-tag") ?? "" };
      if (REDIRECTS.has(response.status) || response.status === 429 || response.status >= 500) {
        if (response.body) await response.body.cancel();
        return { ...metadata, body: "" };
      }
      if (Number(response.headers.get("content-length")) > settings.maxBytes) {
        if (response.body) await response.body.cancel();
        return { ...metadata, error: "response-too-large" };
      }
      const chunks = [];
      reader = response.body?.getReader();
      if (reader) for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > settings.maxBytes) { await reader.cancel(); return { ...metadata, error: "response-too-large" }; }
        chunks.push(value);
      }
      const body = new Uint8Array(bytes);
      let offset = 0;
      for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
      return { ...metadata, body: new TextDecoder().decode(body) };
    };
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        if (reader) void reader.cancel().catch(() => {});
        resolve({ status: null, error: "timeout" });
      }, settings.timeoutMs);
    });
    try { return await Promise.race([read(), timeout]); }
    catch { return { status: null, error: controller.signal.aborted ? "timeout" : "network-error" }; }
    finally { clearTimeout(timer); }
  }

  async function request(url, allowed, accept = "text/html,application/xhtml+xml,application/xml,text/plain;q=0.9") {
    let current = url;
    let redirects = 0;
    let retried = false;
    for (;;) {
      if (requestsUsed >= settings.maxRequests) return { url, finalUrl: current, status: null, error: "request-budget-exhausted" };
      requestsUsed++;
      const response = await attempt(current, accept);
      const result = { url, finalUrl: current, ...response };
      if (response.error) return result;
      if (REDIRECTS.has(response.status)) {
        let next;
        try { next = new URL(response.location, current); } catch { return { ...result, error: "redirect-blocked" }; }
        if (!response.location || next.username || next.password || next.search || next.hash || !allowed.has(next.href)) return { ...result, error: "redirect-blocked" };
        if (++redirects > 3) return { ...result, error: "redirect-limit" };
        current = next.href;
        continue;
      }
      if ((response.status === 429 || response.status >= 500) && !retried) {
        const retrySeconds = Number(response.retryAfter);
        // Long/server-date Retry-After values stop this bounded audit instead of polling.
        if (response.retryAfter && (!Number.isFinite(retrySeconds) || retrySeconds > 1 || retrySeconds < 0)) return result;
        if (requestsUsed >= settings.maxRequests) return result;
        retried = true;
        await new Promise((resolve) => setTimeout(resolve, response.retryAfter ? retrySeconds * 1000 : 100));
        continue;
      }
      return result;
    }
  }

  function observation(response) {
    const { url, finalUrl, status, error } = response;
    if (error || !(status >= 200 && status < 300)) {
      complete = false;
      add(url, error ?? `http-${status}`, "error", error ? `Public check incomplete: ${error}.` : `Public request returned HTTP ${status}.`);
    }
    return { url, finalUrl, status, error: error ?? null };
  }

  const sites = [];
  for (const site of settings.sites) {
    const robotsResponse = await request(`${site.origin}/robots.txt`, site.allowed);
    const robots = { ...observation(robotsResponse), directives: [], groups: [], groupsTruncated: false, searchFullDisallowAgents: [] };
    if (!robots.error && robots.status >= 200 && robots.status < 300) {
      if (/(?:<html\b|<!doctype\s+html)/i.test(robotsResponse.body ?? "") || /^(?:text\/html|application\/xhtml\+xml)(?:;|$)/i.test(robotsResponse.contentType ?? "")) {
        complete = false;
        robots.error = "robots-html";
        add(robots.url, "robots-html", "error", "The robots response advertised or contained HTML instead of plain crawler directives.");
      } else {
        Object.assign(robots, inspectRobots(robotsResponse.body ?? ""));
        if (robots.searchFullDisallowAgents.length) add(robots.url, "robots-full-disallow", "warning", "A general or recognized search-crawler group contains Disallow: / without an equally specific Allow: /. Review its intended search access and narrower exceptions; preserve separate training-crawler preferences.");
      }
    }
    const sitemapResponse = await request(`${site.origin}/sitemap.xml`, site.allowed);
    const sitemap = { ...observation(sitemapResponse), kind: "unknown", urlCount: 0 };
    const locations = new Set();
    if (!sitemap.error && sitemap.status >= 200 && sitemap.status < 300) {
      sitemap.kind = sitemapKind(sitemapResponse.body ?? "");
      for (const match of (sitemapResponse.body ?? "").matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc\s*>/gi)) {
        const location = publicUrl(match[1].trim(), site.origin);
        if (location) locations.add(location);
      }
      sitemap.urlCount = locations.size;
      if (sitemap.kind === "unknown") {
        complete = false;
        sitemap.error = "sitemap-invalid";
        add(sitemap.url, "sitemap-invalid", "error", "No complete sitemap urlset or sitemapindex root was recognized. This is a basic XML structure check.");
      }
      if (sitemap.kind === "index") add(sitemap.url, "sitemap-index-not-expanded", "warning", "A sitemap index was observed. Child sitemaps are not fetched by this bounded audit; page membership is unknown.");
    }
    const pages = [];
    for (const path of site.paths) {
      const response = await request(`${site.origin}${path}`, site.allowed);
      const page = { ...observation(response), title: null, description: null, canonical: null, robots: [], xRobotsTag: null, h1Count: null, schemaTypes: [], schemaParseFailures: null, internalLinkCount: null, inSitemap: null };
      if (!response.error && response.status >= 200 && response.status < 300) {
        if (response.contentType && !/^(?:text\/html|application\/xhtml\+xml)(?:;|$)/i.test(response.contentType)) {
          complete = false;
          page.error = "non-html-page";
          add(page.url, "non-html-page", "error", "The allowlisted page did not return an HTML content type.");
        } else {
          Object.assign(page, inspectHtml(response.body ?? "", page.finalUrl, response.xRobotsTag));
          if (!page.title) add(page.url, "title-missing", "warning", "No nonempty HTML title was observed.");
          if (!page.description) add(page.url, "description-missing", "warning", "No nonempty meta description was observed.");
          if (!page.canonical) add(page.url, "canonical-missing", "warning", "No usable canonical URL without credentials or query parameters was observed.");
          if (page.canonical && page.canonical !== page.finalUrl) add(page.url, "canonical-different", "warning", "The declared canonical differs from the fetched public URL; verify whether this is intentional.");
          if (page.h1Count !== 1) add(page.url, "h1-review", "warning", `Observed ${page.h1Count} H1 elements; review the visible heading structure.`);
          if (/(?:^|[\s,:;])(?:noindex|none)(?:$|[\s,;])/.test([...page.robots, page.xRobotsTag].join(","))) add(page.url, "noindex", "warning", "An observed meta or HTTP robots directive requests no indexing; verify this page's intended audience.");
          if (page.schemaParseFailures) add(page.url, "schema-json-invalid", "warning", `${page.schemaParseFailures} JSON-LD block(s) could not be parsed as JSON. This is not full structured-data validation.`);
          if (!sitemap.error && sitemap.status >= 200 && sitemap.status < 300 && sitemap.kind === "urlset") {
            page.inSitemap = locations.has(page.finalUrl);
            if (!page.inSitemap) add(page.url, "sitemap-membership", "warning", "The fetched public URL was not observed in this sitemap urlset; review intended indexing and canonical coverage.");
          }
        }
      }
      pages.push(page);
    }
    sites.push({ origin: site.origin, robots, sitemap, pages });
  }
  const accessChecks = [];
  for (const url of settings.accessChecks) {
    const response = await request(url, new Set([url]), "text/plain");
    const robots = clean(response.xRobotsTag, 200).toLowerCase();
    const matched = !response.error && response.status === 401 && /\bnoindex\b/.test(robots);
    accessChecks.push({ url, status: response.status, error: response.error ?? null, expectedStatus: 401, matched, robots, policyEvidence: "docs/showme-access-gate.md" });
    if (!matched) {
      complete = false;
      add(url, "access-policy-unexpected", "error", "Expected an anonymous 401 with noindex for this protected resource. Investigate without changing access controls.");
    }
  }
  return { schemaVersion: 1, observedAt, requestsUsed, requestLimit: settings.maxRequests, complete, sites, accessChecks, findings };
}
