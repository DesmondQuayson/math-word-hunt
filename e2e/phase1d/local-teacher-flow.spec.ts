import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

const url = process.env.SUPABASE_TEST_URL ?? "";
const publicKey = process.env.SUPABASE_TEST_PUBLISHABLE_KEY ?? "";
const secretKey = process.env.SUPABASE_TEST_SECRET_KEY ?? "";
const password = "LocalTest42!";
const run = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const emailA = `teacher-a-${run}@example.test`;
const emailB = `teacher-b-${run}@example.test`;
let admin: SupabaseClient;
let teacherA: User;
let teacherB: User;
let foreignClassId: string;
let signupUserId: string | undefined;

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/teacher$/);
  await expect(page.getByTestId("real-teacher-summary")).toBeVisible();
}

test.beforeAll(async () => {
  expect(url).toMatch(/^http:\/\/127\.0\.0\.1:/);
  expect(publicKey.length).toBeGreaterThan(20);
  expect(secretKey.length).toBeGreaterThan(20);
  admin = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const a = await admin.auth.admin.createUser({ email: emailA, password, email_confirm: true, user_metadata: { display_name: "Teacher Alpha", account_status: "suspended", role: "administrator", premium: true } });
  const b = await admin.auth.admin.createUser({ email: emailB, password, email_confirm: true, user_metadata: { display_name: "Teacher Beta" } });
  if (a.error || !a.data.user || b.error || !b.data.user) throw a.error ?? b.error ?? new Error("Local test users were not created.");
  teacherA = a.data.user;
  teacherB = b.data.user;
  foreignClassId = crypto.randomUUID();
  const inserted = await admin.from("teacher_classes").insert({ id: foreignClassId, owner_teacher_id: teacherB.id, class_name: "Teacher Beta private class", grade_level: "7" });
  if (inserted.error) throw inserted.error;
});

test.afterAll(async () => {
  if (admin && teacherA) await admin.auth.admin.deleteUser(teacherA.id);
  if (admin && teacherB) await admin.auth.admin.deleteUser(teacherB.id);
  if (admin && signupUserId) await admin.auth.admin.deleteUser(signupUserId);
});

test("signed-out routes fail closed and callback redirects remain internal", async ({ page }) => {
  await page.context().addCookies([{ name: "sb-malformed-auth-token", value: "not-a-session", url: "http://127.0.0.1:3000" }]);
  await page.goto("/teacher");
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect(page.getByTestId("real-teacher-summary")).toHaveCount(0);
  await page.goto("/auth/callback?next=https://attacker.example/steal");
  await expect(page).toHaveURL(/\/sign-in\?error=callback$/);
});

test("signup validation and recovery use non-enumerating local flows", async ({ page }) => {
  await page.goto("/sign-up");
  await page.getByRole("button", { name: "Create teacher account" }).click();
  await expect(page.locator(".error-summary[role='alert']")).toBeFocused();
  const signupEmail = `signup-${run}@example.test`;
  await page.getByLabel("Email address").fill(signupEmail);
  await page.getByLabel("Display name").fill("Signup Teacher");
  await page.locator("#signup-password").fill(password);
  await page.locator("#signup-password-confirmation").fill(password);
  await page.getByRole("button", { name: "Create teacher account" }).click();
  await expect(page.getByText(/Check the local email inbox/)).toBeVisible();
  const users = await admin.auth.admin.listUsers();
  signupUserId = users.data.users.find((user) => user.email === signupEmail)?.id;
  expect(signupUserId).toBeTruthy();
  await page.goto("/forgot-password");
  await page.getByLabel("Email address").fill(`unknown-${run}@example.test`);
  await page.getByRole("button", { name: "Send recovery message" }).click();
  await expect(page.getByText(/If that teacher account exists/)).toBeVisible();
});

test("metadata cannot elevate a teacher and cross-account detail remains hidden", async ({ page }) => {
  const profile = await admin.from("teacher_profiles").select("account_status").eq("user_id", teacherA.id).single();
  expect(profile.data?.account_status).toBe("active");
  const entitlements = await admin.from("product_entitlements").select("id").eq("teacher_user_id", teacherA.id);
  expect(entitlements.data).toEqual([]);
  await signIn(page, emailA);
  await page.goto(`/teacher/classes/${foreignClassId}`);
  await expect(page.getByRole("heading", { name: "Class unavailable" })).toBeVisible();
  await expect(page.getByText("Teacher Beta private class")).toHaveCount(0);
});

test("teacher persists a class and activity draft, archives, updates profile, and signs out", async ({ page }) => {
  await signIn(page, emailA);
  await expect(page.getByTestId("premium-access-state")).toHaveAttribute("data-access", "denied");
  await page.goto("/teacher/classes/new");
  await page.getByLabel("Class name").fill("Period 2 Math");
  await page.getByLabel("Grade level").selectOption("6");
  await page.getByLabel("Period or section").fill("Period 2");
  await page.locator("form.prototype-form").evaluate((form, foreignOwner) => {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "ownerTeacherId";
    input.value = String(foreignOwner);
    form.append(input);
  }, teacherB.id);
  await page.getByRole("button", { name: "Save class" }).click();
  await expect(page.getByText("Class saved to the local teacher account.")).toBeVisible();
  await page.goto("/teacher/classes");
  await expect(page.getByText("Period 2 Math")).toBeVisible();
  const ownedClass = await admin.from("teacher_classes").select("owner_teacher_id").eq("class_name", "Period 2 Math").single();
  expect(ownedClass.data?.owner_teacher_id).toBe(teacherA.id);

  await page.goto("/teacher/activities/new");
  await page.getByLabel("Class").selectOption({ label: "Period 2 Math" });
  await page.locator("#activity-grade").selectOption("6");
  await page.locator("#activity-topic").selectOption("g6-expressions");
  await page.locator("#activity-lesson").selectOption("g6-3-6");
  await page.locator("#activity-time").selectOption("10");
  await page.locator("#activity-teams").selectOption("2");
  await page.getByRole("button", { name: "Save activity draft" }).click();
  await expect(page.getByText("Activity draft saved to the local teacher account.")).toBeVisible();
  await page.goto("/teacher/activities");
  await expect(page.getByText("g6-3-6")).toBeVisible();

  await page.goto("/account");
  await page.getByLabel("Display name").fill("Teacher Alpha Updated");
  await page.getByRole("button", { name: "Update profile" }).click();
  await expect(page.getByText("Profile updated.")).toBeVisible();
  await page.goto("/teacher/classes");
  await page.getByRole("button", { name: "Archive class" }).click();
  await expect(page.getByText("archived")).toBeVisible();

  await page.goto("/account");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in\?signedOut=1$/);
  await page.goto("/teacher/classes");
  await expect(page.getByText("Period 2 Math")).toHaveCount(0);
});

test("suspended teacher UI and writes fail closed", async ({ page }) => {
  const changed = await admin.from("teacher_profiles").update({ account_status: "suspended" }).eq("user_id", teacherB.id);
  expect(changed.error).toBeNull();
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(emailB);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("This account is suspended")).toBeVisible();
  await expect(page.getByTestId("real-teacher-summary")).toHaveCount(0);
  await page.goto("/teacher/classes/new");
  await expect(page.getByRole("button", { name: "Save class" })).toHaveCount(0);
});

test("deletion request is request-only and restricts subsequent writes", async ({ page }) => {
  await signIn(page, emailA);
  await page.goto("/account");
  await page.getByRole("button", { name: "Request account deletion" }).click();
  await expect(page.getByText("Request pending")).toBeVisible();
  const profile = await admin.from("teacher_profiles").select("account_status").eq("user_id", teacherA.id).single();
  expect(profile.data?.account_status).toBe("deletion_requested");
  const request = await admin.from("account_deletion_requests").select("status, resolved_at").eq("owner_teacher_id", teacherA.id).single();
  expect(request.data).toMatchObject({ status: "requested", resolved_at: null });
  await page.goto("/teacher/classes/new");
  await expect(page.getByRole("button", { name: "Save class" })).toHaveCount(0);
});
