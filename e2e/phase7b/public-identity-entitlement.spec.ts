import { createHash } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

const url = process.env.SUPABASE_TEST_URL ?? "";
const publicKey = process.env.SUPABASE_TEST_PUBLISHABLE_KEY ?? "";
const secretKey = process.env.SUPABASE_TEST_SECRET_KEY ?? "";
const run = `phase7b-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
const email = `${run}-account@example.test`;
const forgedEmail = `${run}-forged@example.test`;
const signupEmail = `${run}-signup@example.test`;
const password = "SyntheticAdult42!";
let admin: SupabaseClient;
let accountUser: User;
let signupUser: User | undefined;

async function signIn(page: Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

test.beforeAll(async () => {
  expect(url).toMatch(/^http:\/\/127\.0\.0\.1:/);
  admin = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const result = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      display_name: "Forged Teacher",
      role: "teacher",
      school_or_organization_label: "Forged School",
      progress: 100
    }
  });
  if (result.error || !result.data.user) throw result.error ?? new Error("Synthetic consumer account was not created.");
  accountUser = result.data.user;
});

test.afterAll(async () => {
  if (accountUser) {
    const deleted = await admin.auth.admin.deleteUser(accountUser.id);
    if (deleted.error) throw deleted.error;
  }
  const usersBeforeCleanup = await admin.auth.admin.listUsers();
  signupUser = signupUser ?? usersBeforeCleanup.data.users.find((user) => user.email === signupEmail);
  if (signupUser) {
    const deleted = await admin.auth.admin.deleteUser(signupUser.id);
    if (deleted.error) throw deleted.error;
  }
  const users = await admin.auth.admin.listUsers();
  expect(users.data.users.filter((user) => [email, forgedEmail, signupEmail].includes(user.email ?? ""))).toHaveLength(0);
  for (const [table, column] of [
    ["consumer_accounts", "user_id"],
    ["consumer_game_entitlements", "user_id"],
    ["consumer_account_deletion_requests", "owner_user_id"],
    ["teacher_profiles", "user_id"],
    ["teacher_classes", "owner_teacher_id"],
    ["teacher_activities", "owner_teacher_id"]
  ] as const) {
    expect((await admin.from(table).select(column, { count: "exact", head: true }).eq(column, accountUser.id)).count).toBe(0);
  }
});

test("public consumer pages state the exact product and minimum-data boundary", async ({ page }) => {
  for (const path of ["/", "/pricing", "/help", "/privacy", "/terms", "/sign-up", "/sign-in", "/forgot-password"]) {
    await page.goto(path);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.getByRole("banner").getByLabel("MathNexa home")).toBeVisible();
    await expect(page.getByText("Teacher Pro", { exact: false })).toHaveCount(0);
  }
  await page.goto("/pricing");
  await expect(page).toHaveURL("/access?next=/subscription");
  await expect(page.getByRole("heading", { name: "Continue to Subscription" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/\$5\.99|24-hour|Stripe|Checkout/i);
});

test("signup collects only account credentials and rejects forged profile data", async ({ page }) => {
  await page.goto("/sign-up");
  await expect(page.getByLabel(/display name/i)).toHaveCount(0);
  await expect(page.getByLabel(/school|organization|grade|class|student|progress/i)).toHaveCount(0);
  await page.getByLabel("Email address").fill(forgedEmail);
  await page.locator("#signup-password").fill(password);
  await page.locator("#signup-password-confirmation").fill(password);
  await page.locator("form").evaluate((form) => {
    for (const [name, value] of [["displayName", "Forged Teacher"], ["organization", "Forged School"], ["progress", "100"]]) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      form.append(input);
    }
  });
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(/Only email and password are accepted/)).toBeVisible();
  const users = await admin.auth.admin.listUsers();
  expect(users.data.users.some((user) => user.email === forgedEmail)).toBe(false);
});

test("general account signup requires confirmation and recovery stays generic", async ({ page }) => {
  await page.goto("/sign-up");
  await page.getByLabel("Email address").fill(signupEmail);
  await page.locator("#signup-password").fill(password);
  await page.locator("#signup-password-confirmation").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  const confirmationDialog = page.getByRole("dialog", { name: "Check your email" });
  await expect(confirmationDialog).toBeVisible();
  await expect(confirmationDialog.getByText(/Open the email and select “Confirm email”/)).toBeVisible();
  await confirmationDialog.getByRole("button", { name: "I've confirmed my email" }).click();
  await expect(confirmationDialog.getByText("Your email has not been confirmed yet. Check your inbox and try again.")).toBeVisible();
  const users = await admin.auth.admin.listUsers();
  signupUser = users.data.users.find((user) => user.email === signupEmail);
  expect(signupUser).toBeDefined();
  expect(signupUser?.email_confirmed_at).toBeFalsy();
  expect((await admin.from("consumer_accounts").select("email_confirmed_at").eq("user_id", signupUser!.id).single()).data?.email_confirmed_at).toBeNull();
  expect((await admin.from("teacher_profiles").select("user_id", { count: "exact", head: true }).eq("user_id", signupUser!.id)).count).toBe(0);

  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(signupEmail);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText(/email or password was not accepted/i)).toBeVisible();

  await page.goto("/forgot-password");
  await page.getByLabel("Email address").fill(`${run}-unknown@example.test`);
  await page.getByRole("button", { name: "Send recovery message" }).click();
  await expect(page.getByText(/^If that account exists,/)).toBeVisible();
  await expect(page.getByText(/teacher|pilot/i)).toHaveCount(0);
});

test("consumer provisioning ignores forged educational metadata", async () => {
  expect((await admin.from("consumer_accounts").select("user_id, account_status, trial_redeemed_at").eq("user_id", accountUser.id).single()).data).toMatchObject({
    user_id: accountUser.id,
    account_status: "active",
    trial_redeemed_at: null
  });
  expect((await admin.from("teacher_profiles").select("user_id", { count: "exact", head: true }).eq("user_id", accountUser.id)).count).toBe(0);
  expect((await admin.from("teacher_classes").select("id", { count: "exact", head: true }).eq("owner_teacher_id", accountUser.id)).count).toBe(0);
  expect((await admin.from("teacher_activities").select("id", { count: "exact", head: true }).eq("owner_teacher_id", accountUser.id)).count).toBe(0);
});

test("signed-out authenticated routes redirect and protected assets deny", async ({ page, request }) => {
  for (const path of ["/account", "/subscription"]) {
    await page.goto(path);
    await expect(page).toHaveURL(`/access?next=${path}`);
  }
  await page.goto("/game-access");
  await expect(page).toHaveURL(/\/sign-in\?next=\/game-access$/);
  await page.goto("/play");
  await expect(page).toHaveURL(/\/access\?next=\/games$/);
  const index = await request.get("/game/runtime/index.html");
  expect(index.status()).toBe(401);
  expect(await index.json()).toMatchObject({ error: "game-access-denied", reason: "authentication-required" });
});

test("restricted and Phase 7C billing routes fail closed", async ({ page, request }) => {
  for (const path of ["/teacher", "/classes", "/assignments", "/pilot", "/invitations", "/organization", "/student", "/admin", "/checkout/success", "/billing/portal"]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
    expect(new URL(page.url()).pathname, path).toBe(path);
    await expect(page.getByRole("heading", { name: "This feature has not launched" })).toBeVisible();
  }
  const billing = await request.post("/api/billing/checkout");
  expect(billing.status()).toBe(404);
  expect(await billing.json()).toEqual({ error: "not-found" });
});

test("server denies forged browser entitlement and shows checkout-required state", async ({ page, context }) => {
  await context.addCookies([{ name: "game_access", value: "active", url: "http://127.0.0.1:3000" }]);
  await page.addInitScript(() => {
    localStorage.setItem("gameAccess", "active");
    localStorage.setItem("trialEndsAt", "2099-01-01T00:00:00.000Z");
  });
  await signIn(page);
  await page.goto("/game-access?entitlement=active&trialEndsAt=2099-01-01");
  await expect(page.locator("strong").filter({ hasText: "Subscription setup required" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Continue to protected game gateway" })).toHaveCount(0);
  await page.goto("/subscription");
  await expect(page.getByText(/Checkout is not active/)).toBeVisible();
  await page.goto("/account");
  await expect(page.getByTestId("consumer-account-summary")).toContainText("Not yet redeemed");
  await expect(page.getByLabel(/school|organization|class|student|progress/i)).toHaveCount(0);
});

test("browser roles cannot write a trial or entitlement", async () => {
  const browser = createClient(url, publicKey, { auth: { persistSession: false } });
  expect((await browser.auth.signInWithPassword({ email, password })).error).toBeNull();
  expect((await browser.from("consumer_accounts").update({ trial_redeemed_at: "2099-01-01T00:00:00.000Z" }).eq("user_id", accountUser.id)).error).not.toBeNull();
  expect((await browser.from("consumer_game_entitlements").insert({ user_id: accountUser.id, entitlement_state: "subscription-active", current_period_ends_at: "2099-01-01T00:00:00.000Z" })).error).not.toBeNull();
});

test("server-authenticated exact 24-hour trial unlocks only protected canonical assets", async ({ page }) => {
  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + 24 * 60 * 60 * 1000);
  const account = await admin.from("consumer_accounts").update({ trial_redeemed_at: startsAt.toISOString() }).eq("user_id", accountUser.id);
  if (account.error) throw account.error;
  const entitlement = await admin.from("consumer_game_entitlements").insert({
    user_id: accountUser.id,
    entitlement_state: "trial-active",
    trial_started_at: startsAt.toISOString(),
    trial_ends_at: endsAt.toISOString()
  });
  if (entitlement.error) throw entitlement.error;

  await signIn(page);
  await page.goto("/play?access=active");
  await expect(page).toHaveURL("/game/runtime/index.html");
  await expect(page.locator("body")).not.toContainText(/Protected Game Gateway|Game access verified|Launch authorized|Launch MathNexa game/i);

  const index = await page.request.get("/game/runtime/index.html");
  const vocab = await page.request.get("/game/runtime/vocab.js");
  expect(index.status()).toBe(200);
  expect(vocab.status()).toBe(200);
  expect(index.headers()["cache-control"]).toContain("private, no-store");
  expect(vocab.headers()["cache-control"]).toContain("private, no-store");
  expect(createHash("sha256").update(await index.body()).digest("hex")).toBe("7f00ed6789a2faf23b90e96c3dfdee0167aced87beb08dabf10b89c3e72c9fc5");
  expect(createHash("sha256").update(await vocab.body()).digest("hex")).toBe("caeb8fbb590fffd8cbc169f88f174a38c26de2d16a7e1b0c1cf5e83ac9f01c46");
  expect((await page.request.get("/game/runtime/index-v6-backup.html")).status()).toBe(404);
});

test("consumer identity and access states retain accessible interaction", async ({ page }) => {
  for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }, { width: 768, height: 1024 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/sign-up");
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.getByLabel("Email address")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  await page.goto("/sign-in");
  const emailField = page.getByLabel("Email address");
  await emailField.focus();
  await expect(emailField).toBeFocused();
  await signIn(page);
  await page.goto("/account");
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.getByRole("navigation", { name: "Primary navigation" }).getByRole("button", { name: "Sign out" })).toBeVisible();
  await page.goto("/game-access");
  await expect(page.locator("[aria-live]")).toHaveCount(1);
});
