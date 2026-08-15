import { createHmac } from "node:crypto";

import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

const url = process.env.SUPABASE_TEST_URL ?? "";
const secretKey = process.env.SUPABASE_TEST_SECRET_KEY ?? "";
const run = `phase8c-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
const email = `${run}-owner@example.test`;
const password = "SyntheticAdmin42!";
let admin: SupabaseClient;
let owner: User;

function decodeBase32(value: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of value.replaceAll("=", "").toUpperCase()) bits += alphabet.indexOf(character).toString(2).padStart(5, "0");
  const bytes: number[] = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  return Buffer.from(bytes);
}

function totp(secret: string): string {
  const payload = Buffer.alloc(8);
  payload.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac("sha1", decodeBase32(secret)).update(payload).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

test.beforeAll(async () => {
  expect(url).toMatch(/^http:\/\/127\.0\.0\.1:/);
  admin = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw created.error ?? new Error("Owner fixture unavailable");
  owner = created.data.user;
  const inserted = await admin.from("admin_users").insert({ user_id: owner.id, role: "owner", mfa_enrolled: false });
  if (inserted.error) throw inserted.error;
});

test.afterAll(async () => {
  if (owner) await admin.auth.admin.deleteUser(owner.id);
});

test("owner command center is accessible, responsive, honest, and preference-aware", async ({ page, context }) => {
  await page.goto("/admin/sign-in");
  await page.getByLabel("Owner email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Continue securely" }).click();
  await page.getByRole("button", { name: "Set up authenticator" }).click();
  const secret = (await page.locator("code.admin-setup-secret").textContent())?.trim() ?? "";
  await page.getByLabel("Six-digit authenticator code").fill(totp(secret));
  await page.getByRole("button", { name: "Verify and open admin" }).click();

  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "MathNexa Super Admin" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Admin modules" }).getByRole("link")).toHaveCount(12);
  await expect(page.getByText("Standalone catalog entries")).toBeVisible();
  await expect(page.locator(".admin-health-panel dl > div").filter({ hasText: "Email" }).getByText("no events", { exact: true })).toBeVisible();

  await page.keyboard.press("Control+k");
  await expect(page.getByRole("searchbox", { name: "Find an admin area" })).toBeFocused();
  await page.getByRole("searchbox", { name: "Find an admin area" }).fill("quiz");
  await expect(page.getByRole("link", { name: /Quizzes/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Subscriptions/ })).toHaveCount(0);
  await page.getByRole("searchbox", { name: "Find an admin area" }).fill("");

  await page.getByRole("link", { name: /Users/ }).click();
  await expect(page).toHaveURL(/section=users/);
  await expect(page.getByRole("heading", { name: "Accounts and access" })).toBeVisible();
  await expect(page.getByText(/No consumer accounts/i)).toBeVisible();

  for (const [section, action] of [["games","Add Game"],["homework","Add Homework"],["quizzes","Add Quiz"]] as const) {
    await page.goto(`/admin?section=${section}`);
    await expect(
      page.getByLabel("Primary authoring actions").getByRole("link", { name: action, exact: true }),
    ).toBeVisible();
    if(section==="games")await expect(page.getByText("Standalone product catalog")).toBeVisible();
    if(section==="homework")await expect(page.getByRole("heading", { name: "Grade > Topic > Lesson" })).toBeVisible();
    if(section==="quizzes")await expect(page.getByRole("heading", { name: "Grade > Topic" })).toBeVisible();
  }
  await page.goto("/admin/map-prep");
  await expect(page).toHaveURL(/\/admin\?section=map-prep$/);
  await expect(page.getByRole("heading", { name: "MAP Prep destination" })).toBeVisible();
  await expect(
    page.getByLabel("Primary authoring actions").getByRole("link", { name: "Edit Destination", exact: true }),
  ).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("navigation", { name: "Admin modules" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  await expect(page.getByRole("link", { name: /Users/ })).toHaveCSS("outline-style", /none|solid/);

  await context.setOffline(true);
  await expect(page.getByText("You are offline.")).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText("You are offline.")).toHaveCount(0);
});
