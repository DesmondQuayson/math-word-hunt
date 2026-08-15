import { createHmac } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

const url = process.env.SUPABASE_TEST_URL ?? "";
const secretKey = process.env.SUPABASE_TEST_SECRET_KEY ?? "";
const run = `number-cross-native-${Date.now()}`;
const password = "SyntheticAdult42!";
const ownerEmail = `${run}-owner@example.test`;
const subscriberEmail = `${run}-subscriber@example.test`;
let admin: SupabaseClient;
let owner: User;
let subscriber: User;
let ownerAdminId = "";

function base32(value: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of value.replaceAll("=", "").toUpperCase()) bits += alphabet.indexOf(character).toString(2).padStart(5, "0");
  const bytes = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  return Buffer.from(bytes);
}

function totp(secret: string): string {
  const payload = Buffer.alloc(8);
  payload.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac("sha1", base32(secret)).update(payload).digest();
  const offset = digest.at(-1)! & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

async function stableTotp(secret: string): Promise<string> {
  const remaining = 30_000 - (Date.now() % 30_000);
  if (remaining < 20_000) await new Promise((done) => setTimeout(done, remaining + 100));
  return totp(secret);
}

async function signIn(page: Page, email: string, destination: string) {
  await page.goto(`/sign-in?next=${destination}`);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test.beforeAll(async () => {
  expect(url).toMatch(/^http:\/\/127\.0\.0\.1:/);
  admin = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const ownerResult = await admin.auth.admin.createUser({ email: ownerEmail, password, email_confirm: true });
  const subscriberResult = await admin.auth.admin.createUser({ email: subscriberEmail, password, email_confirm: true });
  if (!ownerResult.data.user || ownerResult.error) throw ownerResult.error ?? new Error("Owner fixture unavailable.");
  if (!subscriberResult.data.user || subscriberResult.error) throw subscriberResult.error ?? new Error("Subscriber fixture unavailable.");
  owner = ownerResult.data.user;
  subscriber = subscriberResult.data.user;
  const ownerRow = await admin.from("admin_users").insert({ user_id: owner.id, role: "owner", mfa_enrolled: false }).select("id").single();
  if (ownerRow.error) throw ownerRow.error;
  ownerAdminId = ownerRow.data.id;
  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + 24 * 60 * 60 * 1000);
  const account = await admin.from("consumer_accounts").update({ trial_redeemed_at: startsAt.toISOString() }).eq("user_id", subscriber.id);
  if (account.error) throw account.error;
  const entitlement = await admin.from("consumer_game_entitlements").insert({
    user_id: subscriber.id,
    entitlement_state: "trial-active",
    trial_started_at: startsAt.toISOString(),
    trial_ends_at: endsAt.toISOString()
  });
  if (entitlement.error) throw entitlement.error;
});

test("Draft Preview, native gameplay, access policy, responsive UI, and publication model remain coherent", async ({ page, context }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => failedRequests.push(new URL(request.url()).pathname));
  await page.addInitScript(() => {
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: () => Promise.reject(new DOMException("Autoplay blocked by browser policy", "NotAllowedError"))
    });
  });

  await page.goto("/admin/sign-in");
  await page.getByLabel("Owner email address").fill(ownerEmail);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Continue securely" }).click();
  await page.getByRole("button", { name: "Set up authenticator" }).click();
  const mfaSecret = (await page.locator("code.admin-setup-secret").textContent())?.trim() ?? "";
  await page.getByLabel("Six-digit authenticator code").fill(await stableTotp(mfaSecret));
  await page.getByRole("button", { name: "Verify and open admin" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto("/admin?section=games");
  const card = page.locator("article").filter({ has: page.getByRole("heading", { name: "Number Cross", exact: true }) });
  await expect(card).toContainText("internal");
  await expect(card).toContainText("draft");
  const previewHref = await card.getByRole("link", { name: "Preview" }).getAttribute("href");
  expect(previewHref).toMatch(/^\/admin\/games\/catalog\/[0-9a-f-]{36}\/preview$/);
  await page.evaluate(() => localStorage.setItem("mathnexa:number-cross:tutorial-complete", "true"));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(previewHref!);
  await expect(page).toHaveURL(previewHref!);
  await expect(page.getByRole("heading", { name: /Every line has an answer/i })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to MathNexa Games" })).toHaveAttribute("href", "/games");
  expect(new URL(page.url()).origin).toBe("http://127.0.0.1:3000");
  expect(page.url()).not.toContain("number-cross.vercel.app");
  const reducedDuration = await page.locator('[data-action="set-mode"][data-mode="addition"]').evaluate((element) => Number.parseFloat(getComputedStyle(element).transitionDuration));
  expect(reducedDuration).toBeLessThanOrEqual(0.001);

  for (const [mode, difficulty, size] of [
    ["Addition", "Beginner", 3],
    ["Addition", "Expert", 6],
    ["Multiplication", "Beginner", 3],
    ["Multiplication", "Expert", 6]
  ] as const) {
    await page.getByRole("button", { name: new RegExp(`^${mode}`) }).click();
    await page.getByRole("button", { name: new RegExp(`^${difficulty}`) }).click();
    await page.getByRole("button", { name: `Start ${mode}` }).click();
    await expect(page.getByRole("grid", { name: `${size} by ${size} Number Cross board` })).toBeVisible();
    const firstCell = page.getByRole("gridcell").first();
    await firstCell.click();
    await expect(firstCell).toHaveAttribute("aria-pressed", "true");
    await firstCell.focus();
    await page.keyboard.press("Space");
    await expect(firstCell).toHaveAttribute("aria-pressed", "false");
    await page.getByRole("button", { name: "Pause puzzle" }).click();
    await expect(page.getByRole("button", { name: /Resume puzzle/ })).toBeVisible();
    await page.getByRole("button", { name: /Resume puzzle/ }).click();
    await page.getByRole("button", { name: "Number Cross home" }).click();
  }

  await page.getByRole("button", { name: /^Addition/ }).click();
  await page.getByRole("button", { name: /^Beginner/ }).click();
  await page.getByRole("button", { name: "Sound and settings" }).click();
  await page.getByRole("switch", { name: "Background music" }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Start Addition" }).click();
  for (let attempt = 0; attempt < 48 && await page.getByRole("heading", { name: "Puzzle complete!" }).count() === 0; attempt += 1) {
    await page.getByRole("button", { name: /^Hint/ }).click();
  }
  await expect(page.getByRole("heading", { name: "Puzzle complete!" })).toBeVisible();
  await expect(page.getByText("Reasoning Index", { exact: true })).toBeVisible();

  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1366, height: 768 },
    { width: 1920, height: 1080 }
  ]) {
    await page.setViewportSize(viewport);
    if (await page.getByRole("button", { name: "Change mode" }).count()) {
      await page.getByRole("button", { name: "Change mode" }).click();
    }
    await page.getByRole("button", { name: /^Expert/ }).click();
    await page.getByRole("button", { name: "Start Addition" }).click();
    await expect(page.getByRole("grid", { name: "6 by 6 Number Cross board" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const backBox = await page.getByRole("link", { name: "Back to MathNexa Games" }).boundingBox();
    expect(backBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    await page.getByRole("button", { name: "Number Cross home" }).click();
  }

  await context.clearCookies();
  await signIn(page, subscriberEmail, "/games");
  await expect(page).toHaveURL("/games");
  await expect(page.getByRole("heading", { name: "Number Cross", exact: true })).toHaveCount(0);
  const draftDirect = await page.goto("/games/number-cross/play");
  expect(draftDirect?.status()).toBe(404);
  consoleErrors.length = 0;

  const current = await admin.from("game_catalog_entries").select("id,lock_version").eq("stable_key", "number-cross").single();
  if (current.error) throw current.error;
  const published = await admin.rpc("transition_game_catalog_entry", {
    p_actor_admin_id: ownerAdminId,
    p_catalog_entry_id: current.data.id,
    p_expected_lock_version: current.data.lock_version,
    p_status: "published"
  });
  if (published.error) throw published.error;
  await page.goto("/games");
  const publicCard = page.locator("article").filter({ has: page.getByRole("heading", { name: "Number Cross", exact: true }) });
  await expect(publicCard).toBeVisible();
  await publicCard.getByRole("link", { name: "Play" }).click();
  await expect(page).toHaveURL("/games/number-cross/play");
  await expect(page.getByRole("heading", { name: /Every line has an answer/i })).toBeVisible();
  expect(page.url()).not.toContain("number-cross.vercel.app");

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Make every math lesson clearer, more engaging, and ready to teach." })).toBeVisible();
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
});
