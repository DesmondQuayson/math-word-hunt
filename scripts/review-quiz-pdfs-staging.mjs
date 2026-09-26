// Quiz PDFs V1 - real-browser owner review against a STAGING deployment.
//
// Runs only through scripts/invoke-quiz-pdfs-staging.ps1 -Stage review, which
// supplies STAGING_ORIGIN, the Vercel protection-bypass entry and the staging
// Supabase service credential from the process-only vault. Synthetic consumer
// accounts (fresh, used-trial, active-trial, subscriber) are created on the
// staging project, exercised through the real sign-in, and deleted at the end.
// Secrets are never printed; the bypass value travels only in request headers.
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

// Which quizzes are live on staging (resource ids by manifest slug, topic order from the database).
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
    if (!assignment) throw new Error(`quiz ${topic.quiz.slug} is not published on staging`);
    const dbTopic = topics.data.find((row) => row.id === assignment.topic_id);
    return { resourceId: assignment.resource_id, topicId: assignment.topic_id, topicSortOrder: dbTopic?.sort_order ?? null, topicTitle: dbTopic?.title ?? null, quiz: topic.quiz };
  }).sort((left, right) => left.topicSortOrder - right.topicSortOrder);
}

const browser = await chromium.launch();
const serverErrors = [];
const consoleErrors = [];
function observe(page) {
  page.on("response", (response) => { if (response.status() >= 500) serverErrors.push(`${response.status()} ${new URL(response.url()).pathname}`); });
  page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${String(error).slice(0, 160)} [${new URL(page.url()).pathname}; stack: ${String(error.stack ?? "").replace(/\s+/g, " ").slice(0, 160)}]`));
  page.on("console", (message) => {
    const text = message.text();
    // Aborted RSC prefetches during our own navigations are harness noise, not application errors.
    if (message.type() === "error" && !/_rsc=|Failed to load resource: net::ERR_ABORTED|Fetch API cannot load/.test(text)) consoleErrors.push(`console: ${text.slice(0, 160)}`);
  });
}
async function open(state, viewport, engine = browser) {
  const context = await engine.newContext({ viewport, bypassCSP: true, ...(bypassSecret ? { extraHTTPHeaders: { "x-vercel-protection-bypass": bypassSecret } } : {}) });
  const page = await context.newPage();
  observe(page);
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
  return {
    codeLinks: links.filter((a) => /authorize code/i.test(a.textContent ?? "") || /authorized-access/.test(a.getAttribute("href") ?? "")).length + (banner?.querySelectorAll(".banner-code-link").length ?? 0),
    productLinks: banner?.querySelectorAll(".product-nav-list a").length ?? 0
  };
});
async function expectNoBannerCode(page, label) {
  const facts = await bannerFacts(page);
  check(facts.codeLinks === 0 && facts.productLinks === 6, `${label}: banner has no Authorize Code item (${facts.codeLinks}) and exactly six product links (${facts.productLinks})`);
}
// Script inventory: every script on the page, by origin. The app ships first-party
// chunks only; anything else (a preview-deployment toolbar, an injected helper) is
// recorded so a console error can be attributed to its source.
async function scriptInventory(page, label) {
  const scripts = await page.evaluate(() => [...document.scripts].map((script) => script.src ? `${new URL(script.src).host}${new URL(script.src).pathname.slice(0, 48)}` : `inline(${(script.textContent ?? "").replace(/\s+/g, " ").slice(0, 48)})`));
  const external = scripts.filter((entry) => !entry.startsWith("inline(") && !entry.startsWith(new URL(page.url()).host));
  note(`scripts ${label}: ${scripts.length} total, ${external.length} third-party${external.length ? ` -> ${external.join(", ")}` : ""}; navigator.storage=${await page.evaluate(() => typeof navigator.storage)}`);
}
async function bannerShot(page, name) {
  await page.evaluate(() => document.fonts.ready);
  const box = await page.locator("header.site-header").boundingBox();
  await page.screenshot({ path: `${out}/${name}.png`, clip: { x: 0, y: 0, width: page.viewportSize().width, height: Math.ceil(box.y + box.height + 8) } });
  note(`shot ${name}.png ${new URL(page.url()).pathname}`);
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
  await page.getByRole("status").filter({ hasText: `${item.quiz.pages} pages` }).waitFor({ timeout: 90_000 });
  const canvases = await page.locator(".pdf-viewer-pages canvas").count();
  const drawn = await drawnPages(page);
  const facts = await pageFacts(page);
  const embedded = await page.locator("iframe, object, embed").count();
  const stored = await page.evaluate(() => localStorage.length + sessionStorage.length);
  const leaked = /supabase|resource-files|signedUrl|token=/i.test(await page.content());
  check(canvases === item.quiz.pages && drawn.length === item.quiz.pages && drawn.every((entry) => entry.ok) && facts.overflow === 0 && embedded === 0 && stored === 0 && !leaked && new URL(page.url()).pathname.endsWith("/preview"), `${label}: preview ${item.quiz.slug}: ${canvases}/${item.quiz.pages} pages drawn (ink ${drawn.map((entry) => entry.ink).join("/")}, fit ${drawn.every((entry) => entry.fit)}), overflow ${facts.overflow}px, embedded ${embedded}, web storage ${stored}, storage markers ${leaked}`);
}

let users = {};
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

  // 18. Anonymous: gated route, no file exposure.
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
      check(preview.status() === 307 && (preview.headers().location ?? "").endsWith("/access?next=/quizzes") && inline.status() === 401 && !inlineBody.startsWith("%PDF-") && !/supabase|signedUrl|token=/i.test(inlineBody), `anonymous preview ${item.quiz.slug} -> ${preview.status()} ${preview.headers().location ?? ""}; inline -> ${inline.status()}`);
    }
    await page.goto(`${origin}/`, { waitUntil: "networkidle" });
    await expectNoBannerCode(page, "anonymous 1366 (home)");
    await scriptInventory(page, "anonymous 1366 (home)");
    await bannerShot(page, "21-banner-anonymous-1366");
    check((await page.getByRole("heading", { name: "Authorize Code" }).count()) === 1 && (await page.getByLabel("Code (required)").count()) === 1 && (await page.getByRole("button", { name: "Show code" }).count()) === 1, "homepage keeps the Authorize Code form (heading, Code field, Show code)");
    await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Quiz PDFs" }).click();
    await page.waitForURL((u) => u.pathname === "/access", { timeout: 30_000 });
    await page.waitForLoadState("networkidle");
    await expectNoBannerCode(page, "anonymous 1366 (/access)");
    await shot(page, "18-anonymous-1366", { fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${origin}/quizzes`, { waitUntil: "networkidle" });
    check(new URL(page.url()).pathname === "/access", `anonymous banner click lands on /access (${new URL(page.url()).pathname}${new URL(page.url()).search})`);
    await shot(page, "18b-anonymous-390", { fullPage: true });
    await page.goto(`${origin}/`, { waitUntil: "networkidle" });
    await expectNoBannerCode(page, "anonymous 390 (home)");
    await bannerShot(page, "21b-banner-anonymous-390");
    const form = await page.locator("#authorized-access").evaluate((element) => { const rect = element.getBoundingClientRect(); return { y: rect.top + window.scrollY, height: rect.height }; });
    await page.screenshot({ path: `${out}/21c-homepage-authorize-code-form-390.png`, fullPage: true, clip: { x: 0, y: Math.max(0, form.y - 16), width: 390, height: form.height + 32 } });
    note("shot 21c-homepage-authorize-code-form-390.png /");
    await context.close();
  }
  // Signed-in states without access, then entitled states.
  for (const [state, expectedPath, marker, name] of [
    ["eligible", "/subscription", "Start your free trial", "18c-signed-in-trial-eligible-390"],
    ["used-trial", "/subscription", "Trial ended", "18d-used-trial-390"],
    ["trial-active", "/quizzes", "Quiz PDFs", "19b-active-trial-390"]
  ]) {
    const { context, page } = await open(state, { width: 390, height: 844 });
    await page.waitForLoadState("networkidle");
    const url = new URL(page.url());
    check(url.host === new URL(origin).host, `${state}: stays on the staging host (${url.host})`);
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
      check(response.status() === 200 && response.headers()["content-type"] === "application/pdf" && response.headers()["content-disposition"] === `attachment; filename="${item.quiz.downloadFilename}"` && body.length === item.quiz.bytes && sha === item.quiz.sha256, `download ${item.quiz.downloadFilename}: ${response.status()} ${response.headers()["content-type"]} ${body.length} bytes sha256 ${sha.slice(0, 16)}... ${sha === item.quiz.sha256 ? "== owner file" : "MISMATCH"}`);
      if (live.indexOf(item) === 0) {
        writeFileSync(`${out}/12-downloaded-${item.quiz.downloadFilename}`, body);
        try {
          execFileSync("pdftoppm", ["-f", "1", "-l", "1", "-png", "-r", "70", "-singlefile", `${out}/12-downloaded-${item.quiz.downloadFilename}`, `${out}/12-downloaded-pdf-page-1`]);
          execFileSync("pdftoppm", ["-f", String(item.quiz.pages), "-l", String(item.quiz.pages), "-png", "-r", "70", "-singlefile", `${out}/12-downloaded-${item.quiz.downloadFilename}`, `${out}/12b-downloaded-pdf-answers-page`]);
          note("shot 12-downloaded-pdf-page-1.png + 12b-downloaded-pdf-answers-page.png (rendered from the bytes served by staging)");
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
      check(response.status() === 200 && response.headers()["content-type"] === "application/pdf" && response.headers()["content-disposition"] === `inline; filename="${item.quiz.downloadFilename}"` && response.headers()["cache-control"] === "private, no-store, max-age=0" && body.length === item.quiz.bytes && sha === item.quiz.sha256, `inline ${item.quiz.downloadFilename}: ${response.status()} ${response.headers()["content-disposition"]} ${response.headers()["cache-control"]} ${body.length} bytes ${sha === item.quiz.sha256 ? "== owner file" : "MISMATCH"}`);
    }
    check((await countEvents()) - beforeInline === live.length, `inline delivery evidence recorded: ${live.length} events`);
    // 11. Details page.
    await cards.first().getByRole("link", { name: "Details" }).click();
    await page.waitForURL((u) => /^\/resources\/[0-9a-f-]{36}$/.test(u.pathname), { timeout: 30_000 });
    await page.waitForLoadState("networkidle");
    check((await page.locator("h1").innerText()) === live[0].quiz.title && (await page.getByText("Included in PDF").count()) === 1, `details page: h1 "${await page.locator("h1").innerText()}"`);
    check((await page.getByRole("link", { name: "Preview" }).getAttribute("href")) === `/resources/${live[0].resourceId}/preview`, "details page offers Preview");
    await shot(page, "11-pdf-details-1366", { fullPage: true });
    await page.getByRole("link", { name: "Back to library" }).click();
    await page.waitForURL((u) => u.pathname === "/quizzes", { timeout: 30_000 });
    ok("Back to library returns to /quizzes");
    // 22-24. Preview: from the card to the in-app viewer, every quiz, widths, then Back to Quiz PDFs.
    await selectGrade(page);
    await cards.first().getByRole("link", { name: "Preview" }).click();
    await page.waitForURL((u) => /^\/resources\/[0-9a-f-]{36}\/preview$/.test(u.pathname), { timeout: 30_000 });
    await page.getByRole("status").filter({ hasText: `${live[0].quiz.pages} pages` }).waitFor({ timeout: 90_000 });
    check((await page.locator("h1").innerText()) === live[0].quiz.title && (await page.getByRole("link", { name: "Back to Quiz PDFs" }).getAttribute("href")) === "/quizzes", `preview page from the card: h1 "${await page.locator("h1").innerText()}"`);
    await shot(page, "22-preview-1366-first-screen");
    await shot(page, "22b-preview-1366-full", { fullPage: true });
    for (const [index, item] of live.entries()) await openPreview(page, item, `subscriber 1366 #${index + 1}`);
    const previewViolations = await axeSerious(page);
    check(previewViolations.length === 0, `axe 1366 preview: ${previewViolations.join(", ") || "0 serious/critical"}`);
    await page.getByRole("link", { name: "Back to Quiz PDFs" }).click();
    await page.waitForURL((u) => u.pathname === "/quizzes", { timeout: 30_000 });
    ok("Back to Quiz PDFs returns to /quizzes");
    for (const width of [320, 390, 768, 1920]) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
      await openPreview(page, live[0], `subscriber ${width}`);
      const short = width <= 430 ? await page.evaluate(() => [...document.querySelectorAll(".resource-preview-actions a")].map((element) => Math.round(element.getBoundingClientRect().height)).filter((height) => height < 44).length) : 0;
      check(short === 0, `${width}px preview: short targets ${short}`);
      await shot(page, { 320: "24-preview-320", 390: "24b-preview-390", 768: "24c-preview-768", 1920: "24d-preview-1920" }[width]);
      if (width === 390) {
        await shot(page, "24b2-preview-390-full", { fullPage: true });
        // A full-page capture changes the emulated viewport for a moment; the viewer must settle on its pages afterwards and stay there.
        const samples = [];
        for (let sample = 0; sample < 4; sample += 1) {
          await page.waitForTimeout(1000);
          samples.push(`${(await page.getByRole("status").textContent())?.trim() ?? ""}/${await page.locator(".pdf-viewer-pages canvas").count()}`);
        }
        check(samples.slice(1).every((entry) => entry === `${live[0].quiz.pages} pages/${live[0].quiz.pages}`), `390px preview after the full-page capture settles and stays: ${samples.join(", ")}`);
        const violations = await axeSerious(page);
        check(violations.length === 0, `axe 390 preview: ${violations.join(", ") || "0 serious/critical"}`);
      }
    }
    await page.setViewportSize({ width: 1366, height: 900 });
    // 13-17: widths, 200% text, forced colors, axe, keyboard.
    for (const width of REVIEW_WIDTHS) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
      await page.goto(`${origin}/quizzes`, { waitUntil: "networkidle" });
      await selectGrade(page);
      const f = await pageFacts(page);
      const clipped = await page.evaluate(() => [...document.querySelectorAll(".public-resource-card h2, .public-resource-path, .public-resource-actions a, .resource-kind-label")]
        .filter((element) => { const rect = element.getBoundingClientRect(); return rect.right > document.documentElement.clientWidth + 0.5 || rect.left < -0.5 || element.scrollWidth > element.clientWidth + 1; }).length);
      const short = width <= 430 ? await page.evaluate(() => [...document.querySelectorAll(".public-resource-actions a, .resource-filter-grid select")].map((element) => Math.round(element.getBoundingClientRect().height)).filter((height) => height < 44).length) : 0;
      check(f.cards === live.length && f.overflow === 0 && clipped === 0 && short === 0, `${width}px: ${f.cards} cards, overflow ${f.overflow}px, clipped ${clipped}, short targets ${short}`);
      const name = { 320: "14-mobile-320", 375: "13b-mobile-375", 390: "13-mobile-390", 430: "13c-mobile-430", 768: "15-tablet-768", 820: "15b-tablet-820", 1180: "16b-desktop-1180", 1366: "16c-desktop-1366", 1920: "17-desktop-1920" }[width];
      await shot(page, `${name}-grade-6`, { fullPage: true });
      if (width === 320) {
        await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
        await page.waitForTimeout(200);
        const zoomed = await pageFacts(page);
        check(zoomed.overflow === 0, `320px at 200% text: overflow ${zoomed.overflow}px`);
        await shot(page, "14b-mobile-320-text-200", { fullPage: true });
      }
    }
    await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto(`${origin}/quizzes`, { waitUntil: "networkidle" });
    await selectGrade(page);
    check((await pageFacts(page)).cards === live.length, "forced colors: cards render");
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
    await context.close();
  }
  // WebKit: render, cards, overflow and axe (the keyboard walk is Chromium-only:
  // the Windows WebKit test build never Tab-focuses links from a form control).
  if (engines.includes("webkit")) {
    const webkit = await playwright.webkit.launch();
    try {
      const { context, page } = await open("subscribed", { width: 1366, height: 900 }, webkit);
      await page.waitForLoadState("networkidle");
      check(new URL(page.url()).pathname === "/quizzes", `webkit subscriber: sign-in with next=/quizzes -> ${new URL(page.url()).pathname}`);
      for (const width of [1366, 390]) {
        await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
        await page.goto(`${origin}/quizzes`, { waitUntil: "networkidle" });
        const landingViolations = await axeSerious(page);
        check(landingViolations.length === 0, `webkit axe ${width} landing: ${landingViolations.join(", ") || "0 serious/critical"}`);
        await selectGrade(page);
        const facts = await pageFacts(page);
        check(facts.cards === live.length && facts.overflow === 0 && !facts.lessonWording, `webkit ${width}px: ${facts.cards} cards, overflow ${facts.overflow}px, lesson wording ${facts.lessonWording}`);
        const selectedViolations = await axeSerious(page);
        check(selectedViolations.length === 0, `webkit axe ${width} grade selected: ${selectedViolations.join(", ") || "0 serious/critical"}`);
        if (width === 390) await shot(page, "20-webkit-390-grade-6", { fullPage: true });
      }
      // iOS Safari / WebKit at phone width: no Authorize Code in the banner, the preview page shows the PDF in place (no download), Back to Quiz PDFs works.
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${origin}/`, { waitUntil: "networkidle" });
      await expectNoBannerCode(page, "webkit 390 (home)");
      await scriptInventory(page, "webkit 390 (home)");
      await bannerShot(page, "25-webkit-390-banner");
      await openPreview(page, live[0], "webkit 390");
      await shot(page, "25b-webkit-390-preview");
      await shot(page, "25c-webkit-390-preview-full", { fullPage: true });
      const webkitPreviewViolations = await axeSerious(page);
      check(webkitPreviewViolations.length === 0, `webkit axe 390 preview: ${webkitPreviewViolations.join(", ") || "0 serious/critical"}`);
      await page.getByRole("link", { name: "Back to Quiz PDFs" }).click();
      await page.waitForURL((u) => u.pathname === "/quizzes", { timeout: 30_000 });
      await page.waitForLoadState("load");
      ok("webkit: Back to Quiz PDFs returns to /quizzes");
      for (const item of live.slice(1)) await openPreview(page, item, "webkit 390");
      note("webkit keyboard walk: not run (documented Windows WebKit sequential-focus policy; verified in Chromium above)");
      await context.close();
    } finally { await webkit.close(); }
  }
  check(serverErrors.length === 0, `no 5xx responses (${serverErrors.length ? serverErrors.join("; ") : "0"})`);
  // Vercel injects its feedback toolbar (vercel.live) into PREVIEW deployments only;
  // on the Windows WebKit test build that script rejects on navigator.storage. It is
  // not the app's code and never exists on production (the production pages carry
  // first-party scripts only), so its errors are recorded, not counted.
  const toolbarErrors = consoleErrors.filter((entry) => /vercel\.live/.test(entry));
  // On the protected preview, WebKit's fetch of a React Server Components payload
  // (?_rsc=) can be refused by the deployment protection; Next then performs the
  // same navigation as a full document load, which the checks above proved landed.
  // Those messages are recorded here and not counted as application errors.
  const rscFallbacks = consoleErrors.filter((entry) => !/vercel\.live/.test(entry) && /_rsc=|Failed to fetch RSC payload|Fetch API cannot load/.test(entry));
  const appErrors = consoleErrors.filter((entry) => !toolbarErrors.includes(entry) && !rscFallbacks.includes(entry));
  if (toolbarErrors.length) note(`ignored ${toolbarErrors.length} error(s) raised by the Vercel preview toolbar script (vercel.live), e.g. ${toolbarErrors[0].slice(0, 200)}`);
  if (rscFallbacks.length) note(`ignored ${rscFallbacks.length} RSC payload fetch fallback message(s) on the protected preview (the navigations themselves landed), e.g. ${rscFallbacks[0].slice(0, 200)}`);
  check(appErrors.length === 0, `no console/page errors from the app (${appErrors.length ? appErrors.slice(0, 5).join("; ") : "0"})`);
} finally {
  await browser.close();
  for (const id of created) await admin.auth.admin.deleteUser(id).catch((error) => note(`cleanup: could not delete synthetic account ${id}: ${error.message}`));
  note(`cleanup: ${created.length} synthetic staging accounts deleted`);
  const summary = `SUMMARY ok=${results.filter(Boolean).length} fail=${results.filter((r) => !r).length}`;
  note(summary);
  writeFileSync(`${out}/NOTES.txt`, notes.join("\n"));
  process.exitCode = results.every(Boolean) ? 0 : 1;
}
