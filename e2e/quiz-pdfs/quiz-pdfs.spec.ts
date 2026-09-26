/**
 * Quiz PDFs V1 - browser certification against the local production-platform
 * rehearsal. The runner (scripts/run-quiz-pdfs-e2e.mjs) publishes the owner's
 * quiz manifest into the local content database first; this spec proves what
 * an anonymous visitor, a signed-in non-subscriber, a used-trial account and
 * an entitled account actually get, that every download is the byte-identical
 * approved PDF, and that the page stays clean at every review width.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

type ManifestQuiz = { slug: string; title: string; downloadFilename: string; sha256: string; bytes: number };
type ManifestTopic = { sortOrder: number; title: string; slug: string; quiz: ManifestQuiz };
type Manifest = { grades: { gradeNumber: number; title: string; topics: ManifestTopic[] }[] };
type LiveQuiz = { resourceId: string; topicId: string; topicSortOrder: number; topicTitle: string; quiz: ManifestQuiz };
type AxeApi = { run: (context: Document, options: unknown) => Promise<{ violations: Array<{ id: string; impact: string; nodes: Array<{ target: string[] }> }> }> };

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const manifest = JSON.parse(readFileSync(fileURLToPath(new URL("../../content/quiz-pdfs/manifest.json", import.meta.url)), "utf8")) as Manifest;
const grade6 = manifest.grades.find((grade) => grade.gradeNumber === 6);
if (!grade6) throw new Error("The quiz manifest has no Grade 6.");
const url = process.env.SUPABASE_TEST_URL ?? "";
const secretKey = process.env.SUPABASE_TEST_SECRET_KEY ?? "";
const run = `quiz-pdfs-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
const password = "SyntheticAdult42!";
const REVIEW_WIDTHS = [320, 375, 390, 430, 768, 820, 1180, 1366, 1920];

let admin: SupabaseClient;
let reviewUser: User;
let entitledUser: User;
let usedTrialUser: User;
let live: LiveQuiz[] = [];

async function createConfirmedUser(email: string): Promise<User> {
  const result = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (result.error || !result.data.user) throw result.error ?? new Error("Synthetic account was not created.");
  return result.data.user;
}

async function signIn(page: Page, email: string, destination: string) {
  await page.goto(`/sign-in?next=${destination}`);
  await page.getByLabel("Email address").fill(email);
  await page.locator("input[name=\"password\"]").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function selectGrade(page: Page) {
  await page.getByRole("combobox", { name: "Grade" }).selectOption({ label: "Grade 6" });
  await expect(page.getByRole("heading", { name: "Quiz Topics" })).toBeVisible();
}

function noHorizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
}

async function axeSeriousViolations(page: Page): Promise<string[]> {
  await page.addScriptTag({ content: axeSource });
  return page.evaluate(async () => {
    const axe = (globalThis as unknown as { axe: AxeApi }).axe;
    const result = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } });
    return result.violations.filter((violation) => ["serious", "critical"].includes(violation.impact)).map((violation) => `${violation.id}(${violation.nodes.length}) ${violation.nodes[0]?.target.join(" ") ?? ""}`);
  });
}

test.beforeAll(async () => {
  expect(url).toMatch(/^http:\/\/127\.0\.0\.1:/);
  admin = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
  reviewUser = await createConfirmedUser(`${run}-review@example.test`);
  entitledUser = await createConfirmedUser(`${run}-entitled@example.test`);
  usedTrialUser = await createConfirmedUser(`${run}-used-trial@example.test`);
  const startsAt = new Date(Date.now() + 1000);
  const endsAt = new Date(startsAt.getTime() + 24 * 60 * 60 * 1000);
  for (const [user, state] of [[entitledUser, "trial-active"], [usedTrialUser, "trial-expired"]] as const) {
    const account = await admin.from("consumer_accounts").update({ trial_redeemed_at: startsAt.toISOString() }).eq("user_id", user.id);
    if (account.error) throw account.error;
    const entitlement = await admin.from("consumer_game_entitlements").insert({ user_id: user.id, entitlement_state: state, trial_started_at: startsAt.toISOString(), trial_ends_at: endsAt.toISOString() });
    if (entitlement.error) throw entitlement.error;
  }
  const assignments = await admin.from("topic_resource_assignments").select("resource_id,slug,topic_id");
  if (assignments.error) throw assignments.error;
  const resources = await admin.from("content_resources").select("id").eq("resource_type", "quiz_pdf").eq("publication_state", "published").eq("resource_scope", "topic").eq("scope_status", "current");
  if (resources.error) throw resources.error;
  const topics = await admin.from("content_topics").select("id,title,sort_order").eq("publication_state", "published");
  if (topics.error) throw topics.error;
  const publishedIds = new Set(resources.data.map((row) => row.id));
  live = grade6.topics.map((topic) => {
    const assignment = assignments.data.find((row) => row.slug === topic.quiz.slug && publishedIds.has(row.resource_id));
    if (!assignment) throw new Error(`Quiz ${topic.quiz.slug} is not published in the local content database.`);
    const dbTopic = topics.data.find((row) => row.id === assignment.topic_id);
    if (!dbTopic) throw new Error(`Topic for ${topic.quiz.slug} is not published.`);
    return { resourceId: assignment.resource_id, topicId: assignment.topic_id, topicSortOrder: dbTopic.sort_order, topicTitle: dbTopic.title, quiz: topic.quiz };
  }).sort((left, right) => left.topicSortOrder - right.topicSortOrder);
  expect(live).toHaveLength(grade6.topics.length);
});

test.afterAll(async () => {
  // Download evidence keeps no identity: resource_download_events sets the
  // consumer to null when the account goes (on delete set null).
  for (const user of [reviewUser, entitledUser, usedTrialUser]) {
    if (!user) continue;
    const deleted = await admin.auth.admin.deleteUser(user.id);
    if (deleted.error) throw deleted.error;
  }
});

test("anonymous visitors are sent into the access flow and can fetch no quiz PDF", async ({ request }) => {
  const landing = await request.get("/quizzes", { maxRedirects: 0 });
  expect(landing.status()).toBe(307);
  expect(landing.headers().location).toBe("/access?next=/quizzes");
  for (const item of live) {
    const download = await request.get(`/resources/${item.resourceId}/download`, { maxRedirects: 0 });
    expect(download.status(), `${item.quiz.slug} download`).toBe(401);
    expect(download.headers()["content-type"]).toContain("application/json");
    expect((await download.body()).subarray(0, 5).toString()).not.toBe("%PDF-");
    const details = await request.get(`/resources/${item.resourceId}`, { maxRedirects: 0 });
    expect(details.status(), `${item.quiz.slug} details`).toBe(307);
    expect(details.headers().location).toBe("/access?next=/quizzes");
  }
  // The stored copies are not web assets: guessing their repository path yields nothing.
  const guessed = await request.get("/content/quiz-pdfs/grade-6/grade-6-ratios-and-rates-quiz.pdf", { maxRedirects: 0 });
  expect(guessed.status()).toBe(404);
});

test("a signed-in account without access lands in the existing subscription flow with Quiz PDFs remembered", async ({ page }) => {
  await signIn(page, reviewUser.email ?? "", "/quizzes");
  await expect(page).toHaveURL("/subscription?next=/quizzes");
  await expect(page.getByRole("heading", { name: "Start your free trial" })).toBeVisible();
  await page.goto("/quizzes");
  await expect(page).toHaveURL("/subscription?next=/quizzes");
});

test("a used-trial account is offered subscription options, never a second trial", async ({ page }) => {
  await signIn(page, usedTrialUser.email ?? "", "/quizzes");
  await expect(page).toHaveURL("/subscription?next=/quizzes");
  await expect(page.getByText("Trial ended")).toBeVisible();
  await expect(page.getByRole("link", { name: "See subscription options" })).toHaveAttribute("href", /\/pricing/);
  await expect(page.getByRole("button", { name: "Start free trial" })).toHaveCount(0);
});

test("an entitled account browses Grade then Topic and downloads the exact approved PDF for each topic", async ({ page }) => {
  await signIn(page, entitledUser.email ?? "", "/quizzes");
  await expect(page).toHaveURL("/quizzes");
  await expect(page.getByRole("heading", { level: 1, name: "Quiz PDFs" })).toBeVisible();
  await expect(page.getByText("Topic-by-topic math quizzes for practice, review, and assessment.")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Topic" })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Lesson" })).toHaveCount(0);
  const grade = page.getByRole("combobox", { name: "Grade" });
  expect(await grade.locator("option").allTextContents()).toEqual(["Choose a grade", "Grade 6"]);
  await expect(page.getByText("Choose a grade to see its quiz topics")).toBeVisible();
  await selectGrade(page);
  await expect(page.getByText(`Grade 6 · ${live.length} topics, one quiz PDF each.`)).toBeVisible();
  const cards = page.getByRole("article");
  await expect(cards).toHaveCount(live.length);
  for (const [index, item] of live.entries()) {
    const card = cards.nth(index);
    await expect(card.locator(".public-resource-path")).toHaveText(`Grade 6 / Topic ${item.topicSortOrder}: ${item.topicTitle}`);
    await expect(card.getByRole("heading", { level: 2 })).toHaveText(item.quiz.title);
    await expect(card.getByText("Quiz PDF", { exact: true })).toBeVisible();
    await expect(card.getByText("Included in PDF")).toBeVisible();
    await expect(card.getByRole("link", { name: "Details" })).toHaveAttribute("href", `/resources/${item.resourceId}`);
    await expect(card.getByRole("link", { name: "Download PDF" })).toHaveAttribute("href", `/resources/${item.resourceId}/download`);
  }
  await expect(page.locator(".public-resource-shell")).not.toContainText(/lesson/i);

  // Downloads: the exact bytes the owner approved, with the Homework blueprint's headers.
  const countEvents = async () => (await admin.from("resource_download_events").select("id", { count: "exact", head: true }).eq("consumer_user_id", entitledUser.id)).count ?? 0;
  const before = await countEvents();
  for (const item of live) {
    const response = await page.request.get(`/resources/${item.resourceId}/download`);
    expect(response.status(), item.quiz.slug).toBe(200);
    expect(response.headers()["content-type"]).toBe("application/pdf");
    expect(response.headers()["content-disposition"]).toBe(`attachment; filename="${item.quiz.downloadFilename}"`);
    expect(response.headers()["cache-control"]).toBe("private, no-store, max-age=0");
    const body = await response.body();
    expect(body.length, `${item.quiz.slug} size`).toBe(item.quiz.bytes);
    expect(createHash("sha256").update(body).digest("hex"), `${item.quiz.slug} sha256`).toBe(item.quiz.sha256);
  }
  expect((await countEvents()) - before).toBe(live.length);

  // "View" behaviour of the blueprint: the Details page, then back to the library.
  await cards.first().getByRole("link", { name: "Details" }).click();
  await expect(page).toHaveURL(`/resources/${live[0].resourceId}`);
  await expect(page.getByRole("heading", { level: 1, name: live[0].quiz.title })).toBeVisible();
  await expect(page.getByText("Included in PDF")).toBeVisible();
  await expect(page.getByRole("link", { name: "Download PDF" })).toHaveAttribute("href", `/resources/${live[0].resourceId}/download`);
  await page.getByRole("link", { name: "Back to library" }).click();
  await expect(page).toHaveURL("/quizzes");
});

test("Homework PDFs keep their lesson-by-lesson controls (the blueprint is untouched)", async ({ page }) => {
  await signIn(page, entitledUser.email ?? "", "/homework");
  await expect(page).toHaveURL("/homework");
  await expect(page.getByRole("heading", { level: 1, name: "Homework PDFs" })).toBeVisible();
  for (const name of ["Grade", "Topic", "Lesson"]) await expect(page.getByRole("combobox", { name })).toBeVisible();
  await expect(page.getByText("Preview a lesson activity and download its PDF.")).toBeVisible();
});

test("the quiz library stays clean at every review width, at 200% text and in forced colors", async ({ page }) => {
  await signIn(page, entitledUser.email ?? "", "/quizzes");
  await expect(page).toHaveURL("/quizzes");
  for (const width of REVIEW_WIDTHS) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
    await page.goto("/quizzes");
    await selectGrade(page);
    await expect(page.getByRole("article")).toHaveCount(live.length);
    expect(await noHorizontalOverflow(page), `horizontal overflow at ${width}`).toBe(true);
    const clipped = await page.evaluate(() => [...document.querySelectorAll(".public-resource-card h2, .public-resource-path, .public-resource-actions a, .resource-kind-label")]
      .filter((element) => { const rect = element.getBoundingClientRect(); return rect.right > document.documentElement.clientWidth + 0.5 || rect.left < -0.5 || element.scrollWidth > element.clientWidth + 1; }).length);
    expect(clipped, `clipped labels at ${width}`).toBe(0);
    if (width <= 430) {
      const short = await page.evaluate(() => [...document.querySelectorAll(".public-resource-actions a, .resource-filter-grid select")].map((element) => Math.round(element.getBoundingClientRect().height)).filter((height) => height < 44));
      expect(short, `touch targets under 44px at ${width}`).toEqual([]);
    }
  }
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/quizzes");
  await selectGrade(page);
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  await page.waitForTimeout(200);
  expect(await noHorizontalOverflow(page), "horizontal overflow at 320 with 200% text").toBe(true);
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await page.goto("/quizzes");
  await selectGrade(page);
  await expect(page.getByRole("article")).toHaveCount(live.length);
});

test("no serious or critical axe violations, and keyboard users reach every quiz action with a visible focus indicator", async ({ page, browserName }) => {
  await signIn(page, entitledUser.email ?? "", "/quizzes");
  await expect(page).toHaveURL("/quizzes");
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
    await page.goto("/quizzes");
    await expect(page.getByRole("heading", { level: 1, name: "Quiz PDFs" })).toBeVisible();
    expect(await axeSeriousViolations(page), `axe landing ${width}`).toEqual([]);
    await selectGrade(page);
    expect(await axeSeriousViolations(page), `axe grade selected ${width}`).toEqual([]);
  }
  if (browserName === "webkit") {
    // The Windows WebKit test build never moves keyboard focus onto links from
    // a form control (neither Tab nor Option+Tab), the same anchor-focus policy
    // recorded for the banner releases. The focus-ring proof runs in Chromium;
    // WebKit still proves the axe result above and that the actions are in the
    // sequential focus order.
    test.info().annotations.push({ type: "known-webkit-focus-policy", description: "keyboard walk verified in Chromium" });
    const order = await page.evaluate(() => [...document.querySelectorAll(".public-resource-actions a")].slice(0, 2).map((element) => (element as HTMLElement).tabIndex));
    expect(order).toEqual([0, 0]);
    return;
  }
  await page.getByRole("combobox", { name: "Grade" }).focus();
  const reached = new Map<string, boolean>();
  for (let step = 0; step < 6 && reached.size < 2; step += 1) {
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      if (!element) return null;
      const style = getComputedStyle(element);
      return { text: element.textContent?.trim() ?? "", ring: (style.outlineStyle !== "none" && style.outlineWidth !== "0px") || style.boxShadow !== "none" };
    });
    if (focused && ["Details", "Download PDF"].includes(focused.text) && !reached.has(focused.text)) reached.set(focused.text, focused.ring);
  }
  expect([...reached.keys()].sort()).toEqual(["Details", "Download PDF"]);
  expect([...reached.values()], "visible focus indicator on the quiz actions").toEqual([true, true]);
});
