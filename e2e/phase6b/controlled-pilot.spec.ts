import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

const url = process.env.SUPABASE_TEST_URL ?? "";
const publicKey = process.env.SUPABASE_TEST_PUBLISHABLE_KEY ?? "";
const secretKey = process.env.SUPABASE_TEST_SECRET_KEY ?? "";
const run = `phase6b-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
const email = `${run}-teacher@example.test`;
const forgedEmail = `${run}-forged@example.test`;
const password = "SyntheticAdult42!";
let admin: SupabaseClient;
let teacher: User;

test.beforeAll(async () => {
  expect(url).toMatch(/^http:\/\/127\.0\.0\.1:/);
  admin = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const result = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: "Synthetic Adult Teacher" } });
  if (result.error || !result.data.user) throw result.error ?? new Error("Synthetic teacher was not created.");
  teacher = result.data.user;
});

test.afterAll(async () => {
  if (teacher) {
    const deleted = await admin.auth.admin.deleteUser(teacher.id);
    if (deleted.error) throw deleted.error;
  }
  const users = await admin.auth.admin.listUsers();
  expect(users.data.users.filter((user) => user.email === email || user.email === forgedEmail)).toHaveLength(0);
  for (const [table, column] of [
    ["teacher_profiles", "user_id"], ["teacher_classes", "owner_teacher_id"], ["teacher_activities", "owner_teacher_id"],
    ["product_entitlements", "teacher_user_id"], ["account_deletion_requests", "owner_teacher_id"], ["billing_customers", "owner_teacher_id"]
  ] as const) {
    expect((await admin.from(table).select(column, { count: "exact", head: true }).eq(column, teacher.id)).count).toBe(0);
  }
});

test("browser-controlled state cannot activate an incomplete controlled pilot", async ({ page, context }) => {
  await context.addCookies([{ name: "mvh_pilot_state", value: "active", url: "http://127.0.0.1:3000" }]);
  await page.addInitScript(() => localStorage.setItem("MVH_PILOT_STATE", "active"));
  await page.goto("/pilot?pilot=active&activation=active#active");
  const banner = page.getByLabel("Restricted pilot status");
  await expect(banner).toHaveAttribute("data-pilot-state", "preparing");
  await expect(banner).toHaveAttribute("data-pilot-activation", "inactive");
  await expect(banner).toContainText("No organization labels");
  await expect(page.getByRole("heading", { name: "Pilot preparing" })).toBeVisible();
  await expect(page.getByText(/Exact pilot dates have not been approved/)).toHaveCount(0);
});

test("organization-label fields are absent and forged signup metadata is rejected", async ({ page }) => {
  await page.goto("/sign-up");
  await expect(page.getByLabel(/School or organization/i)).toHaveCount(0);
  await expect(page.getByText(/Organization labels are disabled/)).toBeVisible();
  await page.getByLabel("Email address").fill(forgedEmail);
  await page.getByLabel("Display name").fill("Forged Teacher");
  await page.locator("#signup-password").fill(password);
  await page.locator("#signup-password-confirmation").fill(password);
  await page.locator("form").evaluate((form) => {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "schoolLabel";
    input.value = "Forged School";
    form.append(input);
  });
  await page.getByRole("button", { name: "Create teacher account" }).click();
  await expect(page.getByText(/School and organization labels are not accepted/)).toBeVisible();
  const users = await admin.auth.admin.listUsers();
  expect(users.data.users.some((user) => user.email === forgedEmail)).toBe(false);
});

test("profile forgery is rejected by the server action and database", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/teacher$/);
  await page.goto("/account");
  await expect(page.getByLabel(/School or organization/i)).toHaveCount(0);
  const form = page.getByRole("button", { name: "Update profile" }).locator("xpath=ancestor::form");
  await form.evaluate((element) => {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "schoolLabel";
    input.value = "Forged District";
    element.append(input);
  });
  await page.getByRole("button", { name: "Update profile" }).click();
  await expect(page.getByText(/cannot be saved during the controlled pilot/)).toBeVisible();
  expect((await admin.from("teacher_profiles").select("school_or_organization_label").eq("user_id", teacher.id).single()).data?.school_or_organization_label).toBeNull();

  const browserClient = createClient(url, publicKey, { auth: { persistSession: false } });
  expect((await browserClient.auth.signInWithPassword({ email, password })).error).toBeNull();
  const forged = await browserClient.from("teacher_profiles").update({ school_or_organization_label: "Forged Institution" }).eq("user_id", teacher.id);
  expect(forged.error).not.toBeNull();
});

test("Auth copy is truthful, generic, and redirects remain internal", async ({ page }) => {
  await page.goto("/forgot-password");
  await expect(page.locator("[data-auth-email-state='local-capture']")).toBeVisible();
  await page.getByLabel("Email address").fill(`${run}-unknown@example.test`);
  await page.getByRole("button", { name: "Send recovery message" }).click();
  await expect(page.getByText(/^If that teacher account exists,/)).toBeVisible();
  await page.goto("/auth/callback?code=malformed&next=https://attacker.example/steal");
  await expect(page).toHaveURL(/\/sign-in\?error=callback$/);
});

test("controlled-pilot surfaces remain accessible across representative viewports", async ({ page }) => {
  for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }, { width: 768, height: 1024 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/pilot");
    await expect(page.locator("h1")).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  await page.goto("/pilot");
  const privacy = page.getByRole("navigation", { name: "Pilot readiness" }).getByRole("link", { name: "Privacy" });
  await privacy.focus();
  await expect(privacy).toBeFocused();
});
