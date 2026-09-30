import { spawnSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

/**
 * Phase 2B: the 2-hour absolute / 60-minute idle Super Admin session.
 * Session times are moved with local SQL so the boundaries are tested without
 * waiting two hours. Local-only: the runner restricts Supabase to 127.0.0.1.
 */
const url = process.env.SUPABASE_TEST_URL ?? "";
const secretKey = process.env.SUPABASE_TEST_SECRET_KEY ?? "";
const LOCAL_DATABASE = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const ORIGIN = "http://127.0.0.1:3000";
const run = `phase2b-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const ownerEmail = `${run}-owner@example.test`;
const accountEmail = `${run}-account@example.test`;
const password = "SyntheticAdmin42!";
let client: SupabaseClient;
let owner: User;
let account: User;
let adminUserId = "";

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

/** A code from a window no earlier verification in this run has used. */
async function nextTotpWindow(): Promise<void> {
  await new Promise((done) => setTimeout(done, 30_000 - (Date.now() % 30_000) + 750));
}

function sql(query: string): Array<Record<string, unknown>> {
  const result = spawnSync(process.execPath, [resolve("node_modules/supabase/dist/supabase.js"), "db", "query", "--db-url", LOCAL_DATABASE, "-o", "json", query, "--yes"], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`local SQL failed: ${result.stderr || result.stdout}`);
  // Statements that return no rows (UPDATE) print no JSON document.
  const start = result.stdout.indexOf("{");
  if (start === -1) return [];
  const parsed = JSON.parse(result.stdout.slice(start)) as { rows?: Array<Record<string, unknown>> };
  return parsed.rows ?? [];
}

/** Moves the owner's live admin session in time (all values relative to the database clock). */
function reshapeLiveSession(assignments: string) {
  sql(`update public.admin_sessions set ${assignments} where id = (select id from public.admin_sessions
    where admin_user_id = '${adminUserId}' and ended_at is null order by started_at desc limit 1)`);
}

async function liveSession() {
  const result = await client.from("admin_sessions").select("id,started_at,expires_at,last_activity_at,step_up_at,ended_at,end_reason")
    .eq("admin_user_id", adminUserId).is("ended_at", null).order("started_at", { ascending: false }).limit(1).single();
  if (result.error) throw result.error;
  return result.data;
}

async function signInWithPassword(page: Page, path = "/admin/sign-in") {
  await page.goto(path);
  await page.getByLabel("Owner email address").fill(ownerEmail);
  await page.locator("input[name=\"password\"]").fill(password);
  await page.getByRole("button", { name: "Continue securely" }).click();
}

test.beforeAll(async () => {
  expect(url).toBe("http://127.0.0.1:55321");
  client = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const model = await client.rpc("set_platform_identity_model", { p_identity_model: "consumer-v1" });
  if (model.error) throw model.error;
  const createdOwner = await client.auth.admin.createUser({ email: ownerEmail, password, email_confirm: true });
  const createdAccount = await client.auth.admin.createUser({ email: accountEmail, password, email_confirm: true });
  if (createdOwner.error || !createdOwner.data.user) throw createdOwner.error ?? new Error("Owner fixture unavailable");
  if (createdAccount.error || !createdAccount.data.user) throw createdAccount.error ?? new Error("Account fixture unavailable");
  owner = createdOwner.data.user;
  account = createdAccount.data.user;
  const inserted = await client.from("admin_users").insert({ user_id: owner.id, role: "owner", mfa_enrolled: false }).select("id").single();
  if (inserted.error) throw inserted.error;
  adminUserId = inserted.data.id;
});

test.afterAll(async () => {
  if (account) await client.auth.admin.deleteUser(account.id);
  if (owner) await client.auth.admin.deleteUser(owner.id);
  await client.rpc("set_platform_identity_model", { p_identity_model: "legacy-preview" });
});

test("the Super Admin session lasts 2 hours, ends after 60 idle minutes, and protects sensitive actions", async ({ page }) => {
  test.setTimeout(420_000);
  let secret = "";

  await test.step("sign in to a 2-hour, Lax, HttpOnly admin session with a visible countdown", async () => {
    await signInWithPassword(page);
    await expect(page).toHaveURL(/\/admin\/mfa$/);
    await page.getByRole("button", { name: "Set up authenticator" }).click();
    secret = (await page.locator("code.admin-setup-secret").textContent())?.trim() ?? "";
    await page.getByLabel("Six-digit authenticator code").fill(totp(secret));
    await page.getByRole("button", { name: "Verify and open admin" }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("heading", { name: "MathNexa Super Admin" })).toBeVisible();

    const session = await liveSession();
    const lifetime = Date.parse(session.expires_at) - Date.parse(session.started_at);
    expect(lifetime).toBeGreaterThan(119 * 60_000);
    expect(lifetime).toBeLessThanOrEqual(120 * 60_000);

    const cookie = (await page.context().cookies()).find((entry) => entry.name === "mvh-admin-session");
    expect(cookie).toMatchObject({ sameSite: "Lax", httpOnly: true, path: "/admin", secure: false });
    expect(Math.abs((cookie?.expires ?? 0) * 1000 - Date.parse(session.expires_at))).toBeLessThan(90_000);
    expect(await page.evaluate(() => document.cookie.includes("mvh-admin-session"))).toBe(false);
    const stored = await page.evaluate(() => [...Object.keys(localStorage), ...Object.keys(sessionStorage)].join(" "));
    expect(stored).not.toMatch(/admin|session/i);

    const clock = page.locator(".admin-session-clock");
    await expect(clock).toContainText("Session");
    await expect(clock).toContainText(/(1h 5\dm|2h) remaining/);
  });

  await test.step("a double click or a replayed form cannot run an operation twice", async () => {
    await page.goto("/admin?section=users");
    const card = page.locator(".admin-account-card").filter({ hasText: accountEmail });
    await card.getByRole("button", { name: "Grant complimentary access" }).click();
    const dialog = page.getByRole("dialog", { name: "Grant complimentary access" });
    await dialog.getByLabel("Required reason").fill("Approved local owner walkthrough");
    await dialog.getByLabel(/I confirm the named account/).check();
    const replay = await dialog.locator("form").evaluate((form) => Object.fromEntries(new FormData(form as HTMLFormElement)) as Record<string, string>);
    expect(replay.idempotencyKey).toBeTruthy();
    const posts: string[] = [];
    page.on("request", (request) => { if (request.method() === "POST" && request.url().endsWith("/admin/users/action")) posts.push(request.url()); });
    await dialog.getByRole("button", { name: "Confirm grant complimentary access" }).dblclick();
    await expect(page).toHaveURL(/account=grant-complimentary-succeeded/);
    expect(posts, "only one submission leaves the browser").toHaveLength(1);

    const replayed = await page.request.post(`${ORIGIN}/admin/users/action`, { form: replay, headers: { Origin: ORIGIN }, maxRedirects: 0 });
    expect(replayed.status()).toBe(303);
    expect(replayed.headers().location).toContain("account=already-completed");
    const operations = await client.from("admin_account_operations").select("id,operation_state", { count: "exact" })
      .eq("target_user_id", account.id).eq("operation", "grant-complimentary");
    expect(operations.count).toBe(1);
    expect(operations.data?.[0]?.operation_state).toBe("succeeded");
    const grants = await client.from("consumer_complimentary_entitlements").select("id", { count: "exact", head: true }).eq("owner_user_id", account.id);
    expect(grants.count).toBe(1);
    const suppressed = await client.from("admin_audit_log").select("metadata").eq("action", "admin.account.operation.duplicate-suppressed").eq("target", account.id);
    expect(suppressed.data).toHaveLength(1);
    expect(suppressed.data?.[0]?.metadata).toMatchObject({ operation: "grant-complimentary", operation_state: "succeeded" });
  });

  await test.step("sensitive operations ask for a fresh authenticator code; safe ones do not", async () => {
    reshapeLiveSession("started_at = now() - interval '30 minutes', step_up_at = now() - interval '30 minutes', expires_at = now() + interval '90 minutes'");
    await page.goto("/admin?section=users");
    const card = page.locator(".admin-account-card").filter({ hasText: accountEmail });

    await card.getByText("Support notes and audit history").click();
    await card.getByLabel("Add immutable support note").fill("Checked the step-up flow locally.");
    await card.getByRole("button", { name: "Add audited note" }).click();
    await expect(page).toHaveURL(/account=note-added/);

    const refreshed = page.locator(".admin-account-card").filter({ hasText: accountEmail });
    await refreshed.getByRole("button", { name: "Suspend account" }).click();
    let dialog = page.getByRole("dialog", { name: "Suspend account" });
    await expect(dialog.getByLabel("Authenticator code")).toBeVisible();
    await dialog.getByLabel("Required reason").fill("Verified account access safety review");
    await dialog.getByLabel("Authenticator code").fill("000000");
    await dialog.getByLabel(/I confirm the named account/).check();
    await dialog.getByRole("button", { name: "Confirm suspend account" }).click();
    await expect(page).toHaveURL(/account=step-up-failed/);
    await expect(page.getByText("The authenticator code was not accepted. Nothing was changed.")).toBeVisible();
    expect((await client.from("consumer_accounts").select("account_status").eq("user_id", account.id).single()).data?.account_status).toBe("active");
    expect((await client.from("admin_audit_log").select("id", { count: "exact", head: true }).eq("action", "admin.step-up.failure").eq("admin_user_id", adminUserId)).count).toBe(1);

    await nextTotpWindow();
    await page.locator(".admin-account-card").filter({ hasText: accountEmail }).getByRole("button", { name: "Suspend account" }).click();
    dialog = page.getByRole("dialog", { name: "Suspend account" });
    await dialog.getByLabel("Required reason").fill("Verified account access safety review");
    await dialog.getByLabel("Authenticator code").fill(totp(secret));
    await dialog.getByLabel(/I confirm the named account/).check();
    await dialog.getByRole("button", { name: "Confirm suspend account" }).click();
    await expect(page).toHaveURL(/account=suspend-succeeded/);
    expect((await client.from("consumer_accounts").select("account_status").eq("user_id", account.id).single()).data?.account_status).toBe("suspended");
    const session = await liveSession();
    expect(Date.now() - Date.parse(session.step_up_at)).toBeLessThan(120_000);
    expect(Date.parse(session.expires_at) - Date.parse(session.started_at), "step-up never extends the session").toBe(120 * 60_000);
    expect((await client.from("admin_audit_log").select("id", { count: "exact", head: true }).eq("action", "admin.step-up.success").eq("target", session.id)).count).toBe(1);
  });

  await test.step("the idle warning offers Stay signed in, which never moves the 2-hour limit", async () => {
    // Every admin page view is activity, so the idle warning only appears while
    // the administrator stays on one page: advance the browser clock instead.
    reshapeLiveSession("started_at = now() - interval '55 minutes', step_up_at = now() - interval '55 minutes', expires_at = now() + interval '65 minutes', last_activity_at = now() - interval '2 minutes'");
    await page.clock.install();
    await page.goto("/admin");
    const warning = page.locator(".admin-session-warning");
    await expect(warning).toHaveCount(0);
    // Wait for hydration (the shell's keyboard shortcut is installed by the same
    // effects as the countdown) before moving the browser clock.
    await page.keyboard.press("Control+k");
    await expect(page.getByRole("searchbox", { name: "Find an admin area" })).toBeFocused();
    await page.clock.fastForward("51:00");
    await expect(warning).toContainText(/will end in \d+ minutes? because of inactivity/);
    await expect(page.getByRole("status").filter({ hasText: /because of inactivity/ })).toHaveCount(1);
    await expect(warning.getByText(/2-hour limit does not change/)).toBeVisible();
    // Match the database to the simulated idle time so the explicit action has something to refresh.
    reshapeLiveSession("last_activity_at = now() - interval '52 minutes'");
    const before = await liveSession();
    await warning.getByRole("button", { name: "Stay signed in" }).click();
    await expect(warning).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: /still ends at the 2-hour limit/ })).toHaveCount(1);
    const after = await liveSession();
    expect(Date.now() - Date.parse(after.last_activity_at)).toBeLessThan(60_000);
    expect(after.expires_at, "Stay signed in never moves the absolute limit").toBe(before.expires_at);
  });

  await test.step("an idle session ends and the administrator returns to the same page after signing in again", async () => {
    reshapeLiveSession("started_at = now() - interval '70 minutes', step_up_at = now() - interval '70 minutes', expires_at = now() + interval '50 minutes', last_activity_at = now() - interval '61 minutes'");
    const idle = await liveSession();
    await page.goto("/admin?section=users");
    await expect(page).toHaveURL(`${ORIGIN}/admin/sign-in?expired=1&next=%2Fadmin%3Fsection%3Dusers`);
    await expect(page.getByText("Your Super Admin session ended.")).toBeVisible();
    const ended = await client.from("admin_sessions").select("ended_at,end_reason").eq("id", idle.id).single();
    expect(ended.data).toMatchObject({ end_reason: "idle-expired" });
    const endAudit = await client.from("admin_audit_log").select("metadata").eq("action", "admin.session.ended").eq("target", idle.id).single();
    expect(endAudit.data?.metadata).toMatchObject({ reason: "idle-expired" });

    await page.getByLabel("Owner email address").fill(ownerEmail);
    await page.locator("input[name=\"password\"]").fill(password);
    await page.getByRole("button", { name: "Continue securely" }).click();
    await expect(page).toHaveURL(/\/admin\/mfa\?next=%2Fadmin%3Fsection%3Dusers$/);
    await nextTotpWindow();
    await page.getByLabel("Six-digit authenticator code").fill(totp(secret));
    await page.getByRole("button", { name: "Verify and open admin" }).click();
    await expect(page).toHaveURL(`${ORIGIN}/admin?section=users`);
    await expect(page.getByRole("heading", { name: "Accounts and access" })).toBeVisible();
  });

  await test.step("the absolute limit cannot be extended by activity and ends cleanly", async () => {
    reshapeLiveSession("started_at = now() - interval '117 minutes', step_up_at = now() - interval '117 minutes', expires_at = now() + interval '3 minutes', last_activity_at = now() - interval '2 minutes'");
    const before = await liveSession();
    const csrfToken = await page.locator("form input[name=\"csrfToken\"]").first().inputValue();
    const kept = await page.request.post(`${ORIGIN}/admin/session/activity`, { form: { csrfToken }, headers: { Origin: ORIGIN } });
    expect(kept.status()).toBe(200);
    const body = await kept.json() as { absoluteExpiresAt: string };
    expect(Date.parse(body.absoluteExpiresAt)).toBe(Date.parse(before.expires_at));
    expect((await liveSession()).expires_at).toBe(before.expires_at);

    reshapeLiveSession("started_at = now() - interval '125 minutes', step_up_at = now() - interval '125 minutes', expires_at = now() - interval '5 minutes', last_activity_at = now() - interval '6 minutes'");
    await page.goto("/admin?section=settings");
    await expect(page).toHaveURL(`${ORIGIN}/admin/sign-in?expired=1&next=%2Fadmin%3Fsection%3Dsettings`);
    const expired = await client.from("admin_sessions").select("end_reason").eq("id", before.id).single();
    expect(expired.data?.end_reason).toBe("expired");
    const blocked = await page.request.post(`${ORIGIN}/admin/users/action`, { form: { csrfToken, operation: "sync-billing" }, headers: { Origin: ORIGIN, Referer: `${ORIGIN}/admin?section=users` }, maxRedirects: 0 });
    expect(blocked.status(), "a form posted after expiry is redirected to sign in, not run").toBe(303);
    expect(blocked.headers().location).toContain("/admin/sign-in?expired=1&next=%2Fadmin%3Fsection%3Dusers");
  });

  await test.step("another site can neither keep the session alive nor put text into the workspace", async () => {
    await signInWithPassword(page);
    await expect(page).toHaveURL(/\/admin\/mfa$/);
    await nextTotpWindow();
    await page.getByLabel("Six-digit authenticator code").fill(totp(secret));
    await page.getByRole("button", { name: "Verify and open admin" }).click();
    await expect(page).toHaveURL(/\/admin$/);
    reshapeLiveSession("started_at = now() - interval '10 minutes', step_up_at = now() - interval '10 minutes', expires_at = now() + interval '110 minutes', last_activity_at = now() - interval '5 minutes'");
    const before = await liveSession();
    const crossSite = await page.request.get(`${ORIGIN}/admin?section=users&account=call-support-now`, { headers: { "Sec-Fetch-Site": "cross-site" } });
    expect(crossSite.status()).toBe(200);
    expect(await crossSite.text()).not.toContain("call support now");
    expect((await liveSession()).last_activity_at, "a cross-site request is not activity").toBe(before.last_activity_at);
    const sameOrigin = await page.request.get(`${ORIGIN}/admin?section=users&account=note-added`, { headers: { "Sec-Fetch-Site": "same-origin" } });
    expect(await sameOrigin.text()).toContain("note added");
    expect(Date.now() - Date.parse((await liveSession()).last_activity_at), "the administrator's own request is activity").toBeLessThan(60_000);
  });

  await test.step("signing out after the browser dropped the admin cookie still ends the sign-in", async () => {
    await page.goto("/admin");
    await page.context().clearCookies({ name: "mvh-admin-session" });
    await page.getByRole("button", { name: "End admin session" }).click();
    await expect(page).toHaveURL(/\/admin\/sign-in\?signedOut=1$/);
    expect((await page.context().cookies()).some((cookie) => cookie.name.startsWith("sb-") && cookie.value), "the Supabase sign-in is gone").toBe(false);
  });

  await test.step("an untrusted destination is never used after signing in", async () => {
    for (const next of ["https://evil.example/", "//evil.example/admin", "/account", "/admin/users/action"]) {
      await page.goto(`/admin/sign-in?expired=1&next=${encodeURIComponent(next)}`);
      await expect(page.getByLabel("Owner email address")).toBeVisible();
      await expect(page.locator("input[name=\"next\"]"), next).toHaveCount(0);
    }
  });
});

test("the session indicator fits the admin header on phone, tablet and desktop", async ({ page }) => {
  test.setTimeout(180_000);
  const second = await client.auth.admin.createUser({ email: `${run}-layout@example.test`, password, email_confirm: true });
  if (second.error || !second.data.user) throw second.error ?? new Error("Layout fixture unavailable");
  const layoutAdmin = await client.from("admin_users").insert({ user_id: second.data.user.id, role: "owner", mfa_enrolled: false }).select("id").single();
  if (layoutAdmin.error) throw layoutAdmin.error;
  try {
    await page.goto("/admin/sign-in");
    await page.getByLabel("Owner email address").fill(`${run}-layout@example.test`);
    await page.locator("input[name=\"password\"]").fill(password);
    await page.getByRole("button", { name: "Continue securely" }).click();
    await page.getByRole("button", { name: "Set up authenticator" }).click();
    const layoutSecret = (await page.locator("code.admin-setup-secret").textContent())?.trim() ?? "";
    await page.getByLabel("Six-digit authenticator code").fill(totp(layoutSecret));
    await page.getByRole("button", { name: "Verify and open admin" }).click();
    await expect(page).toHaveURL(/\/admin$/);
    for (const [width, height] of [[390, 844], [768, 1024], [1024, 768], [1440, 900]]) {
      await page.setViewportSize({ width, height });
      await page.goto("/admin?section=users");
      const clock = page.locator(".admin-session-clock");
      await expect(clock, `${width}px`).toBeVisible();
      const box = await clock.boundingBox();
      expect(box && box.x >= 0 && box.x + box.width <= width + 1, `${width}px clock inside the viewport`).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${width}px no horizontal scroll`).toBe(true);
      await expect(page.getByRole("button", { name: "End admin session" })).toBeVisible();
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.keyboard.press("Tab");
    const signOut = page.getByRole("button", { name: "End admin session" });
    await signOut.focus();
    await expect(signOut).toBeFocused();
  } finally {
    await client.auth.admin.deleteUser(second.data.user.id);
  }
});
