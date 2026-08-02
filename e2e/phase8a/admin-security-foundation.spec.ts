import { createHmac } from "node:crypto";

import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

const url = process.env.SUPABASE_TEST_URL ?? "";
const secretKey = process.env.SUPABASE_TEST_SECRET_KEY ?? "";
const run = `phase8a-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
const ownerEmail = `${run}-owner@example.test`;
const ordinaryEmail = `${run}-ordinary@example.test`;
const password = "SyntheticAdmin42!";
let adminClient: SupabaseClient;
let ownerUser: User;
let ordinaryUser: User;
let adminUserId = "";

function decodeBase32(value: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of value.replaceAll("=", "").toUpperCase()) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error("Invalid TOTP setup key");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  return Buffer.from(bytes);
}

function totp(secret: string): string {
  const counter = BigInt(Math.floor(Date.now() / 30_000));
  const payload = Buffer.alloc(8);
  payload.writeBigUInt64BE(counter);
  const digest = createHmac("sha1", decodeBase32(secret)).update(payload).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const value = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(value).padStart(6, "0");
}

async function signIn(page: Page, email: string, submittedPassword = password) {
  await page.goto("/admin/sign-in");
  await page.getByLabel("Owner email address").fill(email);
  await page.getByLabel("Password").fill(submittedPassword);
  await page.getByRole("button", { name: "Continue securely" }).click();
}

async function closeContext(context: BrowserContext) {
  await context.close().catch(() => undefined);
}

test.beforeAll(async () => {
  expect(url).toMatch(/^http:\/\/127\.0\.0\.1:/);
  adminClient = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const owner = await adminClient.auth.admin.createUser({ email: ownerEmail, password, email_confirm: true });
  const ordinary = await adminClient.auth.admin.createUser({ email: ordinaryEmail, password, email_confirm: true });
  if (owner.error || !owner.data.user) throw owner.error ?? new Error("Owner fixture unavailable");
  if (ordinary.error || !ordinary.data.user) throw ordinary.error ?? new Error("Ordinary fixture unavailable");
  ownerUser = owner.data.user;
  ordinaryUser = ordinary.data.user;
  const inserted = await adminClient.from("admin_users").insert({ user_id: ownerUser.id, role: "owner", mfa_enrolled: false }).select("id").single();
  if (inserted.error) throw inserted.error;
  adminUserId = inserted.data.id;
});

test.afterAll(async () => {
  if (ownerUser) await adminClient.auth.admin.deleteUser(ownerUser.id);
  if (ordinaryUser) await adminClient.auth.admin.deleteUser(ordinaryUser.id);
});

test("unauthenticated and forged-cookie requests cannot open the admin shell", async ({ browser }) => {
  const context = await browser.newContext();
  try {
    await context.addCookies([{ name: "mvh-admin-session", value: "forged-admin=true", domain: "127.0.0.1", path: "/admin" }]);
    const page = await context.newPage();
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/sign-in$/);
    await expect(page.getByRole("heading", { name: "MathNexa Super Admin" })).toHaveCount(0);
    await expect(page.getByText("Authorized owner only.")).toBeVisible();
  } finally { await closeContext(context); }
});

test("an authenticated non-admin receives a genuine not-found response", async ({ browser }) => {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto("/sign-in");
    await page.getByLabel("Email address").fill(ordinaryEmail);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/teacher$/);
    const response = await page.goto("/admin");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "This page could not be found." })).toBeVisible();
    await expect(page.getByRole("heading", { name: "MathNexa Super Admin" })).toHaveCount(0);
  } finally { await closeContext(context); }
});

test("owner requires TOTP, receives a short server session, and is denied immediately after revocation", async ({ page }) => {
  await signIn(page, ownerEmail, "WrongAdmin42!");
  await expect(page.locator(".error-summary")).toContainText("email or password was not accepted");

  await page.getByLabel("Owner email address").fill(ownerEmail);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Continue securely" }).click();
  await expect(page).toHaveURL(/\/admin\/mfa$/);
  await expect(page.getByRole("heading", { name: "MathNexa Super Admin" })).toHaveCount(0);

  await page.getByRole("button", { name: "Set up authenticator" }).click();
  const secret = (await page.locator("code.admin-setup-secret").textContent())?.trim() ?? "";
  expect(secret).toMatch(/^[A-Z2-7]+$/);
  await page.getByLabel("Six-digit authenticator code").fill("000000");
  await page.getByRole("button", { name: "Verify and open admin" }).click();
  await expect(page.locator(".error-summary")).toContainText("verification code was not accepted");

  await page.getByLabel("Six-digit authenticator code").fill(totp(secret));
  await page.getByRole("button", { name: "Verify and open admin" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "MathNexa Super Admin" })).toBeVisible();
  await expect(page.getByText("Coming in a later phase")).toHaveCount(12);
  await expect(page.getByText(/separate ShowMe Math Admin/)).toBeVisible();

  const activeSession = await adminClient.from("admin_sessions")
    .select("expires_at,started_at,ended_at,revoked_at").eq("admin_user_id", adminUserId).single();
  if (activeSession.error) throw activeSession.error;
  expect(Date.parse(activeSession.data.expires_at) - Date.parse(activeSession.data.started_at)).toBeLessThanOrEqual(15 * 60_000 + 1_000);
  expect(activeSession.data).toMatchObject({ ended_at: null, revoked_at: null });

  const revoked = await adminClient.rpc("revoke_admin_access", {
    p_user_id: ownerUser.id,
    p_reason: "Phase 8A browser revocation verification",
    p_ip: "127.0.0.1",
    p_user_agent: "Playwright Phase 8A"
  });
  if (revoked.error) throw revoked.error;
  expect(revoked.data).toBe(1);

  const response = await page.goto("/admin");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "MathNexa Super Admin" })).toHaveCount(0);

  const audit = await adminClient.from("admin_audit_log").select("action,metadata")
    .or(`admin_user_id.eq.${adminUserId},admin_user_id.is.null`);
  if (audit.error) throw audit.error;
  const actions = audit.data.map((entry) => entry.action);
  for (const action of ["admin.login.success", "admin.login.failure", "admin.mfa.success", "admin.mfa.failure", "admin.session.started", "admin.revoked"]) {
    expect(actions).toContain(action);
  }
});
