import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

const run = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const password = "BillingTest42!";
const url = process.env.SUPABASE_TEST_URL!;
const key = process.env.SUPABASE_TEST_SECRET_KEY!;
let admin: SupabaseClient; let active: User; let suspended: User; let deletion: User;
let checkoutStatusUrl = "";
async function signIn(page: Page, user: User) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(user.email!);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/teacher$/);
}

test.beforeAll(async () => {
  admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const make = async (name: string) => { const slug = name.toLowerCase().replaceAll(" ", "-"); const result = await admin.auth.admin.createUser({ email: `${slug}-${run}@example.test`, password, email_confirm: true, user_metadata: { display_name: name } }); if (!result.data.user) throw result.error; return result.data.user; };
  active = await make("Billing Active"); suspended = await make("Billing Suspended"); deletion = await make("Billing Deletion");
  await admin.from("teacher_profiles").update({ account_status: "suspended" }).eq("user_id", suspended.id);
  await admin.from("teacher_profiles").update({ account_status: "deletion_requested" }).eq("user_id", deletion.id);
});
test.afterAll(async () => { for (const user of [active, suspended, deletion]) if (user) await admin.auth.admin.deleteUser(user.id); });

test("signed-out and restricted teachers cannot start Checkout", async ({ page }) => {
  await page.goto("/pricing"); await page.getByRole("button", { name: "Test monthly Checkout" }).click(); await expect(page).toHaveURL(/\/sign-in/);
  await signIn(page, suspended); await page.goto("/pricing"); await page.getByRole("button", { name: "Test monthly Checkout" }).click(); await expect(page).toHaveURL(/billing=unavailable/);
  await page.context().clearCookies(); await signIn(page, deletion); await page.goto("/pricing"); await page.getByRole("button", { name: "Test annual Checkout" }).click(); await expect(page).toHaveURL(/billing=unavailable/);
});

test("allowlisted monthly Checkout ignores forged fields and redirect alone grants nothing", async ({ page }) => {
  await signIn(page, active); await page.goto("/pricing");
  await page.locator("form").filter({ has: page.getByRole("button", { name: "Test monthly Checkout" }) }).evaluate((form) => { for (const [name, value] of [["priceId", "price_forged"], ["customerId", "cus_foreign"], ["teacherId", "foreign-teacher"]]) { const forged = document.createElement("input"); forged.name = name; forged.value = value; form.append(forged); } });
  await page.getByRole("button", { name: "Test monthly Checkout" }).click();
  await expect(page).toHaveURL(/\/checkout\/status\?session_id=cs_fixture/);
  checkoutStatusUrl = page.url();
  await expect(page.getByRole("heading", { name: "Checkout status" })).toBeVisible();
  await expect(page.getByText("This page does not grant access by itself.")).toBeVisible();
  const entitlements = await admin.from("product_entitlements").select("id").eq("teacher_user_id", active.id); expect(entitlements.data).toEqual([]);
  const customers = await admin.from("billing_customers").select("stripe_environment").eq("owner_teacher_id", active.id); expect(customers.data).toEqual([{ stripe_environment: "test" }]);
  await page.goto("/pricing"); await page.getByRole("button", { name: "Test annual Checkout" }).click(); await expect(page).toHaveURL(/\/checkout\/status\?session_id=cs_fixture/);
  await page.goto("/pricing?checkout=canceled"); await expect(page.getByText("Checkout canceled")).toBeVisible();
});

test("open redirects and duplicate subscriptions fail closed while verified owner can open portal", async ({ page }) => {
  await signIn(page, active); await page.goto("/pricing");
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Test annual Checkout" }) });
  await form.locator("input[name=returnDestination]").evaluate((input) => { (input as HTMLInputElement).value = "https://attacker.example"; });
  await page.getByRole("button", { name: "Test annual Checkout" }).click(); await expect(page).toHaveURL(/billing=unavailable/);
  const mapping = await admin.from("billing_customers").select("id, stripe_customer_id").eq("owner_teacher_id", active.id).single();
  await admin.from("billing_subscriptions").insert({ owner_teacher_id: active.id, billing_customer_id: mapping.data!.id, stripe_environment: "test", stripe_subscription_id: `sub_${run.replace(/[^A-Za-z0-9]/g, "")}`, product_key: "math-vocabulary-hunt", plan_key: "teacher-pro-monthly", stripe_price_id: "price_monthly123", subscription_status: "active", current_period_start: new Date(Date.now() - 86400000).toISOString(), current_period_end: new Date(Date.now() + 86400000 * 30).toISOString(), latest_authoritative_event_created_at: new Date().toISOString() });
  await page.goto("/pricing"); await page.getByRole("button", { name: "Test monthly Checkout" }).click(); await expect(page).toHaveURL(/billing=unavailable/);
  await page.goto("/account"); await expect(page.getByText("Teacher Pro active")).toBeVisible(); await page.getByRole("button", { name: "Manage billing" }).click(); await expect(page).toHaveURL(/billing=fixture-portal/);
  const mappingBeforeReview = await admin.from("billing_customers").select("stripe_customer_id").eq("owner_teacher_id", active.id).single();
  await admin.from("billing_customers").update({ stripe_customer_id: "cus_manualreview" }).eq("owner_teacher_id", active.id);
  await page.goto(checkoutStatusUrl); await expect(page.getByText("Billing review needed")).toBeVisible();
  await admin.from("billing_customers").update({ stripe_customer_id: mappingBeforeReview.data!.stripe_customer_id }).eq("owner_teacher_id", active.id);
});

test("account communicates payment issue and cancel-at-period-end without technical IDs", async ({ page }) => {
  await signIn(page, active);
  await admin.from("billing_subscriptions").update({ cancel_at_period_end: true }).eq("owner_teacher_id", active.id); await page.goto("/account"); await expect(page.getByText("Teacher Pro ending at period end")).toBeVisible();
  await admin.from("billing_subscriptions").update({ subscription_status: "past_due" }).eq("owner_teacher_id", active.id); await page.reload(); await expect(page.getByText("Payment needs attention")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/cus_|sub_|price_|evt_/);
});

test("pricing and status reflow with accessible controls", async ({ page }) => {
  for (const viewport of [{ width: 320, height: 640 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport); await page.goto("/pricing");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    for (const button of await page.locator("main button.button").all()) expect((await button.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" }); await page.goto("/pricing"); await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await page.getByRole("button", { name: "Test monthly Checkout" }).focus(); await page.keyboard.press("Enter"); await expect(page).toHaveURL(/\/sign-in/);
  await signIn(page, suspended); await page.goto("/account"); await expect(page.getByRole("button", { name: "Manage billing" })).toHaveCount(0);
});
