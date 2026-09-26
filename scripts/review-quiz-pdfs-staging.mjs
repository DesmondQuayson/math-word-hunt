// Quiz PDFs V1 - real-browser owner review against a STAGING deployment (or,
// through scripts/invoke-quiz-pdfs-production.ps1, the production apex).
//
// Runs only through scripts/invoke-quiz-pdfs-staging.ps1 -Stage review, which
// supplies STAGING_ORIGIN, the Vercel protection-bypass entry and the staging
// Supabase service credential from the process-only vault. Synthetic consumer
// accounts (fresh, used-trial, active-trial, subscriber) are created on the
// target project, exercised through the real sign-in, and deleted at the end.
// Secrets are never printed; the bypass value travels only in request headers.
//
// Coverage: the banner (six product destinations, no Authorize Code item, each
// destination reachable), the homepage Authorize Code form (present, masked,
// Show/Hide, a typed value never reaches the URL or web storage; never
// submitted), every Quiz PDF card (Preview, Details, Download PDF), the protected
// preview (server gate, inline delivery, pages drawn, last page reachable by
// scrolling, no forced download, Download PDF and Back to Quiz PDFs), all review
// widths, 200% text, axe, keyboard order, Chromium and WebKit. Console and page
// errors are classified: only errors raised by the app itself fail the run;
// preview-only noise (the Vercel toolbar script, deployment-protection refusals
// of RSC fetches) is counted separately and shown with its evidence.
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

import playwright from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const { chromium } = playwright;

import { applyQuizTopicMap, loadQuizManifest, loadQuizTopicMap } from "./quiz-pdfs/manifest.mjs";
import { verifyQuizPublication } from "./quiz-pdfs/publish.mjs";

const STAGING_PROJECT_REF = "gcmuhzxkwvfireyrearl";
const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

function required(name, pattern = /\S/) {
  const value = process.env[name]?.trim() ?? "";
  if (!pattern.test(value)) throw new Error(`missing-${name.toLowerCase().replaceAll("_", "-")}`);
  return value;
}
// Staging previews (SSO-protected, need the bypass entry), production candidates
// and the apex are the only origins this harness will drive.
const ORIGIN_ALLOWLIST = /^https:\/\/(mathnexa-platform-(?:staging|production)[a-z0-9-]*\.vercel\.app|mathnexa\.com)$/;
const origin = (process.env.REVIEW_ORIGIN?.trim() || process.env.STAGING_ORIGIN?.trim() || "").replace(/\/$/, "");
if (!ORIGIN_ALLOWLIST.test(origin)) throw new Error("REVIEW_ORIGIN must be a MathNexa staging/production deployment or the apex");
const originHost = new URL(origin).host;
const bypassSecret = /^[A-Za-z0-9_-]{20,}$/.test(process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim() ?? "") ? process.env.VERCEL_AUTOMATION_BYPASS_SECRET.trim() : null;
const supabaseUrl = required("SUPABASE_URL", /^https:\/\//);
const secretKey = required("SUPABASE_SECRET_KEY", /^.{20,}$/);
// Any hosted project other than staging is production for this harness.
const isProduction = process.env.REVIEW_TARGET === "production" || !new URL(supabaseUrl).hostname.startsWith(`${STAGING_PROJECT_REF}.`);
if (isProduction && process.env.REVIEW_ALLOW_SYNTHETIC_ACCOUNTS_ON_PRODUCTION !== "yes") {
  throw new Error("production review creates temporary synthetic consumer accounts; the production launcher must opt in explicitly");
}
const expectedBuild = process.env.REVIEW_EXPECT_BUILD?.trim() || null;
const engines = (process.env.REVIEW_ENGINES ?? "chromium").split(",").map((name) => name.trim()).filter(Boolean);
const out = resolve(process.env.REVIEW_OUT ?? (isProduction ? "owner-review/quiz-pdfs-v1/production" : "owner-review/quiz-pdfs-v1/staging"));
mkdirSync(out, { recursive: true });

// REVIEW_TOPIC_MAP (optional): the same explicit map the publish stages used, so
// the database verification matches quizzes to the existing topics by slug.
const sourceManifest = loadQuizManifest();
const topicMap = process.env.REVIEW_TOPIC_MAP?.trim() ? loadQuizTopicMap(sourceManifest, resolve(process.env.REVIEW_TOPIC_MAP.trim())) : null;
const manifest = applyQuizTopicMap(sourceManifest, topicMap);
const grade6 = manifest.grades.find((grade) => grade.gradeNumber === 6);
const admin = createClient(supabaseUrl, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
const run = `quiz-review-${randomBytes(6).toString("hex")}`;
const password = `${randomBytes(12).toString("base64url")}Aa1!`;
const REVIEW_WIDTHS = [320, 375, 390, 430, 768, 820, 1180, 1366, 1920];
// The six banner destinations, in order (lib/navigation/banner.ts PRODUCT_NAVIGATION).
const PRODUCTS = [["Home", "/"], ["Math Games", "/games"], ["Online Math Prep", "/map-prep"], ["Homework PDFs", "/homework"], ["Quiz PDFs", "/quizzes"], ["Worksheet Generator", "/worksheets"]];
const PRODUCT_LABELS = PRODUCTS.map(([label]) => label).join("|");
const WORKSHEET_GENERATOR_URL = "https://showme.mathnexa.com/worksheets";

// The grade's display title is whatever the target database holds (production: "grade 6").
let gradeTitle = "Grade 6";
const notes = [];
const results = [];
const note = (message) => { notes.push(message); console.log(message); };
const ok = (message) => { results.push(1); note(`ok   ${message}`); };
const bad = (message) => { results.push(0); note(`FAIL ${message}`); };
const check = (condition, message) => (condition ? ok : bad)(message);
const created = [];

async function user(kind) {
  const email = `${run}-${kind}@example.invalid`;
  const made = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { synthetic_run_id: run, purpose: "quiz-pdfs-staging-review" } });
  if (made.error) throw made.error;
  const id = made.data.user.id;
  created.push(id);
  const now = Date.now();
  const day = 86_400_000;
  const startsAt = new Date(now + 1000).toISOString();
  const trialEnds = new Date(now + 1000 + day).toISOString();
  const set = async (table, payload, op = "insert") => {
    const response = await (op === "insert" ? admin.from(table).insert(payload) : admin.from(table).update(payload).eq("user_id", id));
    if (response.error) throw new Error(`${kind} ${table}: ${response.error.message}`);
  };
  if (kind === "subscribed") { await set("consumer_accounts", { trial_redeemed_at: startsAt }, "update"); await set("consumer_game_entitlements", { user_id: id, entitlement_state: "subscription-active", current_period_ends_at: new Date(now + 20 * day).toISOString() }); }
  if (kind === "trial-active") { await set("consumer_accounts", { trial_redeemed_at: startsAt }, "update"); await set("consumer_game_entitlements", { user_id: id, entitlement_state: "trial-active", trial_started_at: startsAt, trial_ends_at: trialEnds }); }
  if (kind === "used-trial") { await set("consumer_accounts", { trial_redeemed_at: startsAt }, "update"); await set("consumer_game_entitlements", { user_id: id, entitlement_state: "trial-expired", trial_started_at: startsAt, trial_ends_at: trialEnds }); }
  return { id, email };
}

// Which quizzes are live on the target (resource ids by manifest slug, topic order from the database).
async function liveQuizzes() {
  const assignments = await admin.from("topic_resource_assignments").select("resource_id,slug,topic_id");
  if (assignments.error) throw assignments.error;
  const resources = await admin.from("content_resources").select("id").eq("resource_type", "quiz_pdf").eq("publication_state", "published").eq("resource_scope", "topic").eq("scope_status", "current");
  if (resources.error) throw resources.error;
  const topics = await admin.from("content_topics").select("id,title,sort_order").eq("publication_state", "published");
  if (topics.error) throw topics.error;
  const gradeRow = await admin.from("content_grades").select("title").eq("grade_number", 6).eq("publication_state", "published").maybeSingle();
  if (gradeRow.error || !gradeRow.data) throw new Error("published Grade 6 row not found");
  gradeTitle = gradeRow.data.title;
  const publishedIds = new Set(resources.data.map((row) => row.id));
  return grade6.topics.map((topic) => {
    const assignment = assignments.data.find((row) => row.slug === topic.quiz.slug && publishedIds.has(row.resource_id));
    if (!assignment) throw new Error(`quiz ${topic.quiz.slug} is not published on the target`);
    const dbTopic = topics.data.find((row) => row.id === assignment.topic_id);
    return { resourceId: assignment.resource_id, topicId: assignment.topic_id, topicSortOrder: dbTopic?.sort_order ?? null, topicTitle: dbTopic?.title ?? null, quiz: topic.quiz };
  }).sort((left, right) => left.topicSortOrder - right.topicSortOrder);
}

const browser = await chromium.launch();
const serverErrors = [];
// Unexpected refusals on resource routes seen by the browser pages (the review's own
// anonymous probes go through the request API and are not listed): status, route, and
// who answered (the app's JSON carries a reason; a platform refusal does not).
const resourceRefusals = [];
// Every console error and page error, with the engine and the page it came from.
const consoleErrors = [];
// Evidence for RSC fetch failures: redirected RSC responses and failed RSC requests.
const rscEvidence = { redirects: new Set(), failures: new Set() };
const pathOf = (page) => { try { const url = new URL(page.url()); return url.host === originHost ? url.pathname : `${url.host}${url.pathname}`; } catch { return "?"; } };
// The review step an error follows: the last recorded note.
const lastStep = () => (notes.at(-1) ?? "start").replace(/^(ok|FAIL) +/, "").slice(0, 110);
function observe(page, engine) {
  page.on("response", (response) => {
    let url;
    try { url = new URL(response.url()); } catch { return; }
    if (response.status() >= 500) serverErrors.push(`${engine} ${response.status()} ${url.host === originHost ? "" : url.host}${url.pathname}`);
    if (url.host === originHost && url.pathname.startsWith("/resources/") && response.status() >= 400 && response.status() < 500) {
      const headers = response.headers();
      const at = new Date().toISOString().slice(11, 19);
      response.text()
        .then((body) => resourceRefusals.push(`${at} ${engine} ${response.status()} ${url.pathname} type=${headers["content-type"] ?? "-"} server=${headers.server ?? "-"} body=${body.replace(/\s+/g, " ").slice(0, 140)} after "${lastStep()}"`))
        .catch(() => resourceRefusals.push(`${at} ${engine} ${response.status()} ${url.pathname} type=${headers["content-type"] ?? "-"} (body unavailable) after "${lastStep()}"`));
    }
    if (url.host === originHost && url.searchParams.has("_rsc") && response.status() >= 300 && response.status() < 400) {
      let target = response.headers().location ?? "";
      try { target = new URL(target, url).host; } catch { /* keep the raw value */ }
      rscEvidence.redirects.add(`${engine} ${response.status()} ${url.pathname} -> ${target}`);
    }
  });
  page.on("requestfailed", (request) => {
    let url;
    try { url = new URL(request.url()); } catch { return; }
    if (url.host === originHost && url.searchParams.has("_rsc")) rscEvidence.failures.add(`${engine} ${url.pathname} ${request.failure()?.errorText ?? ""}`.trim());
  });
  page.on("pageerror", (error) => consoleErrors.push({ engine, kind: "pageerror", path: pathOf(page), after: lastStep(), text: `${String(error).slice(0, 200)} | stack: ${String(error.stack ?? "").replace(/\s+/g, " ").slice(0, 200)}` }));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const source = message.location()?.url ?? "";
    consoleErrors.push({ engine, kind: "console", path: pathOf(page), after: lastStep(), text: `${message.text().slice(0, 200)}${source ? ` @ ${source.slice(0, 120)}` : ""}` });
  });
}
// Let in-flight requests (Next.js link prefetches) finish before the review
// navigates on its own: WebKit reports a prefetch aborted by a navigation as
// "Fetch API cannot load … due to access control checks" / "Load failed".
// Playwright's networkidle is a one-time lifecycle event, so in-flight
// requests are counted here instead.
const inflight = new WeakMap();
function trackRequests(page) {
  const open = new Set();
  inflight.set(page, open);
  page.on("request", (request) => open.add(request));
  page.on("requestfinished", (request) => open.delete(request));
  page.on("requestfailed", (request) => open.delete(request));
  page.on("download", () => open.clear());
}
async function settle(page, quietMs = 600, timeoutMs = 15_000) {
  const open = inflight.get(page);
  if (!open) return;
  const deadline = Date.now() + timeoutMs;
  let quietSince = 0;
  while (Date.now() < deadline) {
    if (open.size === 0) {
      quietSince ||= Date.now();
      if (Date.now() - quietSince >= quietMs) return;
    } else quietSince = 0;
    await page.waitForTimeout(100);
  }
}
async function open(state, viewport, engine = browser, engineName = "chromium") {
  // On a protected preview: the bypass entry, and x-vercel-skip-toolbar so the
  // Vercel feedback toolbar (preview-only, never on production) stays inactive.
  const context = await engine.newContext({ viewport, bypassCSP: true, ...(bypassSecret ? { extraHTTPHeaders: { "x-vercel-protection-bypass": bypassSecret, "x-vercel-skip-toolbar": "1" } } : {}) });
  const page = await context.newPage();
  trackRequests(page);
  const goto = page.goto.bind(page);
  page.goto = async (url, options) => {
    await settle(page);
    try {
      return await goto(url, options);
    } catch (error) {
      // A remote preview can keep the network busy past the 30 s budget; retry
      // once on the plain load event (recorded). Content checks follow anyway.
      if (!/Timeout \d+ms exceeded/.test(String(error.message))) throw error;
      note(`  navigation to ${String(url).replace(/x-vercel-protection-bypass=[^&]+/, "x-vercel-protection-bypass=[hidden]").replace(origin, "")} timed out waiting for ${options?.waitUntil ?? "load"}; retried once on load`);
      return goto(url, { ...options, waitUntil: "load", timeout: 60_000 });
    }
  };
  observe(page, engineName);
  if (bypassSecret) {
    // Set the bypass cookie once so client-side fetches pass as well, then leave the bootstrap URL behind.
    await page.goto(`${origin}/?x-vercel-protection-bypass=${bypassSecret}&x-vercel-set-bypass-cookie=true`, { waitUntil: "domcontentloaded" });
  }
  await page.goto(`${origin}/`, { waitUntil: "networkidle" });
  if (state !== "anonymous") {
    await page.goto(`${origin}/sign-in?next=/quizzes`);
    await page.getByLabel("Email address").fill(users[state].email);
    await page.locator("input[name=\"password\"]").fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    for (let i = 0; i < 120 && new URL(page.url()).pathname.startsWith("/sign-in"); i += 1) await page.waitForTimeout(500);
  }
  return { context, page };
}
async function shot(page, name, options = {}) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/${name}.png`, ...options });
  note(`shot ${name}.png ${new URL(page.url()).pathname}${new URL(page.url()).search}`);
}
async function selectGrade(page) {
  await page.getByRole("combobox", { name: "Grade" }).selectOption({ label: gradeTitle });
  await page.getByRole("heading", { name: "Quiz Topics" }).waitFor();
}
const pageFacts = (page) => page.evaluate(() => ({
  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  cards: document.querySelectorAll("article").length,
  current: document.querySelector('.product-nav-list a[aria-current="page"]')?.textContent?.replace("Current", "").trim() ?? "none",
  lessonWording: /\blessons?\b/i.test(document.querySelector(".public-resource-shell")?.textContent ?? "")
}));
async function axeSerious(page) {
  await page.addScriptTag({ content: axeSource });
  return page.evaluate(async () => {
    const result = await globalThis.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } });
    return result.violations.filter((violation) => ["serious", "critical"].includes(violation.impact)).map((violation) => `${violation.id}(${violation.nodes.length})`);
  });
}
// The banner after the hotfix: brand, six products, call to action, account menu; no Authorize Code item.
const bannerFacts = (page) => page.evaluate(() => {
  const banner = document.querySelector("header.site-header");
  const links = [...(banner?.querySelectorAll("a") ?? [])];
  const products = [...(banner?.querySelectorAll(".product-nav-list a") ?? [])];
  const width = document.documentElement.clientWidth;
  return {
    codeLinks: links.filter((a) => /authorize code/i.test(a.textContent ?? "") || /authorized-access/.test(a.getAttribute("href") ?? "")).length + (banner?.querySelectorAll(".banner-code-link").length ?? 0),
    productLinks: products.length,
    labels: products.map((a) => (a.textContent ?? "").replace("Current", "").trim()).join("|"),
    visible: products.filter((a) => { const rect = a.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 && rect.left >= -0.5 && rect.right <= width + 0.5; }).length
  };
});
async function expectNoBannerCode(page, label) {
  const facts = await bannerFacts(page);
  check(facts.codeLinks === 0 && facts.productLinks === 6 && facts.labels === PRODUCT_LABELS && facts.visible === 6, `${label}: banner has no Authorize Code item (${facts.codeLinks}) and exactly six product links, all on screen (${facts.productLinks}, visible ${facts.visible}: ${facts.labels})`);
  return facts;
}
// Script inventory: every script on the page, by origin. The app ships first-party
// chunks only; anything else (a preview-deployment toolbar, an injected helper) is
// recorded so a console error can be attributed to its source.
async function scriptInventory(page, label) {
  const scripts = await page.evaluate(() => [...document.scripts].map((script) => script.src ? `${new URL(script.src).host}${new URL(script.src).pathname.slice(0, 48)}` : `inline(${(script.textContent ?? "").replace(/\s+/g, " ").slice(0, 48)})`));
  const external = scripts.filter((entry) => !entry.startsWith("inline(") && !entry.startsWith(new URL(page.url()).host));
  note(`scripts ${label}: ${scripts.length} total, ${external.length} third-party${external.length ? ` -> ${external.join(", ")}` : ""}; navigator.storage=${await page.evaluate(() => typeof navigator.storage)}`);
  return external;
}
async function bannerShot(page, name) {
  await page.evaluate(() => document.fonts.ready);
  const box = await page.locator("header.site-header").boundingBox();
  await page.screenshot({ path: `${out}/${name}.png`, clip: { x: 0, y: 0, width: page.viewportSize().width, height: Math.ceil(box.y + box.height + 8) } });
  note(`shot ${name}.png ${new URL(page.url()).pathname}`);
}
// The homepage Authorize Code form: present in every account state. With
// toggle, the field is proven masked by default and the Show/Hide control is
// exercised; a dummy value is typed (never submitted) to prove it reaches
// neither the URL nor web storage, then cleared.
async function authorizeCodeForm(page, label, { toggle = false } = {}) {
  const heading = await page.getByRole("heading", { name: "Authorize Code" }).count();
  const field = page.getByLabel("Code (required)");
  const fields = await field.count();
  const show = await page.getByRole("button", { name: "Show code" }).count();
  check(heading === 1 && fields === 1 && show === 1, `${label}: homepage Authorize Code form present (heading ${heading}, Code field ${fields}, Show code ${show})`);
  if (!toggle || fields !== 1) return;
  const masked = await field.getAttribute("type");
  await page.getByRole("button", { name: "Show code" }).click();
  const shown = await field.getAttribute("type");
  const hide = await page.getByRole("button", { name: "Hide code" }).count();
  await page.getByRole("button", { name: "Hide code" }).click();
  const hidden = await field.getAttribute("type");
  const dummy = "REVIEW-NOT-A-CODE-0000";
  const before = page.url();
  await field.fill(dummy);
  const inStorage = await page.evaluate((value) => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]).includes(value), dummy);
  const inUrl = page.url() !== before || page.url().includes(dummy);
  await field.fill("");
  check(masked === "password" && shown === "text" && hide === 1 && hidden === "password" && !inUrl && !inStorage, `${label}: Code field masked by default, Show code -> ${shown}, Hide code -> ${hidden}; a typed value reaches the URL ${inUrl}, web storage ${inStorage} (never submitted)`);
}
// Every drawn page has ink (at least 0.05% of its pixels are dark: a sparse
// answers page on a 320px phone still has hundreds, a blank canvas none) and
// sits inside the viewport width.
const drawnPages = (page) => page.evaluate(() => [...document.querySelectorAll(".pdf-viewer-pages canvas")].map((canvas) => {
  const context = canvas.getContext("2d");
  if (!context) return { ok: false, ink: -1, fit: false };
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  let ink = 0;
  for (let index = 0; index < data.length; index += 4) if (data[index] < 200 || data[index + 1] < 200 || data[index + 2] < 200) ink += 1;
  const rect = canvas.getBoundingClientRect();
  const fit = rect.width > 0 && rect.left >= -0.5 && rect.right <= document.documentElement.clientWidth + 0.5;
  return { ok: ink > Math.max(50, canvas.width * canvas.height * 0.0005) && fit, ink, fit };
}));
async function previewFacts(page, item, label) {
  try {
    await page.getByRole("status").filter({ hasText: `${item.quiz.pages} pages` }).waitFor({ timeout: 90_000 });
  } catch (error) {
    // Record what the viewer itself says before failing: its status line and any fallback message.
    const viewer = await page.evaluate(() => `status="${document.querySelector(".pdf-viewer-status")?.textContent ?? "-"}" alert="${document.querySelector(".pdf-viewer-fallback")?.textContent?.replace(/\s+/g, " ").slice(0, 160) ?? "-"}" url=${location.pathname}`).catch(() => "unavailable");
    note(`  ${label}: preview ${item.quiz.slug} did not finish loading; viewer ${viewer}`);
    throw error;
  }
  const canvases = await page.locator(".pdf-viewer-pages canvas").count();
  const drawn = await drawnPages(page);
  const facts = await pageFacts(page);
  const embedded = await page.locator("iframe, object, embed").count();
  const stored = await page.evaluate(() => localStorage.length + sessionStorage.length);
  const leaked = /supabase|resource-files|signedUrl|token=/i.test(await page.content());
  check(canvases === item.quiz.pages && drawn.length === item.quiz.pages && drawn.every((entry) => entry.ok) && facts.overflow === 0 && embedded === 0 && stored === 0 && !leaked && new URL(page.url()).pathname.endsWith("/preview"), `${label}: preview ${item.quiz.slug}: ${canvases}/${item.quiz.pages} pages drawn (ink ${drawn.map((entry) => entry.ink).join("/")}, fit ${drawn.every((entry) => entry.fit)}), overflow ${facts.overflow}px, embedded ${embedded}, web storage ${stored}, storage markers ${leaked}`);
}
async function openPreview(page, item, label) {
  // domcontentloaded, not networkidle: the PDF itself streams in after load, and the status line is the real readiness signal.
  // A client-side navigation that is still settling (WebKit after a Link click) can interrupt the first attempt; one retry covers it.
  for (let attempt = 1; ; attempt += 1) {
    try {
      await page.goto(`${origin}/resources/${item.resourceId}/preview`, { waitUntil: "domcontentloaded" });
      break;
    } catch (error) {
      if (attempt >= 2 || !/interrupted by another navigation|net::ERR_ABORTED|Load failed/.test(String(error.message))) throw error;
      note(`  retrying preview navigation for ${item.quiz.slug} after: ${String(error.message).split("\n")[0].slice(0, 120)}`);
      await page.waitForLoadState("load").catch(() => undefined);
      await page.waitForTimeout(1000);
    }
  }
  await previewFacts(page, item, label);
}
// Preview selected from a quiz card: the viewer opens in the page and nothing is downloaded.
async function previewFromCard(page, index, item, label) {
  let downloads = 0;
  const onDownload = () => { downloads += 1; };
  page.on("download", onDownload);
  await settle(page);
  await page.locator("article").nth(index).getByRole("link", { name: "Preview" }).click();
  await page.waitForURL((url) => url.pathname === `/resources/${item.resourceId}/preview`, { timeout: 30_000 });
  await previewFacts(page, item, `${label} (from the card)`);
  await page.waitForTimeout(1500);
  page.off("download", onDownload);
  check(downloads === 0, `${label}: selecting Preview downloads nothing (${downloads} download events)`);
}
// Scroll like a reader (mouse wheel) until the last page of the PDF is on screen.
async function lastPageReachable(page) {
  const viewport = page.viewportSize();
  await page.mouse.move(Math.floor(viewport.width / 2), Math.floor(viewport.height / 2));
  for (let step = 0; step < 80; step += 1) {
    const visible = await page.evaluate(() => {
      const canvases = document.querySelectorAll(".pdf-viewer-pages canvas");
      const last = canvases[canvases.length - 1];
      if (!last) return false;
      const rect = last.getBoundingClientRect();
      return rect.top < window.innerHeight - 40 && rect.bottom > 40;
    });
    if (visible) return true;
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(120);
  }
  return false;
}
// Download PDF from the preview page: the attachment download, the exact owner file, and the preview stays open.
async function downloadFromPreview(page, item, label) {
  await page.evaluate(() => window.scrollTo(0, 0));
  // Let any wheel scrolling come to rest before clicking.
  await page.waitForTimeout(800);
  let download = null;
  for (let attempt = 1; attempt <= 2 && !download; attempt += 1) {
    try {
      [download] = await Promise.all([page.waitForEvent("download", { timeout: 30_000 }), page.getByRole("link", { name: "Download PDF" }).click()]);
    } catch (error) {
      note(`  ${label}: Download PDF attempt ${attempt} produced no download event (${String(error.message).split("\n")[0].slice(0, 100)})`);
      await page.waitForTimeout(1000);
    }
  }
  if (!download) { bad(`${label}: Download PDF produced no download in two attempts`); return; }
  const body = readFileSync(await download.path());
  const sha = createHash("sha256").update(body).digest("hex");
  const name = download.suggestedFilename();
  await download.delete().catch(() => undefined);
  check(sha === item.quiz.sha256 && body.length === item.quiz.bytes && name === item.quiz.downloadFilename && new URL(page.url()).pathname.endsWith("/preview"), `${label}: Download PDF saves ${name} (${body.length} bytes, sha256 ${sha === item.quiz.sha256 ? "== owner file" : "MISMATCH"}); the preview stays open`);
}
// Every quiz at 320 px and 390 px with 200% text (the v1.2.14 finding: the preview
// header grid used to take the width of the title's longest word). Each preview must
// have no horizontal overflow, the title must wrap inside the page, the actions and
// every page must stay on screen and the last page must be reachable. The quiz with
// the longest title word is captured at 320 px and its actions are exercised at 200%.
const LONGEST_TITLE_SLUG = "understanding-and-using-percent-quiz";
async function textZoomReflow(page, live, engineLabel) {
  let maxOverflow = 0;
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const item of live) {
      await openPreview(page, item, `${engineLabel} ${width} (normal text)`);
      await page.evaluate(() => { window.scrollTo(0, 0); document.documentElement.style.fontSize = "200%"; });
      // Larger text narrows the viewer a little; were it 48 px or more, the viewer would re-fit and
      // redraw its pages, so wait until it reports all of them again.
      await page.waitForTimeout(700);
      await page.getByRole("status").filter({ hasText: `${item.quiz.pages} pages` }).waitFor({ timeout: 90_000 });
      for (let wait = 0; wait < 100 && (await page.locator(".pdf-viewer-pages canvas").count()) !== item.quiz.pages; wait += 1) await page.waitForTimeout(200);
      const facts = await page.evaluate(() => {
        const viewport = document.documentElement.clientWidth;
        const inside = (element) => { const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.left >= -0.5 && rect.right <= viewport + 0.5; };
        const title = document.querySelector(".resource-preview-header h1");
        const actions = [...document.querySelectorAll(".resource-preview-actions a")];
        return {
          overflow: document.documentElement.scrollWidth - viewport,
          title: Boolean(title) && inside(title) && title.scrollWidth <= title.clientWidth + 1,
          actions: actions.length === 3 && actions.every((element) => inside(element) && element.getBoundingClientRect().height >= 44)
        };
      });
      const pages = await drawnPages(page);
      const reachable = await lastPageReachable(page);
      maxOverflow = Math.max(maxOverflow, facts.overflow);
      check(facts.overflow === 0 && facts.title && facts.actions && pages.length === item.quiz.pages && pages.every((entry) => entry.fit) && reachable, `${engineLabel} ${width}px + 200% text: ${item.quiz.slug}: overflow ${facts.overflow}px, title wraps inside ${facts.title}, actions on screen ${facts.actions}, ${pages.filter((entry) => entry.fit).length}/${item.quiz.pages} pages within the width, last page reachable ${reachable}`);
      if (width === 320 && item.quiz.slug === LONGEST_TITLE_SLUG) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await shot(page, `26-${engineLabel}-preview-320-text-200-longest-title`);
        await shot(page, `26b-${engineLabel}-preview-320-text-200-longest-title-full`, { fullPage: true });
        const violations = await axeSerious(page);
        check(violations.length === 0, `${engineLabel} axe 320px + 200% text preview: ${violations.join(", ") || "0 serious/critical"}`);
        await downloadFromPreview(page, item, `${engineLabel} 320px + 200% text`);
        await settle(page); await page.getByRole("link", { name: "Back to Quiz PDFs" }).click();
        await page.waitForURL((url) => url.pathname === "/quizzes", { timeout: 30_000 });
        await page.waitForLoadState("load");
        ok(`${engineLabel} 320px + 200% text: Back to Quiz PDFs returns to /quizzes`);
      }
    }
  }
  note(`${engineLabel} 200% text: largest horizontal overflow ${maxOverflow}px across ${live.length} quizzes at 320 and 390 px`);
}
// Keyboard on the preview page: Back to Quiz PDFs, Details, Download PDF in order, each with a visible focus ring.
async function previewKeyboard(page, label) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("link", { name: "Back to Quiz PDFs" }).focus();
  // Leave and re-enter with the keyboard so the focus ring is the keyboard one.
  await page.keyboard.press("Shift+Tab");
  const focused = () => page.evaluate(() => {
    const element = document.activeElement;
    const style = getComputedStyle(element);
    return { text: element.textContent?.trim() ?? "", ring: (style.outlineStyle !== "none" && style.outlineWidth !== "0px") || style.boxShadow !== "none" };
  });
  const order = [];
  for (let step = 0; step < 3; step += 1) { await page.keyboard.press("Tab"); order.push(await focused()); }
  check(order.map((entry) => entry.text).join("|") === "Back to Quiz PDFs|Details|Download PDF" && order.every((entry) => entry.ring), `${label}: keyboard order on the preview page ${order.map((entry) => `${entry.text}:${entry.ring}`).join(", ")}`);
}
// Each banner destination, clicked at phone width: the right link, on screen,
// a real target, and the page it reaches for this account state.
async function productDestinations(page, state, label) {
  for (const [index, [name, href]] of PRODUCTS.entries()) {
    await page.goto(`${origin}/`, { waitUntil: "networkidle" });
    const link = page.locator(".product-nav-list a").nth(index);
    const text = ((await link.textContent()) ?? "").replace("Current", "").trim();
    const target = await link.getAttribute("href");
    const box = await link.boundingBox();
    const viewport = page.viewportSize();
    const onScreen = Boolean(box) && box.x >= 0 && box.x + box.width <= viewport.width + 0.5 && box.y + box.height <= viewport.height && box.height >= 44;
    const expected = state === "anonymous"
      ? (url) => (name === "Home" ? url.host === originHost && url.pathname === "/" : url.host === originHost && url.pathname === "/access" && url.searchParams.get("next") === href)
      : {
        Home: (url) => url.host === originHost && url.pathname === "/",
        "Math Games": (url) => url.host === originHost && url.pathname === "/games",
        "Online Math Prep": (url) => (url.host === originHost ? url.pathname.startsWith("/map-prep") : url.protocol === "https:"),
        "Homework PDFs": (url) => url.host === originHost && url.pathname === "/homework",
        "Quiz PDFs": (url) => url.host === originHost && url.pathname === "/quizzes",
        "Worksheet Generator": (url) => url.href.startsWith(WORKSHEET_GENERATOR_URL)
      }[name];
    await settle(page);
    await link.click();
    if (name !== "Home") await page.waitForURL((url) => expected(url) && url.pathname !== "/", { timeout: 30_000 }).catch(() => undefined);
    await page.waitForLoadState("domcontentloaded").catch(() => undefined);
    await page.waitForTimeout(800);
    const landed = new URL(page.url());
    const notFound = landed.host === originHost ? await page.getByText("This page could not be found").count() : 0;
    check(text === name && target === href && onScreen && expected(landed) && notFound === 0, `${label}: banner "${name}" (${target}, on screen ${onScreen}) -> ${landed.host === originHost ? "" : landed.host}${landed.pathname}${landed.search}`);
  }
}

let users = {};
let reachedEnd = false;
try {
  note(`review origin ${origin} (${isProduction ? "PRODUCTION project" : "staging project"}); engines ${engines.join(", ")}`);
  const health = await fetch(`${origin}/api/health`, { redirect: "manual", headers: { "user-agent": "MathNexa-Quiz-Review/1.0", ...(bypassSecret ? { "x-vercel-protection-bypass": bypassSecret } : {}) } });
  const healthBody = await health.text();
  check(health.status === 200 && /"status":"ready"/.test(healthBody), `health ${health.status} ${healthBody.slice(0, 120)}`);
  if (expectedBuild) check(healthBody.includes(`"build":"${expectedBuild}"`), `health build = ${expectedBuild.slice(0, 7)}`);
  const live = await liveQuizzes();
  check(live.length === grade6.topics.length, `${isProduction ? "production" : "staging"} publishes ${live.length} of ${grade6.topics.length} manifest quizzes`);
  const deep = await verifyQuizPublication({ client: admin, manifest, deep: true });
  for (const item of deep.results) check(item.ok, `database + private storage: Grade ${item.gradeNumber} / Topic ${item.topicSortOrder}: ${item.topic} - ${item.title} ${item.problems.join(",")}${item.detail ? ` [${item.detail.downloadedBytes} bytes, pages ${item.detail.pages}, lesson assignments ${item.detail.lessonAssignments}, bucket public ${item.detail.bucketPublic}]` : ""}`);
  users = { eligible: await user("eligible"), "used-trial": await user("used-trial"), "trial-active": await user("trial-active"), subscribed: await user("subscribed") };

  // 18. Anonymous: gated route, no file exposure, the banner at every width, the Authorize Code form, each destination.
  {
    const { context, page } = await open("anonymous", { width: 1366, height: 900 });
    const landing = await context.request.get(`${origin}/quizzes`, { maxRedirects: 0 });
    check(landing.status() === 307 && (landing.headers().location ?? "").endsWith("/access?next=/quizzes"), `anonymous GET /quizzes -> ${landing.status()} ${landing.headers().location ?? ""}`);
    for (const item of live) {
      const download = await context.request.get(`${origin}/resources/${item.resourceId}/download`, { maxRedirects: 0 });
      check(download.status() === 401 && !(await download.body()).subarray(0, 5).equals(Buffer.from("%PDF-")), `anonymous download ${item.quiz.slug} -> ${download.status()}`);
    }
    const guessed = await context.request.get(`${origin}/content/quiz-pdfs/grade-6/grade-6-ratios-and-rates-quiz.pdf`, { maxRedirects: 0 });
    check(guessed.status() === 404, `stored copy is not a web asset -> ${guessed.status()}`);
    // The preview page and its inline delivery are closed the same way: no bytes, no storage URL.
    for (const item of live) {
      const preview = await context.request.get(`${origin}/resources/${item.resourceId}/preview`, { maxRedirects: 0 });
      const inline = await context.request.get(`${origin}/resources/${item.resourceId}/inline`, { maxRedirects: 0 });
      const inlineBody = await inline.text();
      check(preview.status() === 307 && (preview.headers().location ?? "").endsWith("/access?next=/quizzes") && inline.status() === 401 && inline.headers()["cache-control"] === "no-store" && !inlineBody.startsWith("%PDF-") && !/supabase|signedUrl|token=/i.test(inlineBody), `anonymous preview ${item.quiz.slug} -> ${preview.status()} ${preview.headers().location ?? ""}; inline -> ${inline.status()} (${inline.headers()["cache-control"]})`);
    }
    // In the browser: the preview URL lands in the access flow and shows no PDF.
    {
      let downloads = 0;
      page.on("download", () => { downloads += 1; });
      await page.goto(`${origin}/resources/${live[0].resourceId}/preview`, { waitUntil: "networkidle" });
      const landed = new URL(page.url());
      check(landed.pathname === "/access" && landed.searchParams.get("next") === "/quizzes" && downloads === 0 && (await page.locator(".pdf-viewer-pages canvas").count()) === 0, `anonymous browser opens a preview URL -> ${landed.pathname}${landed.search}; PDF shown: no; downloads ${downloads}`);
    }
    await page.goto(`${origin}/`, { waitUntil: "networkidle" });
    await expectNoBannerCode(page, "anonymous 1366 (home)");
    await scriptInventory(page, "anonymous 1366 (home)");
    await bannerShot(page, "21-banner-anonymous-1366");
    await authorizeCodeForm(page, "anonymous 1366");
    await settle(page); await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Quiz PDFs" }).click();
    await page.waitForURL((u) => u.pathname === "/access", { timeout: 30_000 });
    await page.waitForLoadState("networkidle");
    await expectNoBannerCode(page, "anonymous 1366 (/access)");
    await shot(page, "18-anonymous-1366", { fullPage: true });
    // The anonymous banner (with its call to action) at every review width, and 200% text at 320.
    for (const width of REVIEW_WIDTHS) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
      await page.goto(`${origin}/`, { waitUntil: "networkidle" });
      const overflow = (await pageFacts(page)).overflow;
      await expectNoBannerCode(page, `anonymous ${width} (home, overflow ${overflow}px)`);
      check(overflow === 0, `anonymous ${width}px home: horizontal overflow ${overflow}px`);
      if (width === 320) {
        await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
        await page.waitForTimeout(250);
        const zoomed = await bannerFacts(page);
        const zoomedOverflow = (await pageFacts(page)).overflow;
        check(zoomed.productLinks === 6 && zoomed.visible === 6 && zoomed.codeLinks === 0 && zoomedOverflow === 0, `anonymous 320px at 200% text: six products on screen (${zoomed.visible}), code items ${zoomed.codeLinks}, overflow ${zoomedOverflow}px`);
        await bannerShot(page, "21g-banner-anonymous-320-text-200");
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${origin}/quizzes`, { waitUntil: "networkidle" });
    check(new URL(page.url()).pathname === "/access", `anonymous banner click lands on /access (${new URL(page.url()).pathname}${new URL(page.url()).search})`);
    await shot(page, "18b-anonymous-390", { fullPage: true });
    await page.goto(`${origin}/`, { waitUntil: "networkidle" });
    await expectNoBannerCode(page, "anonymous 390 (home)");
    await bannerShot(page, "21b-banner-anonymous-390");
    await authorizeCodeForm(page, "anonymous 390", { toggle: true });
    const form = await page.locator("#authorized-access").evaluate((element) => { const rect = element.getBoundingClientRect(); return { y: rect.top + window.scrollY, height: rect.height }; });
    await page.screenshot({ path: `${out}/21c-homepage-authorize-code-form-390.png`, fullPage: true, clip: { x: 0, y: Math.max(0, form.y - 16), width: 390, height: form.height + 32 } });
    note("shot 21c-homepage-authorize-code-form-390.png /");
    await productDestinations(page, "anonymous", "anonymous 390");
    await context.close();
  }
  // Signed-in states without access, then the active trial (allowed).
  for (const [state, expectedPath, marker, name] of [
    ["eligible", "/subscription", "Start your free trial", "18c-signed-in-trial-eligible-390"],
    ["used-trial", "/subscription", "Trial ended", "18d-used-trial-390"],
    ["trial-active", "/quizzes", "Quiz PDFs", "19b-active-trial-390"]
  ]) {
    const { context, page } = await open(state, { width: 390, height: 844 });
    await page.waitForLoadState("networkidle");
    const url = new URL(page.url());
    check(url.host === originHost, `${state}: stays on the review host (${url.host})`);
    check(url.pathname === expectedPath && (expectedPath === "/quizzes" || url.searchParams.get("next") === "/quizzes"), `${state}: sign-in with next=/quizzes -> ${url.pathname}${url.search}`);
    check((await page.locator("body").innerText()).includes(marker), `${state}: page shows "${marker}"`);
    await expectNoBannerCode(page, `${state} 390`);
    await shot(page, name, { fullPage: true });
    if (expectedPath === "/subscription") {
      // The preview page and the inline delivery decide exactly like the library and the download.
      await page.goto(`${origin}/resources/${live[0].resourceId}/preview`, { waitUntil: "networkidle" });
      const landed = new URL(page.url());
      check(landed.pathname === "/subscription" && landed.searchParams.get("next") === "/quizzes", `${state}: preview page -> ${landed.pathname}${landed.search}`);
      const inline = await page.request.get(`${origin}/resources/${live[0].resourceId}/inline`, { maxRedirects: 0 });
      check(inline.status() === 401 && !(await inline.text()).startsWith("%PDF-"), `${state}: inline delivery -> ${inline.status()}`);
    } else {
      await openPreview(page, live[1], `${state} 390 (allowed)`);
    }
    await context.close();
  }

  // 1-3, 16-17 + cards: subscriber.
  {
    const { context, page } = await open("subscribed", { width: 1366, height: 900 });
    await page.waitForLoadState("networkidle");
    check(new URL(page.url()).pathname === "/quizzes", `subscriber: sign-in with next=/quizzes -> ${new URL(page.url()).pathname}`);
    await shot(page, "01-landing-1366-subscriber", { fullPage: true });
    check((await page.getByRole("combobox", { name: "Grade" }).locator("option").allTextContents()).join("|") === `Choose a grade|${gradeTitle}`, `grade control offers exactly "${gradeTitle}"`);
    check((await page.getByRole("combobox", { name: "Topic" }).count()) === 0 && (await page.getByRole("combobox", { name: "Lesson" }).count()) === 0, "no Topic or Lesson selector on the quiz page");
    await selectGrade(page);
    const facts = await pageFacts(page);
    check(facts.cards === live.length && facts.overflow === 0 && !facts.lessonWording, `Grade 6 selected: ${facts.cards} cards, overflow ${facts.overflow}px, lesson wording ${facts.lessonWording}, banner current "${facts.current}"`);
    await shot(page, "02-grade-6-selected-1366", { fullPage: true });
    await expectNoBannerCode(page, "subscriber 1366");
    await bannerShot(page, "21d-banner-subscriber-1366");
    const cards = page.locator("article");
    const region = await page.locator(".public-resource-groups").boundingBox();
    await page.screenshot({ path: `${out}/03-all-topic-cards-1366.png`, fullPage: true, clip: { x: 0, y: Math.max(0, region.y - 90), width: 1366, height: region.height + 120 } });
    note("shot 03-all-topic-cards-1366.png");
    const cardNames = ["04-card-ratios-and-rates", "05-card-percent", "06-card-positive-rational-numbers", "07-card-integers-and-rational-numbers", "08-card-expressions", "09-card-equations", "10-card-geometry-measurement", "11-card-data"];
    for (const [index, item] of live.entries()) {
      const card = cards.nth(index);
      // textContent, not innerText: the path label is upper-cased by CSS only.
      const path = (await card.locator(".public-resource-path").textContent())?.trim() ?? "";
      const title = (await card.getByRole("heading", { level: 2 }).textContent())?.trim() ?? "";
      const download = await card.getByRole("link", { name: "Download PDF" }).getAttribute("href");
      const details = await card.getByRole("link", { name: "Details" }).getAttribute("href");
      const preview = await card.getByRole("link", { name: "Preview" }).getAttribute("href");
      const order = (await card.locator(".public-resource-actions a").allTextContents()).map((text) => text.trim()).join("|");
      check(path === `${gradeTitle} / Topic ${item.topicSortOrder}: ${item.topicTitle}` && title === item.quiz.title && preview === `/resources/${item.resourceId}/preview` && download === `/resources/${item.resourceId}/download` && details === `/resources/${item.resourceId}` && order === "Preview|Details|Download PDF", `card ${index + 1}: "${path}" - "${title}" -> ${preview} [${order}]`);
      check((await card.getByText("Quiz PDF", { exact: true }).count()) === 1 && (await card.getByText("Included in PDF").count()) === 1, `card ${index + 1}: Quiz PDF designation + answer key included`);
      await card.scrollIntoViewIfNeeded();
      const box = await card.boundingBox();
      await page.screenshot({ path: `${out}/${cardNames[index]}-1366.png`, clip: { x: box.x - 8, y: box.y - 8, width: box.width + 16, height: box.height + 16 } });
      note(`shot ${cardNames[index]}-1366.png`);
    }
    await shot(page, "16-desktop-1366-first-screen");
    // 12. Downloads through the real route: exact bytes for all eight.
    const countEvents = async () => (await admin.from("resource_download_events").select("id", { count: "exact", head: true }).eq("consumer_user_id", users.subscribed.id)).count ?? 0;
    const before = await countEvents();
    for (const item of live) {
      const response = await page.request.get(`${origin}/resources/${item.resourceId}/download`);
      const body = await response.body();
      const sha = createHash("sha256").update(body).digest("hex");
      check(response.status() === 200 && response.headers()["content-type"] === "application/pdf" && response.headers()["content-disposition"] === `attachment; filename="${item.quiz.downloadFilename}"` && response.headers()["cache-control"] === "private, no-store, max-age=0" && body.length === item.quiz.bytes && sha === item.quiz.sha256, `download ${item.quiz.downloadFilename}: ${response.status()} ${response.headers()["content-type"]} ${response.headers()["content-disposition"]} ${body.length} bytes sha256 ${sha.slice(0, 16)}... ${sha === item.quiz.sha256 ? "== owner file" : "MISMATCH"}`);
      if (live.indexOf(item) === 0) {
        const copy = `${out}/12-downloaded-${item.quiz.downloadFilename}`;
        writeFileSync(copy, body);
        try {
          execFileSync("pdftoppm", ["-f", "1", "-l", "1", "-png", "-r", "70", "-singlefile", copy, `${out}/12-downloaded-pdf-page-1`]);
          execFileSync("pdftoppm", ["-f", String(item.quiz.pages), "-l", String(item.quiz.pages), "-png", "-r", "70", "-singlefile", copy, `${out}/12b-downloaded-pdf-answers-page`]);
          note("shot 12-downloaded-pdf-page-1.png + 12b-downloaded-pdf-answers-page.png (rendered from the bytes served by the target)");
        } catch (error) { note(`  pdftoppm unavailable: ${String(error.message).split("\n")[0]}`); }
      }
    }
    check((await countEvents()) - before === live.length, `download evidence recorded: ${live.length} events`);
    // Inline delivery for the preview: the same bytes, displayed not downloaded, never cached, database-authorized.
    const beforeInline = await countEvents();
    for (const item of live) {
      const response = await page.request.get(`${origin}/resources/${item.resourceId}/inline`);
      const body = await response.body();
      const sha = createHash("sha256").update(body).digest("hex");
      check(response.status() === 200 && !response.headers().location && response.headers()["content-type"] === "application/pdf" && response.headers()["content-disposition"] === `inline; filename="${item.quiz.downloadFilename}"` && response.headers()["cache-control"] === "private, no-store, max-age=0" && body.length === item.quiz.bytes && sha === item.quiz.sha256, `inline ${item.quiz.downloadFilename}: ${response.status()} ${response.headers()["content-disposition"]} ${response.headers()["cache-control"]} ${body.length} bytes ${sha === item.quiz.sha256 ? "== owner file" : "MISMATCH"}`);
    }
    check((await countEvents()) - beforeInline === live.length, `inline delivery evidence recorded: ${live.length} events`);
    // 11. Details page for every quiz; the first one visited through the card.
    await settle(page); await cards.first().getByRole("link", { name: "Details" }).click();
    await page.waitForURL((u) => /^\/resources\/[0-9a-f-]{36}$/.test(u.pathname), { timeout: 30_000 });
    await page.waitForLoadState("networkidle");
    check((await page.locator("h1").innerText()) === live[0].quiz.title && (await page.getByText("Included in PDF").count()) === 1, `details page: h1 "${await page.locator("h1").innerText()}"`);
    await shot(page, "11-pdf-details-1366", { fullPage: true });
    for (const item of live) {
      await page.goto(`${origin}/resources/${item.resourceId}`, { waitUntil: "networkidle" });
      const h1 = (await page.locator("h1").textContent())?.trim() ?? "";
      const previewHref = await page.getByRole("link", { name: "Preview" }).getAttribute("href");
      const downloadHref = await page.getByRole("link", { name: /^Download PDF$/ }).getAttribute("href");
      check(h1 === item.quiz.title && previewHref === `/resources/${item.resourceId}/preview` && downloadHref === `/resources/${item.resourceId}/download`, `details ${item.quiz.slug}: "${h1}" with Preview and Download PDF`);
    }
    await settle(page); await page.getByRole("link", { name: "Back to library" }).click();
    await page.waitForURL((u) => u.pathname === "/quizzes", { timeout: 30_000 });
    ok("Back to library returns to /quizzes");
    // 22-24. Preview: from the card (nothing downloaded), every quiz, Download PDF, keyboard, Back to Quiz PDFs.
    await selectGrade(page);
    await previewFromCard(page, 0, live[0], "subscriber 1366");
    check((await page.locator("h1").innerText()) === live[0].quiz.title && (await page.getByRole("link", { name: "Back to Quiz PDFs" }).getAttribute("href")) === "/quizzes", `preview page from the card: h1 "${await page.locator("h1").innerText()}"`);
    await shot(page, "22-preview-1366-first-screen");
    await shot(page, "22b-preview-1366-full", { fullPage: true });
    check(await lastPageReachable(page), "subscriber 1366: the last page is reachable by scrolling");
    await downloadFromPreview(page, live[0], "subscriber 1366");
    await previewKeyboard(page, "subscriber 1366");
    for (const [index, item] of live.entries()) await openPreview(page, item, `subscriber 1366 #${index + 1}`);
    const previewViolations = await axeSerious(page);
    check(previewViolations.length === 0, `axe 1366 preview: ${previewViolations.join(", ") || "0 serious/critical"}`);
    await settle(page); await page.getByRole("link", { name: "Back to Quiz PDFs" }).click();
    await page.waitForURL((u) => u.pathname === "/quizzes", { timeout: 30_000 });
    ok("Back to Quiz PDFs returns to /quizzes");
    // 13-17: every review width: the home banner and Authorize Code form, the quiz library, a preview.
    const previewShots = { 320: "24-preview-320", 390: "24b-preview-390", 430: "24f-preview-430", 768: "24c-preview-768", 820: "24g-preview-820-ipad", 1920: "24d-preview-1920" };
    const libraryShots = { 320: "14-mobile-320", 375: "13b-mobile-375", 390: "13-mobile-390", 430: "13c-mobile-430", 768: "15-tablet-768", 820: "15b-tablet-820", 1180: "16b-desktop-1180", 1366: "16c-desktop-1366", 1920: "17-desktop-1920" };
    for (const [index, width] of REVIEW_WIDTHS.entries()) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
      await page.goto(`${origin}/`, { waitUntil: "networkidle" });
      const homeOverflow = (await pageFacts(page)).overflow;
      await expectNoBannerCode(page, `subscriber ${width} (home)`);
      check(homeOverflow === 0, `subscriber ${width}px home: horizontal overflow ${homeOverflow}px`);
      await authorizeCodeForm(page, `subscriber ${width}`);
      if (width === 320 || width === 820) await bannerShot(page, width === 320 ? "21e-banner-subscriber-320" : "21f-banner-subscriber-820-ipad");
      await page.goto(`${origin}/quizzes`, { waitUntil: "networkidle" });
      await selectGrade(page);
      const f = await pageFacts(page);
      const clipped = await page.evaluate(() => [...document.querySelectorAll(".public-resource-card h2, .public-resource-path, .public-resource-actions a, .resource-kind-label")]
        .filter((element) => { const rect = element.getBoundingClientRect(); return rect.right > document.documentElement.clientWidth + 0.5 || rect.left < -0.5 || element.scrollWidth > element.clientWidth + 1; }).length);
      const short = width <= 430 ? await page.evaluate(() => [...document.querySelectorAll(".public-resource-actions a, .resource-filter-grid select")].map((element) => Math.round(element.getBoundingClientRect().height)).filter((height) => height < 44).length) : 0;
      const previews = await page.locator(".public-resource-actions a", { hasText: "Preview" }).count();
      check(f.cards === live.length && previews === live.length && f.overflow === 0 && clipped === 0 && short === 0, `${width}px library: ${f.cards} cards, ${previews} Preview buttons, overflow ${f.overflow}px, clipped ${clipped}, short targets ${short}`);
      await shot(page, `${libraryShots[width]}-grade-6`, { fullPage: true });
      if (width === 320) {
        await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
        await page.waitForTimeout(200);
        const zoomed = await pageFacts(page);
        check(zoomed.overflow === 0, `320px library at 200% text: overflow ${zoomed.overflow}px`);
        await shot(page, "14b-mobile-320-text-200", { fullPage: true });
      }
      const item = live[index % live.length];
      await openPreview(page, item, `subscriber ${width}`);
      const previewBanner = await bannerFacts(page);
      const actionsShort = width <= 430 ? await page.evaluate(() => [...document.querySelectorAll(".resource-preview-actions a")].map((element) => Math.round(element.getBoundingClientRect().height)).filter((height) => height < 44).length) : 0;
      const actions = (await page.locator(".resource-preview-actions a").allTextContents()).map((text) => text.trim()).join("|");
      if (previewShots[width]) await shot(page, previewShots[width]);
      const reachable = await lastPageReachable(page);
      check(previewBanner.codeLinks === 0 && previewBanner.productLinks === 6 && previewBanner.visible === 6 && actions === "Back to Quiz PDFs|Details|Download PDF" && actionsShort === 0 && reachable, `${width}px preview ${item.quiz.slug}: banner six (${previewBanner.visible}) no code item (${previewBanner.codeLinks}), actions ${actions}, short targets ${actionsShort}, last page reachable ${reachable}`);
      if (width === 390) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await shot(page, "24b2-preview-390-full", { fullPage: true });
        // A full-page capture changes the emulated viewport for a moment; the viewer must settle on its pages afterwards and stay there.
        const samples = [];
        for (let sample = 0; sample < 4; sample += 1) {
          await page.waitForTimeout(1000);
          samples.push(`${(await page.getByRole("status").textContent())?.trim() ?? ""}/${await page.locator(".pdf-viewer-pages canvas").count()}`);
        }
        check(samples.slice(1).every((entry) => entry === `${item.quiz.pages} pages/${item.quiz.pages}`), `390px preview after the full-page capture settles and stays: ${samples.join(", ")}`);
        const violations = await axeSerious(page);
        check(violations.length === 0, `axe 390 preview: ${violations.join(", ") || "0 serious/critical"}`);
      }
    }
    await textZoomReflow(page, live, "chromium");
    await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto(`${origin}/quizzes`, { waitUntil: "networkidle" });
    await selectGrade(page);
    check((await pageFacts(page)).cards === live.length, "forced colors: cards render");
    await openPreview(page, live[2], "forced colors 1366");
    await page.emulateMedia({ forcedColors: "none", reducedMotion: "no-preference" });
    for (const width of [1366, 390]) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      await page.goto(`${origin}/quizzes`, { waitUntil: "networkidle" });
      const landingViolations = await axeSerious(page);
      check(landingViolations.length === 0, `axe ${width} landing: ${landingViolations.join(", ") || "0 serious/critical"}`);
      await selectGrade(page);
      const selectedViolations = await axeSerious(page);
      check(selectedViolations.length === 0, `axe ${width} grade selected: ${selectedViolations.join(", ") || "0 serious/critical"}`);
    }
    await page.getByRole("combobox", { name: "Grade" }).focus();
    const reached = new Map();
    for (let step = 0; step < 8 && reached.size < 3; step += 1) {
      await page.keyboard.press("Tab");
      const focused = await page.evaluate(() => {
        const element = document.activeElement;
        if (!element) return null;
        const style = getComputedStyle(element);
        return { text: element.textContent?.trim() ?? "", ring: (style.outlineStyle !== "none" && style.outlineWidth !== "0px") || style.boxShadow !== "none" };
      });
      if (focused && ["Preview", "Details", "Download PDF"].includes(focused.text) && !reached.has(focused.text)) reached.set(focused.text, focused.ring);
    }
    check([...reached.keys()].join(",") === "Preview,Details,Download PDF" && [...reached.values()].every(Boolean), `keyboard: Tab reaches Preview, Details and Download PDF in order with a visible focus ring (${[...reached.entries()].map(([k, v]) => `${k}:${v}`).join(", ")})`);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${origin}/quizzes`, { waitUntil: "networkidle" });
    await selectGrade(page);
    await shot(page, "19-subscriber-390-first-screen");
    await productDestinations(page, "subscribed", "subscriber 390");
    await context.close();
  }
  // WebKit (the iPhone engine): the banner and the Authorize Code form, the
  // preview gate, then a subscriber at 390: Preview from the card (nothing
  // downloaded), every page reachable, Download PDF, Back to Quiz PDFs, all eight.
  // The keyboard walk is Chromium-only: the Windows WebKit test build never
  // Tab-focuses links from a form control.
  if (engines.includes("webkit")) {
    const webkit = await playwright.webkit.launch();
    try {
      {
        const { context, page } = await open("anonymous", { width: 390, height: 844 }, webkit, "webkit");
        await page.goto(`${origin}/`, { waitUntil: "networkidle" });
        await expectNoBannerCode(page, "webkit anonymous 390 (home)");
        await authorizeCodeForm(page, "webkit anonymous 390", { toggle: true });
        let downloads = 0;
        page.on("download", () => { downloads += 1; });
        await page.goto(`${origin}/resources/${live[0].resourceId}/preview`, { waitUntil: "networkidle" });
        const landed = new URL(page.url());
        check(landed.pathname === "/access" && landed.searchParams.get("next") === "/quizzes" && downloads === 0 && (await page.locator(".pdf-viewer-pages canvas").count()) === 0, `webkit anonymous opens a preview URL -> ${landed.pathname}${landed.search}; PDF shown: no; downloads ${downloads}`);
        await context.close();
      }
      const { context, page } = await open("subscribed", { width: 1366, height: 900 }, webkit, "webkit");
      await page.waitForLoadState("networkidle");
      check(new URL(page.url()).pathname === "/quizzes", `webkit subscriber: sign-in with next=/quizzes -> ${new URL(page.url()).pathname}`);
      for (const width of [1366, 390]) {
        await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
        await page.goto(`${origin}/quizzes`, { waitUntil: "networkidle" });
        const landingViolations = await axeSerious(page);
        check(landingViolations.length === 0, `webkit axe ${width} landing: ${landingViolations.join(", ") || "0 serious/critical"}`);
        await selectGrade(page);
        const facts = await pageFacts(page);
        const previews = await page.locator(".public-resource-actions a", { hasText: "Preview" }).count();
        check(facts.cards === live.length && previews === live.length && facts.overflow === 0 && !facts.lessonWording, `webkit ${width}px: ${facts.cards} cards, ${previews} Preview buttons, overflow ${facts.overflow}px, lesson wording ${facts.lessonWording}`);
        const selectedViolations = await axeSerious(page);
        check(selectedViolations.length === 0, `webkit axe ${width} grade selected: ${selectedViolations.join(", ") || "0 serious/critical"}`);
        if (width === 390) await shot(page, "20-webkit-390-grade-6", { fullPage: true });
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${origin}/`, { waitUntil: "networkidle" });
      await expectNoBannerCode(page, "webkit 390 (home)");
      await scriptInventory(page, "webkit 390 (home)");
      await bannerShot(page, "25-webkit-390-banner");
      await page.goto(`${origin}/quizzes`, { waitUntil: "networkidle" });
      await selectGrade(page);
      await previewFromCard(page, 0, live[0], "webkit 390");
      await shot(page, "25b-webkit-390-preview");
      await shot(page, "25c-webkit-390-preview-full", { fullPage: true });
      check(await lastPageReachable(page), "webkit 390: every page reachable by scrolling (the last page brought on screen with the scroll wheel)");
      await shot(page, "25d-webkit-390-preview-last-page");
      const webkitPreviewViolations = await axeSerious(page);
      check(webkitPreviewViolations.length === 0, `webkit axe 390 preview: ${webkitPreviewViolations.join(", ") || "0 serious/critical"}`);
      await downloadFromPreview(page, live[0], "webkit 390");
      await settle(page); await page.getByRole("link", { name: "Back to Quiz PDFs" }).click();
      await page.waitForURL((u) => u.pathname === "/quizzes", { timeout: 30_000 });
      await page.waitForLoadState("load");
      ok("webkit: Back to Quiz PDFs returns to /quizzes");
      for (const item of live.slice(1)) await openPreview(page, item, "webkit 390");
      await textZoomReflow(page, live, "webkit");
      note("webkit keyboard walk: not run (documented Windows WebKit sequential-focus policy; verified in Chromium above)");
      await context.close();
    } finally { await webkit.close(); }
  }
  reachedEnd = true;
} catch (error) {
  bad(`review stopped early: ${String(error?.message ?? error).split("\n")[0].slice(0, 200)}`);
  throw error;
} finally {
  summarizeErrors();
  await browser.close();
  // Download evidence written by the review's own accounts (downloads, inline
  // deliveries behind every preview); the account deletion below removes the
  // identity from these rows (on delete set null), the counts stay.
  if (created.length) {
    const evidenceRows = await admin.from("resource_download_events").select("id", { count: "exact", head: true }).in("consumer_user_id", created);
    note(`evidence: the review's synthetic accounts recorded ${evidenceRows.count ?? "?"} resource_download_events rows (downloads + preview inline deliveries)`);
  }
  for (const id of created) await admin.auth.admin.deleteUser(id).catch((error) => note(`cleanup: could not delete synthetic account ${id}: ${error.message}`));
  note(`cleanup: ${created.length} synthetic ${isProduction ? "production" : "staging"} accounts deleted`);
  const summary = `SUMMARY ok=${results.filter(Boolean).length} fail=${results.filter((r) => !r).length}${reachedEnd ? "" : " (run did not reach the end)"}`;
  note(summary);
  writeFileSync(`${out}/NOTES.txt`, notes.join("\n"));
  process.exitCode = reachedEnd && results.every(Boolean) ? 0 : 1;
}

// Always runs, even when a step threw, so the console evidence is never lost.
function summarizeErrors() {
  check(serverErrors.length === 0, `no 5xx responses (${serverErrors.length ? serverErrors.join("; ") : "0"})`);
  note(`resource-route refusals seen by the pages: ${resourceRefusals.length}`);
  for (const entry of resourceRefusals) note(`  ${entry}`);
  // Console and page errors, classified. Only errors raised by the app fail the run:
  //   toolbar  - raised by vercel.live, the feedback toolbar Vercel injects into
  //              PREVIEW deployments (never present on production);
  //   aborted  - resource loads cancelled by the review's own navigations;
  //   rsc      - React Server Components fetches that failed; counted as preview
  //              noise ONLY when the same run recorded an RSC request redirected
  //              off the review host (deployment protection), else an app error;
  //   app      - everything else.
  const classify = (entry) => (/vercel\.live/.test(entry.text) ? "toolbar" : /net::ERR_ABORTED/.test(entry.text) ? "aborted" : /Failed to fetch RSC payload|_rsc=/.test(entry.text) ? "rsc" : "app");
  const groups = { toolbar: [], aborted: [], rsc: [], app: [] };
  for (const entry of consoleErrors) groups[classify(entry)].push(entry);
  const offHostRscRedirects = [...rscEvidence.redirects].filter((entry) => !entry.endsWith(`-> ${originHost}`));
  const rscExplained = groups.rsc.length === 0 || offHostRscRedirects.length > 0;
  const byEngine = (entries) => ["chromium", "webkit"].map((engine) => `${engine} ${entries.filter((entry) => entry.engine === engine).length}`).join(", ");
  note(`console/page errors: toolbar ${groups.toolbar.length} (${byEngine(groups.toolbar)}), aborted ${groups.aborted.length} (${byEngine(groups.aborted)}), rsc ${groups.rsc.length} (${byEngine(groups.rsc)}), app ${groups.app.length} (${byEngine(groups.app)})`);
  for (const [name, entries] of Object.entries(groups)) for (const entry of entries.slice(0, name === "rsc" ? 20 : 3)) note(`  ${name} e.g. [${entry.engine} ${entry.kind} ${entry.path}] after "${entry.after}": ${entry.text.slice(0, 200)}`);
  note(`rsc evidence: ${rscEvidence.redirects.size} redirected RSC responses (${offHostRscRedirects.length} off the review host)${rscEvidence.redirects.size ? `: ${[...rscEvidence.redirects].slice(0, 6).join("; ")}` : ""}; ${rscEvidence.failures.size} failed RSC requests${rscEvidence.failures.size ? `: ${[...rscEvidence.failures].slice(0, 6).join("; ")}` : ""}`);
  if (groups.toolbar.length) note(`ignored ${groups.toolbar.length} error(s) raised by the Vercel preview toolbar script (vercel.live)`);
  if (groups.rsc.length && rscExplained) note(`ignored ${groups.rsc.length} RSC fetch failure message(s): the run recorded RSC requests redirected off the review host (deployment protection)`);
  check(groups.app.length === 0 && rscExplained, `no console/page errors from the app (app ${groups.app.length}${groups.rsc.length ? `; rsc ${groups.rsc.length} ${rscExplained ? "explained by off-host redirects" : "UNEXPLAINED"}` : ""})`);
}
