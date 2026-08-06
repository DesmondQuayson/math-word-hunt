import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import Stripe from "stripe";

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

async function createConfirmedUser(email: string): Promise<User> {
  const result = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (result.error || !result.data.user) throw result.error ?? new Error("Synthetic account was not created.");
  return result.data.user;
}

async function signIn(page: Page, email: string, destination: string) {
  await page.goto(`/sign-in?next=${destination}`);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
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
  await expect(page).toHaveTitle("MathNexa | Math Games, MAP Prep, Homework and Quizzes");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    "Teacher-led math resources in one platform: interactive games, Missouri MAP Prep, image-rich homework PDFs, and classroom-ready quizzes."
  );
  await expect(page.getByText("TEACHER-LED CLASSROOM MATH RESOURCES")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Make every math lesson clearer, more engaging, and ready to teach." })).toBeVisible();
  await expect(page.getByText("Built for teachers. Useful for families. Engaging for learners.")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/\$5\.99|24-hour|stripe|checkout|consent|phase \d/i);

  const navigation = page.getByRole("navigation", { name: "Primary navigation" });
  const expectedNavigation = ["Home", "Games", "MAP Prep", "Homework", "Quizzes", "Subscription", "My Account"];
  await expect(navigation.getByRole("link")).toHaveCount(expectedNavigation.length);
  for (const label of expectedNavigation) await expect(navigation.getByRole("link", { name: label, exact: true })).toBeVisible();
  for (const label of ["Games", "MAP Prep", "Homework", "Quizzes"]) {
    await expect(page.getByRole("link", { name: `Explore ${label}` })).toBeVisible();
  }
  await expect(page.getByRole("img", { name: /teacher planning table/i })).toBeVisible();
});

test("signed-out product and account choices preserve only allowlisted destinations", async ({ page }) => {
  const destinations = [
    ["/games", "Games"],
    ["/map-prep", "MAP Prep"],
    ["/homework", "Homework"],
    ["/quizzes", "Quizzes"],
    ["/subscription", "Subscription"],
    ["/account", "My Account"]
  ] as const;
  for (const [destination, label] of destinations) {
    await page.goto(destination);
    await expect(page).toHaveURL(`/access?next=${destination}`);
    await expect(page.getByRole("heading", { name: `Continue to ${label}` })).toBeVisible();
    await expect(page.getByRole("link", { name: "Create an account" })).toHaveAttribute("href", `/sign-up?next=${destination}`);
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
    await expect(page.getByRole("heading", { name: "Continue to My Account" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in?next=/account");
  }
});

test("pointer and keyboard choices reach the preserved account-intent path", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Explore MAP Prep" }).click();
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
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/subscription?next=/homework");
  await expect(page.getByRole("heading", { name: "$5.99 USD monthly MathNexa access" })).toBeVisible();
  await expect(page.getByText("One MathNexa subscription includes Games, MAP Prep, Homework, and Quizzes.", { exact: true })).toBeVisible();
  await expect(page.getByText(/one full, non-renewable 24-hour trial/i)).toBeVisible();
  await expect(page.getByText(/renews automatically for \$5\.99 USD monthly/i)).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(7);
  await expect(page.getByRole("button", { name: "Accept terms and continue to Stripe" })).toBeEnabled();
  await page.goto("/games?access=active");
  await expect(page).toHaveURL("/subscription?next=/games");
  await page.goto("/map-prep?destinationUrl=https://evil.example/override");
  await expect(page).toHaveURL("/subscription?next=/map-prep");
});

test("server-entitled accounts reach all four selected products and validated MAP Prep state", async ({ page }) => {
  await signIn(page, entitledEmail, "/games");
  await expect(page).toHaveURL("/games");
  await expect(page.getByRole("heading", { name: "MathNexa games" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Math Vocabulary Hunt" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Play" })).toBeVisible();
  await expect(page).toHaveURL("/games");
  await expect(page.getByRole("combobox", { name: "Grade" })).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("game doesn’t exist");
  await page.getByRole("link", { name: "Play" }).click();
  await expect(page).toHaveURL("/play");
  await expect(page.getByRole("heading", { name: "Game access verified" })).toBeVisible();
  await expect(page.getByTestId("protected-game-launch")).toHaveAttribute("href", "/game/runtime/index.html");
  for (const [destination, heading] of [["/homework", "Homework"], ["/quizzes", "Quizzes"], ["/map-prep", "MAP Prep"]] as const) {
    await page.goto(destination);
    await expect(page).toHaveURL(destination);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
  await page.goto("/homework");
  await expect(page.getByRole("combobox", { name: "Grade" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Topic" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Lesson" })).toBeVisible();
  await page.goto("/quizzes");
  await expect(page.getByRole("combobox", { name: "Grade" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Topic" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Lesson" })).toHaveCount(0);
  await page.goto("/map-prep");
  await expect(page.getByText("MAP Prep is not configured", { exact: true })).toBeVisible();
  const beforeMissingMap = await commercialCounts();
  await page.goto("/map-prep?destinationUrl=https://evil.example/override");
  await expect(page.getByText("MAP Prep is not configured", { exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/subscription required|checkout required/i);
  expect(new URL(page.url()).pathname).toBe("/map-prep");
  await expect(page.locator('a[href*="evil.example"]')).toHaveCount(0);
  expect(await commercialCounts()).toEqual(beforeMissingMap);
});

test("fixture Checkout polls server entitlement and returns to the selected product without duplication", async ({ page, request }) => {
  await signIn(page, reviewEmail, "/quizzes");
  await expect(page).toHaveURL("/subscription?next=/quizzes");
  for (const checkbox of await page.getByRole("checkbox").all()) await checkbox.check();
  await page.getByRole("button", { name: "Accept terms and continue to Stripe" }).click();
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
  await expect(page.getByRole("heading", { name: "Quizzes" })).toBeVisible();
  expect((await admin.from("consumer_checkout_acceptance_bindings")
    .select("id", { count: "exact", head: true }).eq("owner_user_id", reviewUser.id)).count).toBe(1);
});

test("homepage and account-intent UI remain accessible across target devices and user preferences", async ({ page }) => {
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 }
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    for (const link of await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link").all()) {
      const box = await link.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  }

  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  await page.goto("/");
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe("auto");
  const navLink = page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Games" });
  await navLink.focus();
  await expect(navLink).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("teacher-first homepage matches mobile, desktop, and smartboard visual baselines", async ({ page }) => {
  for (const [name, viewport] of [
    ["mobile", { width: 320, height: 568 }],
    ["desktop", { width: 1440, height: 900 }],
    ["smartboard", { width: 1920, height: 1080 }]
  ] as const) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot(`teacher-first-home-${name}.png`, {
      animations: "disabled",
      fullPage: true,
      maxDiffPixelRatio: 0.01
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
