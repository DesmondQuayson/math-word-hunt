import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

const run = `${Date.now()}${Math.random().toString(16).slice(2)}`;
const password = "Phase3Local42!";
const url = process.env.SUPABASE_TEST_URL!;
const publicKey = process.env.SUPABASE_TEST_PUBLISHABLE_KEY!;
const secretKey = process.env.SUPABASE_TEST_SECRET_KEY!;
let admin: SupabaseClient;
let freeTeacher: User;
let concurrencyTeacher: User;
let downgradeTeacher: User;

async function createTeacher(name: string): Promise<User> {
  const slug = name.toLowerCase().replaceAll(" ", "-");
  const result = await admin.auth.admin.createUser({ email: `${slug}-${run}@example.test`, password, email_confirm: true, user_metadata: { display_name: name } });
  if (result.error || !result.data.user) throw result.error ?? new Error("Teacher creation failed");
  return result.data.user;
}

async function signIn(page: Page, teacher: User) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(teacher.email!);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/teacher$/);
}

test.beforeAll(async () => {
  admin = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  freeTeacher = await createTeacher("Phase Three Free");
  concurrencyTeacher = await createTeacher("Phase Three Concurrent");
  downgradeTeacher = await createTeacher("Phase Three Downgrade");

  await admin.from("teacher_classes").insert(Array.from({ length: 3 }, (_, index) => ({ owner_teacher_id: downgradeTeacher.id, class_name: `Preserved class ${index + 1}`, grade_level: "7" })));
  const customerId = crypto.randomUUID();
  const subscriptionId = crypto.randomUUID();
  const customer = await admin.from("billing_customers").insert({ id: customerId, owner_teacher_id: downgradeTeacher.id, stripe_environment: "test", stripe_customer_id: `cus_Phase3${run}` });
  if (customer.error) throw customer.error;
  const periodStart = new Date(Date.now() - 86_400_000).toISOString();
  const periodEnd = new Date(Date.now() + 30 * 86_400_000).toISOString();
  const subscription = await admin.from("billing_subscriptions").insert({ id: subscriptionId, owner_teacher_id: downgradeTeacher.id, billing_customer_id: customerId, stripe_environment: "test", stripe_subscription_id: `sub_Phase3${run}`, product_key: "math-vocabulary-hunt", plan_key: "teacher-pro-monthly", stripe_price_id: "price_monthly123", subscription_status: "active", current_period_start: periodStart, current_period_end: periodEnd, latest_authoritative_event_created_at: new Date().toISOString() });
  if (subscription.error) throw subscription.error;
  const entitlement = await admin.from("product_entitlements").insert({ teacher_user_id: downgradeTeacher.id, product_key: "math-vocabulary-hunt", scope: "feature", feature_key: "classroom-tools", status: "active", source: "subscription", source_reference: `sub_Phase3${run}`, billing_subscription_id: subscriptionId, starts_at: periodStart, expires_at: periodEnd });
  if (entitlement.error) throw entitlement.error;
});

test.afterAll(async () => {
  for (const user of [freeTeacher, concurrencyTeacher]) if (user) await admin.auth.admin.deleteUser(user.id);
  // The downgrade fixture intentionally remains until the next local reset:
  // billing projections are immutable support records and are never auto-deleted.
});

test("Free packaging enforces visible class limits without affecting canonical play", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("plan", "teacher-pro-annual");
    localStorage.setItem("capability.class.create", "allowed");
    sessionStorage.setItem("activeClassCount", "-100");
  });
  await signIn(page, freeTeacher);
  await expect(page.getByTestId("premium-access-state")).toHaveAttribute("data-access", "denied");
  await expect(page.getByTestId("usage-dashboard-class-capacity")).toContainText("/ 2");
  await page.goto("/teacher/classes/new");
  await page.locator("form").evaluate((form) => {
    for (const [name, value] of [["ownerTeacherId", "forged-owner"], ["planKey", "teacher-pro-annual"], ["activeClassCount", "0"]]) {
      const input = document.createElement("input"); input.name = name; input.value = value; form.append(input);
    }
  });
  await page.getByLabel("Class name").fill("Free class one");
  await page.getByLabel("Grade level").selectOption("6");
  await page.getByRole("button", { name: "Save class" }).click();
  await expect(page.getByText("Class saved to the local teacher account.")).toBeVisible();
  const owned = await admin.from("teacher_classes").select("owner_teacher_id").eq("class_name", "Free class one").single();
  expect(owned.data?.owner_teacher_id).toBe(freeTeacher.id);
  await page.goto("/teacher/classes/new");
  await page.getByLabel("Class name").fill("Free class two");
  await page.getByLabel("Grade level").selectOption("6");
  await page.getByRole("button", { name: "Save class" }).click();
  await expect.poll(async () => (await admin.from("teacher_classes").select("id", { count: "exact", head: true }).eq("owner_teacher_id", freeTeacher.id).eq("status", "active")).count).toBe(2);
  await expect(page.getByText("Current plan limit reached")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save class" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Review Free and Teacher Pro" })).toBeVisible();
  await page.goto("/play");
  await expect(page.getByTestId("legacy-game-launch")).toHaveAttribute("href", /docs\/index\.html/);
});

test("transactional functions serialize concurrent class and activity creation", async () => {
  const client = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signedIn = await client.auth.signInWithPassword({ email: concurrencyTeacher.email!, password });
  expect(signedIn.error).toBeNull();
  await admin.from("teacher_classes").insert({ owner_teacher_id: concurrencyTeacher.id, class_name: "Existing concurrent class", grade_level: "6" });
  const classAttempts = await Promise.all([
    client.rpc("create_teacher_class", { p_class_id: crypto.randomUUID(), p_class_name: "Concurrent class A", p_grade_level: "6", p_period_or_section: null }),
    client.rpc("create_teacher_class", { p_class_id: crypto.randomUUID(), p_class_name: "Concurrent class B", p_grade_level: "6", p_period_or_section: null })
  ]);
  expect(classAttempts.filter((result) => result.error === null)).toHaveLength(1);
  expect(classAttempts.filter((result) => result.error?.message.includes("capability_limit_reached:class.create"))).toHaveLength(1);

  await admin.from("teacher_activities").insert(Array.from({ length: 2 }, () => ({ owner_teacher_id: concurrencyTeacher.id, grade_level: "6", topic_key: "g6-expressions", lesson_key: "g6-3-6", game_mode_key: "team-hunt", time_limit_minutes: 10, team_count: 2 })));
  const activityAttempts = await Promise.all([
    client.rpc("create_teacher_activity", { p_activity_id: crypto.randomUUID(), p_class_id: null, p_grade_level: "6", p_topic_key: "g6-expressions", p_lesson_key: "g6-3-6", p_game_mode_key: "team-hunt", p_time_limit_minutes: 10, p_team_count: 2, p_combine_mode_enabled: false }),
    client.rpc("create_teacher_activity", { p_activity_id: crypto.randomUUID(), p_class_id: null, p_grade_level: "6", p_topic_key: "g6-expressions", p_lesson_key: "g6-3-6", p_game_mode_key: "team-hunt", p_time_limit_minutes: 10, p_team_count: 2, p_combine_mode_enabled: false })
  ]);
  expect(activityAttempts.filter((result) => result.error === null)).toHaveLength(1);
  expect(activityAttempts.filter((result) => result.error?.message.includes("capability_limit_reached:activity.create"))).toHaveLength(1);
  const direct = await client.from("teacher_classes").insert({ owner_teacher_id: freeTeacher.id, class_name: "Forged owner" });
  expect(direct.error?.code).toBe("42501");
  await client.auth.signOut();
});

test("downgrade preserves records and safe edits while Free creation limits apply", async ({ page }) => {
  await signIn(page, downgradeTeacher);
  await page.goto("/account");
  await expect(page.getByTestId("real-account-summary")).toContainText("Teacher Pro Monthly");
  await expect(page.getByTestId("usage-account-class-capacity")).toContainText("/ 25");

  await admin.from("product_entitlements").update({ status: "revoked", expires_at: new Date().toISOString() }).eq("teacher_user_id", downgradeTeacher.id);
  await admin.from("billing_subscriptions").update({ subscription_status: "canceled", canceled_at: new Date().toISOString() }).eq("owner_teacher_id", downgradeTeacher.id);
  await page.goto("/teacher/classes");
  await expect(page.getByText("Preserved class 1")).toBeVisible();
  await expect(page.getByText("Preserved class 2")).toBeVisible();
  await expect(page.getByText("Preserved class 3")).toBeVisible();
  await expect(page.getByText("Current plan limit reached")).toBeVisible();

  await page.getByRole("link", { name: "View class" }).first().click();
  await page.getByLabel("Class name").fill("Preserved class edited");
  await page.getByRole("button", { name: "Save class changes" }).click();
  await expect(page.getByText("Class changes saved.")).toBeVisible();
  await page.goto("/teacher/classes");
  await expect(page.getByText("Preserved class edited")).toBeVisible();

  const archiveButtons = page.getByRole("button", { name: "Archive class" });
  await expect(archiveButtons).toHaveCount(3);
  await archiveButtons.first().click();
  await expect(archiveButtons).toHaveCount(2);
  await archiveButtons.first().click();
  await expect(archiveButtons).toHaveCount(1);
  await page.goto("/teacher/classes/new");
  await expect(page.getByRole("button", { name: "Save class" })).toBeVisible();
  await expect(page.getByText("Your existing work stays safe.")).toBeVisible();
});

test("pricing and unavailable capabilities use honest accessible states across the viewport matrix", async ({ page }) => {
  for (const viewport of [
    { width: 320, height: 568 }, { width: 390, height: 844 }, { width: 667, height: 375 },
    { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1366, height: 768 },
    { width: 1440, height: 900 }, { width: 1920, height: 1080 }, { width: 2560, height: 1440 }
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/pricing");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    for (const control of await page.locator("main a.button, main button.button").all()) expect((await control.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/pricing");
  await page.addStyleTag({ content: "*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}p{margin-bottom:2em!important}" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await page.goto("/teacher/sessions");
  await expect(page.locator('[data-capability="managed_session.create"]')).toContainText("Not available yet");
  await page.goto("/teacher/reports");
  await expect(page.locator('[data-capability="report.view_placeholder"]')).toContainText("Not available yet");
  await page.goto("/pricing");
  await expect(page.getByText("Managed sessions, remote participation, real reports")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/cus_|sub_|price_|evt_|sk_test_/);
  const checkout = page.getByRole("button", { name: "Test monthly Checkout" });
  await checkout.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/sign-in/);
});
