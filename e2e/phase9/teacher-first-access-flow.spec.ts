import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import Stripe from "stripe";
import { fileURLToPath } from "node:url";

const url = process.env.SUPABASE_TEST_URL ?? "";
const secretKey = process.env.SUPABASE_TEST_SECRET_KEY ?? "";
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
const apiVersion = process.env.STRIPE_API_VERSION ?? "";
const run = `phase9-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
const password = "SyntheticAdult42!";
const reviewEmail = `${run}-review@example.test`;
const entitledEmail = `${run}-entitled@example.test`;
let admin: SupabaseClient;
let reviewUser: User;
let entitledUser: User;
let numberCrossPublished = false;

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

function signedEvent(event: Record<string, unknown>) {
  const payload = JSON.stringify(event);
  return {
    payload,
    signature: Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: webhookSecret,
      timestamp: Number(event.created)
    })
  };
}

async function commercialCounts() {
  const counts: Record<string, number> = {};
  for (const table of ["billing_customers","billing_subscriptions","consumer_commercial_acceptances","consumer_checkout_acceptance_bindings"]) {
    const result = await admin.from(table).select("id", { count: "exact", head: true });
    if (result.error) throw result.error;
    counts[table] = result.count ?? -1;
  }
  return counts;
}

test.beforeAll(async () => {
  expect(url).toMatch(/^http:\/\/127\.0\.0\.1:/);
  admin = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
  reviewUser = await createConfirmedUser(reviewEmail);
  entitledUser = await createConfirmedUser(entitledEmail);

  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + 24 * 60 * 60 * 1000);
  const account = await admin.from("consumer_accounts")
    .update({ trial_redeemed_at: startsAt.toISOString() })
    .eq("user_id", entitledUser.id);
  if (account.error) throw account.error;
  const entitlement = await admin.from("consumer_game_entitlements").insert({
    user_id: entitledUser.id,
    entitlement_state: "trial-active",
    trial_started_at: startsAt.toISOString(),
    trial_ends_at: endsAt.toISOString()
  });
  if (entitlement.error) throw entitlement.error;
  const numberCross = await admin.from("game_catalog_entries").select("status").eq("stable_key", "number-cross").maybeSingle();
  if (numberCross.error) throw numberCross.error;
  numberCrossPublished = numberCross.data?.status === "published";
});

test.afterAll(async () => {
  for (const user of [reviewUser, entitledUser]) {
    if (!user) continue;
    const deleted = await admin.auth.admin.deleteUser(user.id);
    if (deleted.error) throw deleted.error;
  }
  for (const [table, column] of [
    ["consumer_accounts", "user_id"],
    ["consumer_game_entitlements", "user_id"],
    ["billing_customers", "owner_consumer_id"],
    ["billing_subscriptions", "owner_consumer_id"],
    ["consumer_commercial_acceptances", "owner_user_id"],
    ["consumer_checkout_acceptance_bindings", "owner_user_id"]
  ] as const) {
    for (const user of [reviewUser, entitledUser]) {
      expect((await admin.from(table).select(column, { count: "exact", head: true }).eq(column, user.id)).count).toBe(0);
    }
  }
});

test("teacher-first homepage uses approved copy, SEO, modules, and public navigation", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("MathNexa | Online Math Prep, Homework PDFs, Quiz PDFs & Worksheets");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    "Math games, online math prep for Grades 3–8, Homework PDFs, Quiz PDFs, and a worksheet generator—all in one teacher-friendly platform."
  );
  await expect(page.getByText("Teacher-led math resources", { exact: true })).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://mathnexa.com");
  await expect(page.getByText("Math games, online math prep for Grades 3–8, Homework PDFs, Quiz PDFs, and a worksheet generator—all in one teacher-friendly platform.")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Games, Missouri MAP Prep, image-rich homework, and topic quizzes");
  await expect(page.getByRole("heading", { name: "Make every math lesson clearer, more engaging, and ready to teach." })).toBeVisible();
  await expect(page.getByText("Built for teachers. Useful for families. Designed for classroom instruction, extra practice, and middle school math review.")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/\$5\.99|24-hour|stripe|checkout|consent|phase \d/i);

  const navigation = page.getByRole("navigation", { name: "Primary navigation" });
  // The permanent product strip: six destinations, in the approved order.
  const expectedNavigation = ["Home", "Math Games", "Online Math Prep", "Homework PDFs", "Quiz PDFs", "Worksheet Generator"];
  await expect(navigation.getByRole("link")).toHaveCount(expectedNavigation.length);
  for (const label of expectedNavigation) await expect(navigation.getByRole("link", { name: label === "Home" ? /^Home[ ]?Current$/ : label, exact: label !== "Home" })).toBeVisible();
  // Worksheet Generator enters through the app's own gated route, never a direct off-site link.
  await expect(navigation.getByRole("link", { name: "Worksheet Generator" })).toHaveAttribute("href", "/worksheets");
  await expect(navigation.getByRole("link", { name: /^Home[ ]?Current$/ })).toHaveAttribute("aria-current", "page");
  // Account actions live in the account menu, never in the product strip.
  await expect(navigation.getByRole("link", { name: /Subscription|My Account/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Open account menu" }).click();
  const accountNavigation = page.getByRole("navigation", { name: "Account navigation" });
  await expect(accountNavigation.getByRole("link", { name: "Subscription" })).toHaveAttribute("href", "/subscription");
  await expect(accountNavigation.getByRole("link", { name: "My Account" })).toHaveAttribute("href", "/account");
  await expect(accountNavigation.getByRole("button", { name: "Sign out" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  for (const [label, href] of [[/Math Games Engage · Practice/, "/games"], [/Online Math Prep [(]Grades 3–8[)] Learn · Practice · Review · Worksheet Generator/, "/map-prep"], [/Homework PDFs Practice · Print/, "/homework"], [/Quiz PDFs Assess · Print/, "/quizzes"]] as const) {
    await expect(page.getByRole("link", { name: label })).toHaveAttribute("href", href);
  }
  await expect(page.getByRole("img", { name: /Math Vocabulary Hunt game artwork/i })).toBeVisible();
  await expect(page.getByRole("img", { name: /Online Math Prep workspace/i })).toBeVisible();
  await expect(page.getByRole("img", { name: /homework PDF with fruit diagrams/i })).toBeVisible();
  await expect(page.getByRole("img", { name: /Grade 7 topic quiz/i })).toBeVisible();
  await expect(page.locator(".constellation-node")).toHaveCount(4);
  // Anonymous visitors see the free-trial path in the header without searching for pricing.
  await expect(page.getByRole("banner").getByRole("link", { name: "Start free trial" })).toHaveAttribute("href", "/sign-up?next=/subscription");
  await expect(page.locator("body")).not.toContainText("Today's math toolkit");
});

test("signed-out product and account choices preserve only allowlisted destinations", async ({ page }) => {
  const destinations = [
    ["/games", "Math Games"],
    ["/map-prep", "Online Math Prep"],
    ["/homework", "Homework PDFs"],
    ["/quizzes", "Quiz PDFs"],
    ["/subscription", "Subscription"],
    ["/account", "My Account"]
  ] as const;
  for (const [destination, label] of destinations) {
    await page.goto(destination);
    await expect(page).toHaveURL(`/access?next=${destination}`);
    await expect(page.getByRole("heading", { name: `Continue to ${label}` })).toBeVisible();
    await expect(page.getByRole("link", { name: "Create account" })).toHaveAttribute("href", `/sign-up?next=${destination}`);
    await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", `/sign-in?next=${destination}`);
    await expect(page.locator("body")).not.toContainText(/\$5\.99|24-hour|stripe|checkout|consent|phase \d/i);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  }

  for (const value of [
    "https://attacker.example",
    "//attacker.example/games",
    "javascript:alert(1)",
    "data:text/html,attack",
    "file:///etc/passwd",
    "%2Fgames",
    "%252Fgames"
  ]) {
    await page.goto(`/access?next=${encodeURIComponent(value)}`);
    await expect(page.getByRole("heading", { name: "Continue to Home" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in?next=/");
  }
});

test("pointer and keyboard choices reach the preserved account-intent path", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /Online Math Prep [(]Grades 3–8[)]/ }).click();
  await expect(page).toHaveURL("/access?next=/map-prep");
  await page.goto("/");
  const createAccount = page.getByRole("link", { name: "Create an account" });
  await createAccount.focus();
  await expect(createAccount).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/sign-up$/);
});

test("confirmed accounts without entitlement reach the authenticated subscription review", async ({ page, context }) => {
  await context.addCookies([{ name: "entitlement", value: "active", url: "http://127.0.0.1:3000" }]);
  await page.addInitScript(() => {
    localStorage.setItem("gameAccess", "active");
    localStorage.setItem("trialEndsAt", "2099-01-01T00:00:00.000Z");
  });
  await page.goto("/homework?entitlement=active");
  await expect(page).toHaveURL("/access?next=/homework");
  await page.getByRole("link", { name: "Sign in" }).click();
  await page.getByLabel("Email address").fill(reviewEmail);
  await page.locator("input[name=\"password\"]").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/subscription?next=/homework");
  await expect(page.getByRole("heading", { name: "Start your free trial" })).toBeVisible();
  await expect(page.getByText("One MathNexa subscription includes Math Games, Online Math Prep, Homework PDFs, Quiz PDFs, and Worksheet Generator.", { exact: true })).toBeVisible();
  await expect(page.getByText(/one full, non-renewable 24-hour trial/i)).toBeVisible();
  await expect(page.getByText(/renews automatically for \$5\.99 USD monthly/i)).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(7);
  await expect(page.getByRole("button", { name: "Start free trial" })).toBeEnabled();
  // Signed in without a subscription: the header still offers the trial,
  // now straight to the subscription step.
  await expect(page.getByRole("banner").getByRole("link", { name: "Start free trial" })).toHaveAttribute("href", "/subscription");
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "Authorize Code" })).toBeVisible();
  await expect(page.getByLabel("Code (required)")).toBeVisible();
  await page.goto("/access?next=/map-prep");
  await expect(page).toHaveURL("/access?next=/map-prep");
  await expect(page.getByRole("link", { name: "Account", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Authorize Code" })).toBeVisible();
  await expect(page.getByLabel("Code (required)")).toBeVisible();
  await page.goto("/games?access=active");
  await expect(page).toHaveURL("/subscription?next=/games");
  await page.goto("/map-prep?destinationUrl=https://evil.example/override");
  await expect(page).toHaveURL("/subscription?next=/map-prep");
});

test("server-entitled accounts reach all four selected products and validated Online Math Prep state", async ({ page }) => {
  await signIn(page, entitledEmail, "/games");
  await expect(page).toHaveURL("/games");
  await expect(page.getByRole("heading", { name: "Pick a challenge." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Math Vocabulary Hunt" })).toBeVisible();
  const vocabularyGameCard = page.locator("article").filter({ hasText: "Math Vocabulary Hunt" });
  await expect(vocabularyGameCard.getByRole("link", { name: "Play" })).toBeVisible();
  await expect(page).toHaveURL("/games");
  await expect(page.getByRole("combobox", { name: "Grade" })).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("game doesn’t exist");
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Create an account" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveCount(0);
  await page.getByRole("button", { name: "Open account menu" }).click();
  await expect(page.getByRole("navigation", { name: "Account navigation" }).getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Account navigation" }).getByRole("link", { name: "My Account" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Your MathNexa resource shelf is ready below.")).toBeVisible();
  // An entitled account is never offered another trial.
  await expect(page.getByRole("link", { name: "Start free trial" })).toHaveCount(0);
  // No large call to action for an entitled account: the product strip is the way in.
  await expect(page.getByRole("banner").getByRole("link", { name: "Start learning" })).toHaveCount(0);
  await expect(page.getByRole("banner").locator("[data-header-cta]")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link")).toHaveCount(6);
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "Authorize Code" })).toBeVisible();
  await expect(page.getByLabel("Code (required)")).toBeVisible();
  await page.goto("/access?next=/map-prep");
  await expect(page).toHaveURL("/access?next=/map-prep");
  await expect(page.getByRole("link", { name: "Account", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Authorize Code" })).toBeVisible();
  await expect(page.getByLabel("Code (required)")).toBeVisible();
  await page.goto("/games");
  await vocabularyGameCard.getByRole("link", { name: "Play" }).click();
  await page.waitForURL((url) => url.pathname === "/game/runtime/index.html");
  expect(new URL(page.url()).pathname).toBe("/game/runtime/index.html");
  await expect(page.locator("body")).not.toContainText(/Protected Game Gateway|Game access verified|Launch authorized|Launch MathNexa game/i);
  for (const [destination, heading] of [["/homework", "Homework PDFs"], ["/quizzes", "Quiz PDFs"], ["/map-prep", "Online Math Prep"]] as const) {
    await page.goto(destination);
    await expect(page).toHaveURL(destination);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
  await page.goto("/homework");
  await expect(page.getByRole("combobox", { name: "Grade" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Topic" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Lesson" })).toBeVisible();
  // Quiz PDFs are topic-by-topic: one grade control, then every topic of that
  // grade as a card (no Topic or Lesson selector). Homework keeps all three.
  await page.goto("/quizzes");
  await expect(page.getByRole("combobox", { name: "Grade" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Topic" })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Lesson" })).toHaveCount(0);
  await expect(page.getByText("Topic-by-topic math quizzes for practice, review, and assessment.")).toBeVisible();
  await page.goto("/map-prep");
  await expect(page.getByText("Online Math Prep is not configured", { exact: true })).toBeVisible();
  const beforeMissingMap = await commercialCounts();
  await page.goto("/map-prep?destinationUrl=https://evil.example/override");
  await expect(page.getByText("Online Math Prep is not configured", { exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/subscription required|checkout required/i);
  expect(new URL(page.url()).pathname).toBe("/map-prep");
  await expect(page.locator('a[href*="evil.example"]')).toHaveCount(0);
  expect(await commercialCounts()).toEqual(beforeMissingMap);
});

test("fixture Checkout polls server entitlement and returns to the selected product without duplication", async ({ page, request }) => {
  await signIn(page, reviewEmail, "/quizzes");
  await expect(page).toHaveURL("/subscription?next=/quizzes");
  // The route now streams behind a loading boundary, so the URL changes before
  // the consent form exists: wait for the rendered form, not just the URL.
  await expect(page.getByRole("heading", { name: "Start your free trial" })).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(7);
  for (const checkbox of await page.getByRole("checkbox").all()) await checkbox.check();
  await page.getByRole("button", { name: "Start free trial" }).click();
  await expect(page).toHaveURL(/\/checkout\/status\?session_id=cs_fixture[A-Za-z0-9_]+&next=\/quizzes/);
  await expect(page.getByRole("heading", { name: "Activating your MathNexa access" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Refresh status" })).toHaveAttribute("href", /next=%2Fquizzes/);
  await expect(page.getByRole("link", { name: "Subscriber Management" })).toBeVisible();
  const sessionId = new URL(page.url()).searchParams.get("session_id") ?? "";
  const acceptanceCount = (await admin.from("consumer_commercial_acceptances")
    .select("id", { count: "exact", head: true }).eq("owner_user_id", reviewUser.id)).count;
  expect(acceptanceCount).toBe(1);
  await page.reload();
  await page.reload();
  expect((await admin.from("consumer_commercial_acceptances")
    .select("id", { count: "exact", head: true }).eq("owner_user_id", reviewUser.id)).count).toBe(1);
  await expect(page.getByRole("status").filter({ hasText: /checking the server/i })).toBeVisible();

  const mapping = await admin.from("billing_customers")
    .select("stripe_customer_id").eq("owner_consumer_id", reviewUser.id).single();
  if (mapping.error) throw mapping.error;
  const created = Math.floor(Date.now() / 1000);
  const signed = signedEvent({
    id: `evt_${run.replaceAll("-", "")}phase9`,
    object: "event",
    api_version: apiVersion,
    created,
    livemode: false,
    type: "checkout.session.completed",
    data: {
      object: {
        id: sessionId,
        object: "checkout.session",
        customer: mapping.data.stripe_customer_id,
        client_reference_id: reviewUser.id,
        metadata: { mathnexa_account_id: reviewUser.id }
      }
    }
  });
  const webhook = await request.post("/api/billing/webhook", {
    data: signed.payload,
    headers: { "stripe-signature": signed.signature }
  });
  expect(webhook.status()).toBe(200);
  expect(await webhook.json()).toMatchObject({ state: "trial-active" });
  await expect(page).toHaveURL("/quizzes", { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Quiz PDFs" })).toBeVisible();
  expect((await admin.from("consumer_checkout_acceptance_bindings")
    .select("id", { count: "exact", head: true }).eq("owner_user_id", reviewUser.id)).count).toBe(1);
});

test("homepage and account-intent UI remain accessible across target devices and user preferences", async ({ page }) => {
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 375, height: 667 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 }
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    // One visible header call to action at every width, never wrapped.
    const cta = page.getByRole("link", { name: "Start free trial" });
    await expect(cta).toHaveCount(1);
    await expect(cta).toBeVisible();
    const ctaBox = await cta.boundingBox();
    expect(ctaBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(ctaBox?.height ?? 99).toBeLessThan(60);
    // Compact headers fold the navigation behind the menu button.
    const menu = page.getByRole("button", { name: "Open account menu" });
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await menu.click();
    await expect(page.getByRole("button", { name: "Close account menu" })).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    // The product strip never widens the page; it scrolls within itself.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    for (const link of await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link").all()) {
      const box = await link.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  }

  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  await page.goto("/");
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe("auto");
  const navLink = page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Math Games" });
  await navLink.focus();
  await expect(navLink).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("320px at 200% text reflows without horizontal scrolling, including the school-code form and trial onboarding", async ({ page }) => {
  // WCAG 1.4.4 / 1.4.10: enlarged text must not force sideways page scrolling.
  // The root font size stands in for the browser's text-size setting.
  const measure = async (path: string) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    await page.waitForTimeout(150);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${path} overflows by ${overflow}px at 320px + 200% text`).toBeLessThanOrEqual(0);
  };
  await page.setViewportSize({ width: 320, height: 640 });
  for (const path of ["/", "/sign-in", "/sign-up?next=/subscription", "/access?next=/games"]) {
    await measure(path);
    // The authorized school-code form stays usable: field, reveal control and
    // Continue all on screen with project-minimum targets.
    const code = page.getByLabel("Code (required)");
    await expect(code).toBeVisible();
    const reveal = page.getByRole("button", { name: "Show code" });
    const continueButton = page.getByRole("button", { name: "Continue" });
    for (const control of [reveal, continueButton]) {
      const box = await control.boundingBox();
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(320);
    }
    await code.fill("sample-code");
    await expect(code).toHaveValue("sample-code");
    await reveal.click();
    await expect(code).toHaveAttribute("type", "text");
  }
  // Signed in without entitlement: the trial onboarding card at the same
  // size. A fresh confirmed account, because the earlier fixture-Checkout
  // test has already activated reviewUser's trial by now.
  const reflowEmail = `${run}-reflow@example.test`;
  const reflowUser = await createConfirmedUser(reflowEmail);
  try {
    await signIn(page, reflowEmail, "/subscription");
    await expect(page).toHaveURL("/subscription");
    await measure("/subscription");
    await expect(page.getByRole("heading", { name: "Start your free trial" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Start free trial" })).toBeVisible();
    // And normal text at 320px and 390px is unchanged: still no overflow.
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      for (const path of ["/", "/sign-in", "/subscription"]) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      }
    }
  } finally {
    await admin.auth.admin.deleteUser(reflowUser.id);
  }
});

test("banner product links resolve on the server (never a silent 404)", async ({ page, request }) => {
  await page.goto("/");
  const strip = page.getByRole("navigation", { name: "Primary navigation" });
  const hrefs = await strip.getByRole("link").evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
  expect(hrefs).toEqual(["/", "/games", "/map-prep", "/homework", "/quizzes", "/worksheets"]);
  for (const href of hrefs) {
    const response = await request.get(href, { maxRedirects: 0 });
    // 200 for public pages; the access gate answers with a redirect for the
    // product entries. Anything 4xx/5xx is a broken banner link.
    expect([200, 307, 308], `${href} answered ${response.status()}`).toContain(response.status());
    if (response.status() !== 200) expect(response.headers().location ?? "").toMatch(/^\/(access|sign-in)\?next=/);
  }
});

async function makeUsedTrial(user: User) {
  // A redeemed, ended trial. The account check constraint wants the redemption
  // stamp at or after the server clock, so it is stamped a second ahead; the
  // entitlement check constraint wants the trial window to be exactly 24 hours,
  // so both stamps derive from the same instant.
  const now = Date.now();
  const soon = new Date(now + 1000).toISOString();
  const account = await admin.from("consumer_accounts").update({ trial_redeemed_at: soon }).eq("user_id", user.id);
  if (account.error) throw account.error;
  const entitlement = await admin.from("consumer_game_entitlements").insert({
    user_id: user.id,
    entitlement_state: "trial-expired",
    trial_started_at: soon,
    trial_ends_at: new Date(now + 1000 + 24 * 60 * 60 * 1000).toISOString()
  });
  if (entitlement.error) throw entitlement.error;
}

test("Worksheet Generator is subscription-gated: nobody reaches ShowMe without a server-verified entitlement", async ({ page, context, request }) => {
  const showMe = "https://showme.mathnexa.com/worksheets";
  const worksheetLink = () => page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Worksheet Generator" });

  // Anonymous: the banner entry is the app's own route; it answers with the access flow.
  const anonymous = await request.get("/worksheets", { maxRedirects: 0 });
  expect(anonymous.status()).toBe(307);
  expect(anonymous.headers().location).toBe("/access?next=/worksheets");
  await page.goto("/");
  await expect(worksheetLink()).toHaveAttribute("href", "/worksheets");
  await worksheetLink().click();
  await expect(page).toHaveURL("/access?next=/worksheets");
  await expect(page.getByRole("heading", { name: "Continue to Worksheet Generator" })).toBeVisible();

  const eligibleEmail = `${run}-worksheets-eligible@example.test`;
  const usedEmail = `${run}-worksheets-used@example.test`;
  const eligibleUser = await createConfirmedUser(eligibleEmail);
  const usedUser = await createConfirmedUser(usedEmail);
  try {
    await makeUsedTrial(usedUser);

    // Signed in, trial never used: the existing trial flow, generator remembered as next.
    await signIn(page, eligibleEmail, "/worksheets");
    await expect(page).toHaveURL("/subscription?next=/worksheets");
    await expect(page.getByRole("heading", { name: "Start your free trial" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Start free trial" })).toBeVisible();
    let gate = await page.request.get("/worksheets", { maxRedirects: 0 });
    expect(gate.status()).toBe(307);
    expect(gate.headers().location).toBe("/subscription?next=/worksheets");
    await page.goto("/");
    await worksheetLink().click();
    await expect(page).toHaveURL("/subscription?next=/worksheets");
    await context.clearCookies();

    // Used trial: the existing Subscribe / pricing path, never a second trial offer.
    await signIn(page, usedEmail, "/worksheets");
    await expect(page).toHaveURL("/subscription?next=/worksheets");
    await expect(page.getByRole("link", { name: "See subscription options" })).toHaveAttribute("href", "/pricing");
    await expect(page.getByRole("button", { name: "Start free trial" })).toHaveCount(0);
    await expect(page.getByRole("banner").getByRole("link", { name: "Subscribe" })).toHaveAttribute("href", "/pricing");
    gate = await page.request.get("/worksheets", { maxRedirects: 0 });
    expect(gate.status()).toBe(307);
    expect(gate.headers().location).toBe("/subscription?next=/worksheets");
    await context.clearCookies();
  } finally {
    for (const user of [eligibleUser, usedUser]) await admin.auth.admin.deleteUser(user.id);
  }

  // Server-entitled (active trial fixture): straight to the generator, one redirect, nothing in between.
  await signIn(page, entitledEmail, "/games");
  await expect(page).toHaveURL("/games");
  const entitled = await page.request.get("/worksheets", { maxRedirects: 0 });
  expect(entitled.status()).toBe(307);
  expect(entitled.headers().location).toBe(showMe);
  await page.route("https://showme.mathnexa.com/**", (route) => route.fulfill({
    status: 200,
    contentType: "text/html",
    body: "<!doctype html><title>ShowMe stub</title><h1>ShowMe worksheet generator</h1>"
  }));
  await page.goto("/");
  await worksheetLink().click();
  await expect(page).toHaveURL(showMe);
  await expect(page.getByRole("heading", { name: "ShowMe worksheet generator" })).toBeVisible();
  await page.unroute("https://showme.mathnexa.com/**");
  await context.clearCookies();
});

test("Authorize Code entry is permanent: homepage form plus banner link in every account state; the sign-in page may omit the banner link", async ({ page, context }) => {
  const codeHeading = page.getByRole("heading", { name: "Authorize Code" });
  const codeField = page.getByLabel("Code (required)");
  const bannerLink = page.getByRole("banner").getByRole("link", { name: "Authorize Code" });
  const expectEntry = async (label: string) => {
    await expect(codeHeading, label).toBeVisible();
    await expect(codeField, label).toBeVisible();
    await expect(page.getByRole("button", { name: "Show code" }), label).toBeVisible();
    await expect(bannerLink, label).toHaveAttribute("href", "/#authorized-access");
    // Reachable immediately: the banner link is on the first screen, no menu, no scrolling.
    const box = await bannerLink.boundingBox();
    const viewport = page.viewportSize();
    expect(
      !!box && !!viewport && box.y >= 0 && box.y + box.height <= viewport.height && box.x >= 0 && box.x + box.width <= viewport.width,
      `${label}: banner link within the first screen`
    ).toBe(true);
    expect(box?.height ?? 0, `${label}: target height`).toBeGreaterThanOrEqual(44);
    // Never only inside the account menu; never a "Start learning" anywhere.
    await expect(page.getByRole("navigation", { name: "Account navigation" }).getByRole("link", { name: "Authorize Code" }), label).toHaveCount(0);
    await expect(page.locator("body"), label).not.toContainText("Start learning");
  };

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expectEntry("anonymous");
  // On the homepage the link brings the form into view and focuses the code field; nothing enters the URL.
  await bannerLink.click();
  await expect(codeField).toBeFocused();
  await expect(page).toHaveURL("/");
  // From another page it leads to the homepage form.
  await page.goto("/access?next=/games");
  await expect(bannerLink).toHaveAttribute("href", "/#authorized-access");
  await bannerLink.click();
  await expect(page).toHaveURL("/#authorized-access");
  await expect(codeHeading).toBeInViewport();
  // The sign-in page carries the form itself and may omit the banner link.
  await page.goto("/sign-in");
  await expect(codeHeading).toBeVisible();
  await expect(bannerLink).toHaveCount(0);

  const eligibleEmail = `${run}-code-eligible@example.test`;
  const usedEmail = `${run}-code-used@example.test`;
  const eligibleUser = await createConfirmedUser(eligibleEmail);
  const usedUser = await createConfirmedUser(usedEmail);
  try {
    await makeUsedTrial(usedUser);
    await signIn(page, eligibleEmail, "/");
    await expect(page).toHaveURL("/");
    await expectEntry("signed in, trial eligible");
    await expect(page.getByRole("banner").getByRole("link", { name: "Start free trial" })).toHaveAttribute("href", "/subscription");
    await context.clearCookies();

    await signIn(page, usedEmail, "/");
    await expect(page).toHaveURL("/");
    await expectEntry("signed in, used trial");
    await expect(page.getByRole("banner").getByRole("link", { name: "Subscribe" })).toHaveAttribute("href", "/pricing");
    await expect(page.getByRole("banner").getByRole("link", { name: "Start free trial" })).toHaveCount(0);
    await context.clearCookies();
  } finally {
    for (const user of [eligibleUser, usedUser]) await admin.auth.admin.deleteUser(user.id);
  }

  await signIn(page, entitledEmail, "/");
  await expect(page).toHaveURL("/");
  await expectEntry("entitled (active trial)");
  await expect(page.getByRole("banner").getByRole("link", { name: /Start free trial|Subscribe/ })).toHaveCount(0);
  await context.clearCookies();
});

test("mobile banner: all six product destinations visible at once in a two-row grid, nothing scrolls sideways, no label cut off", async ({ page }) => {
  const labels = ["Home", "Math Games", "Online Math Prep", "Homework PDFs", "Quiz PDFs", "Worksheet Generator"];
  const measure = async (context: string) => {
    const nav = page.getByRole("navigation", { name: "Primary navigation" });
    const links = nav.getByRole("link");
    await expect(links).toHaveCount(6);
    const viewport = page.viewportSize();
    if (!viewport) throw new Error("viewport size unknown");
    const boxes: Array<{ x: number; y: number; width: number; height: number }> = [];
    for (let index = 0; index < labels.length; index += 1) {
      const link = links.nth(index);
      const label = `${context}: ${labels[index]}`;
      await expect(link, label).toBeVisible();
      const box = await link.boundingBox();
      if (!box) throw new Error(`${label} has no box`);
      boxes.push(box);
      // Whole label: the text fits its own link box in both directions.
      const whole = await link.evaluate((node) => {
        const span = node.querySelector("span");
        return !!span && span.scrollWidth <= node.clientWidth + 1 && node.scrollHeight <= node.clientHeight + 1;
      });
      expect(whole, `${label} is shown whole`).toBe(true);
      expect(box.height, `${label} target height`).toBeGreaterThanOrEqual(44);
      expect(box.x, `${label} inside the viewport`).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, `${label} inside the viewport`).toBeLessThanOrEqual(viewport.width + 0.5);
      expect(box.y + box.height, `${label} on the first screen`).toBeLessThanOrEqual(viewport.height);
    }
    // Nothing scrolls sideways: not the navigation, not its list, not the page.
    expect(await nav.evaluate((node) => [node, ...node.querySelectorAll("ul")].every((element) => element.scrollWidth <= element.clientWidth + 1)), `${context}: navigation does not scroll`).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${context}: page does not scroll sideways`).toBe(true);
    return boxes;
  };

  for (const width of [320, 375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    const boxes = await measure(`${width}px`);
    // Two rows of three, in the approved order: Home | Math Games | Online Math Prep, then Homework PDFs | Quiz PDFs | Worksheet Generator.
    const rows = [...new Set(boxes.map((box) => Math.round(box.y)))];
    expect(rows, `${width}px: two rows`).toHaveLength(2);
    expect(boxes.slice(0, 3).map((box) => Math.round(box.y)), `${width}px: row 1`).toEqual([rows[0], rows[0], rows[0]]);
    expect(boxes.slice(3).map((box) => Math.round(box.y)), `${width}px: row 2`).toEqual([rows[1], rows[1], rows[1]]);
    for (const row of [boxes.slice(0, 3), boxes.slice(3)]) expect(row[0].x < row[1].x && row[1].x < row[2].x, `${width}px: left to right`).toBe(true);
    // The rest of the compact banner: the brand, the call to action and the account menu share the top row above the grid.
    const brand = await page.getByRole("banner").getByRole("link", { name: "MathNexa home" }).boundingBox();
    expect((brand?.y ?? 0) + (brand?.height ?? 0), `${width}px: brand above the grid`).toBeLessThanOrEqual(rows[0] + 1);
  }

  // Tablets and desktops: one row, still nothing to scroll.
  for (const width of [768, 1024, 1366, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const boxes = await measure(`${width}px`);
    expect(new Set(boxes.map((box) => Math.round(box.y))).size, `${width}px: one row`).toBe(1);
  }

  // 320px with 200% text: the grid reflows to fewer columns instead of overflowing; every label still whole.
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  await page.waitForTimeout(150);
  await measure("320px at 200% text");
});

test("teacher-first homepage matches mobile, desktop, and smartboard visual baselines", async ({ page }) => {
  for (const [name, viewport] of [
    ["mobile", { width: 320, height: 568 }],
    ["mobile-390", { width: 390, height: 844 }],
    ["tablet", { width: 768, height: 1024 }],
    ["desktop", { width: 1440, height: 900 }],
    ["smartboard", { width: 1920, height: 1080 }]
  ] as const) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot(`teacher-first-home-${name}.png`, {
      animations: "disabled",
      fullPage: true,
      maxDiffPixelRatio: 0.01,
      stylePath: fileURLToPath(new URL("./screenshot.css", import.meta.url))
    });
  }
});

test("SEO boundaries, admin isolation, and signed-out billing isolation remain explicit", async ({ page, request }) => {
  for (const path of ["/access?next=/games", "/sign-in", "/sign-up", "/forgot-password"]) {
    await page.goto(path);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  }
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  const robotsText = await robots.text();
  for (const path of ["/access", "/sign-in", "/subscription", "/checkout", "/account", "/admin", "/api"]) {
    expect(robotsText).toContain(`Disallow: ${path}`);
  }
  const adminResponse = await request.get("/admin");
  expect(adminResponse.status()).toBe(404);
  expect(await adminResponse.text()).not.toMatch(/super admin|mfa|audit log/i);
  await page.goto("/");
  await expect(page.locator("body")).not.toContainText(/sk_test_|whsec_|SUPABASE_SECRET_KEY|STRIPE_SECRET_KEY/);
});

test("no 'Start learning' anywhere in the current experience; activation success offers Go to Math Games; subscription copy lists Worksheet Generator", async ({ page, context }) => {
  const included = "One MathNexa subscription includes Math Games, Online Math Prep, Homework PDFs, Quiz PDFs, and Worksheet Generator.";
  const sweep = async (label: string, paths: string[]) => {
    for (const path of paths) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body"), `${label} ${path}`).not.toContainText("Start learning");
    }
  };
  await sweep("anonymous", ["/", "/sign-in", "/sign-up?next=/subscription", "/access?next=/games", "/pricing"]);
  // The trial sign-up plan summary names every protected product, the generator included.
  await page.goto("/sign-up?next=/subscription");
  await expect(page.getByText(/free trial with full access to Math Games, Online Math Prep, Homework PDFs, Quiz PDFs, and Worksheet Generator\./)).toBeVisible();

  // Post-activation success: the action is "Go to Math Games" (destination unchanged: /games).
  await signIn(page, entitledEmail, "/");
  await expect(page).toHaveURL("/");
  await page.goto("/subscription?activated=1");
  await expect(page.getByRole("heading", { name: "You're all set!" })).toBeVisible();
  const go = page.getByRole("link", { name: "Go to Math Games" });
  await expect(go).toHaveAttribute("href", "/games");
  await expect(page.locator("body")).not.toContainText("Start learning");
  await go.click();
  await expect(page).toHaveURL("/games");
  await page.goto("/subscription");
  await expect(page.getByText(included, { exact: true })).toBeVisible();
  await sweep("entitled", ["/", "/subscription", "/account", "/pricing", "/subscription?activated=1"]);
  await context.clearCookies();
});
