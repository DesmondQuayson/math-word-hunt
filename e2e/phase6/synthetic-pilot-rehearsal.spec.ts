import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

const url = process.env.SUPABASE_TEST_URL ?? "";
const publicKey = process.env.SUPABASE_TEST_PUBLISHABLE_KEY ?? "";
const secretKey = process.env.SUPABASE_TEST_SECRET_KEY ?? "";
const password = "SyntheticAdult42!";
const run = `phase6-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
const emailA = `${run}-teacher-a@example.test`;
const emailB = `${run}-teacher-b@example.test`;

let admin: SupabaseClient;
let teacherA: User | undefined;
let teacherB: User | undefined;
let classAId = "";
let classBId = "";
let cleaned = false;

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/teacher$/);
}

async function cleanup() {
  if (!admin || cleaned) return;
  for (const user of [teacherA, teacherB]) if (user) {
    const result = await admin.auth.admin.deleteUser(user.id);
    if (result.error) throw result.error;
  }
  const ids = [teacherA?.id, teacherB?.id].filter((value): value is string => Boolean(value));
  const counts = {
    profiles: (await admin.from("teacher_profiles").select("user_id", { count: "exact", head: true }).in("user_id", ids)).count ?? -1,
    classes: (await admin.from("teacher_classes").select("id", { count: "exact", head: true }).in("owner_teacher_id", ids)).count ?? -1,
    activities: (await admin.from("teacher_activities").select("id", { count: "exact", head: true }).in("owner_teacher_id", ids)).count ?? -1,
    entitlements: (await admin.from("product_entitlements").select("id", { count: "exact", head: true }).in("teacher_user_id", ids)).count ?? -1,
    deletionRequests: (await admin.from("account_deletion_requests").select("id", { count: "exact", head: true }).in("owner_teacher_id", ids)).count ?? -1,
    billingRecords: (await admin.from("billing_customers").select("id", { count: "exact", head: true }).in("owner_teacher_id", ids)).count ?? -1
  };
  const auth = await admin.auth.admin.listUsers();
  const authUsers = auth.data.users.filter((user) => user.email === emailA || user.email === emailB).length;
  expect({ authUsers, ...counts }).toEqual({ authUsers: 0, profiles: 0, classes: 0, activities: 0, entitlements: 0, deletionRequests: 0, billingRecords: 0 });
  cleaned = true;
}

test.beforeAll(async () => {
  expect(url).toMatch(/^http:\/\/127\.0\.0\.1:/);
  admin = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const [a, b] = await Promise.all([
    admin.auth.admin.createUser({ email: emailA, password, email_confirm: true, user_metadata: { display_name: "Synthetic Adult Teacher A" } }),
    admin.auth.admin.createUser({ email: emailB, password, email_confirm: true, user_metadata: { display_name: "Synthetic Adult Teacher B" } })
  ]);
  if (a.error || !a.data.user || b.error || !b.data.user) throw a.error ?? b.error ?? new Error("Synthetic adult-teacher identities were not created.");
  teacherA = a.data.user;
  teacherB = b.data.user;
  classBId = crypto.randomUUID();
  const inserted = await admin.from("teacher_classes").insert({ id: classBId, owner_teacher_id: teacherB.id, class_name: "Synthetic planning B", grade_level: "7" });
  if (inserted.error) throw inserted.error;
});

test.afterAll(async () => { await cleanup(); });

test("complete local synthetic adult-teacher pilot rehearsal", async ({ page }) => {
  const unexpectedExternalRequests: string[] = [];
  page.on("request", (request) => {
    const target = new URL(request.url());
    if (target.hostname !== "127.0.0.1") unexpectedExternalRequests.push(request.url());
  });

  await page.goto("/pilot?pilot=active#active");
  const banner = page.getByLabel("Restricted pilot status");
  await expect(banner).toHaveAttribute("data-pilot-readiness", "not-ready");
  await expect(banner).toHaveAttribute("data-pilot-activation", "inactive");
  await expect(page.getByText("Adult teachers only", { exact: true })).toBeVisible();
  await expect(page.getByText("No student data", { exact: true })).toBeVisible();
  const acknowledgment = page.getByLabel("I understand the pilot boundaries.");
  await acknowledgment.focus(); await page.keyboard.press("Space"); await page.keyboard.press("Tab"); await page.keyboard.press("Enter");
  await expect(page.getByRole("status", { name: "Preview environment status" })).toBeVisible();
  await expect(page.getByText(/Nothing was saved/)).toBeVisible();

  await signIn(page, emailA);
  await expect(page.getByTestId("real-teacher-summary")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("real-teacher-summary")).toBeVisible();
  await page.goto(`/teacher/classes/${classBId}`);
  await expect(page.getByRole("heading", { name: "Class unavailable" })).toBeVisible();
  await expect(page.getByText("Synthetic planning B")).toHaveCount(0);

  await page.goto("/teacher/classes/new");
  await page.getByLabel("Class name").fill("Synthetic planning A");
  await page.getByLabel("Grade level").selectOption("6");
  await page.getByLabel("Period or section").fill("Block A");
  await page.getByRole("button", { name: "Save class" }).click();
  await expect(page.getByText("Class saved to the local teacher account.")).toBeVisible();
  const classA = await admin.from("teacher_classes").select("id").eq("owner_teacher_id", teacherA!.id).eq("class_name", "Synthetic planning A").single();
  if (classA.error || !classA.data) throw classA.error ?? new Error("Synthetic class A was not created.");
  classAId = classA.data.id;

  await page.goto("/teacher/activities/new");
  await page.getByLabel("Class").selectOption({ label: "Synthetic planning A" });
  await page.locator("#activity-grade").selectOption("6");
  await page.locator("#activity-topic").selectOption("g6-expressions");
  await page.locator("#activity-lesson").selectOption("g6-3-6");
  await page.locator("#activity-time").selectOption("10");
  await page.locator("#activity-teams").selectOption("2");
  await page.getByRole("button", { name: "Save activity draft" }).click();
  await expect(page.getByText("Activity draft saved to the local teacher account.")).toBeVisible();

  const clientA = createClient(url, publicKey, { auth: { persistSession: false } });
  const clientB = createClient(url, publicKey, { auth: { persistSession: false } });
  expect((await clientA.auth.signInWithPassword({ email: emailA, password })).error).toBeNull();
  expect((await clientB.auth.signInWithPassword({ email: emailB, password })).error).toBeNull();
  expect((await clientA.from("teacher_classes").select("id").eq("id", classBId)).data).toEqual([]);
  expect((await clientB.from("teacher_classes").select("id").eq("id", classAId)).data).toEqual([]);
  expect((await clientA.from("teacher_classes").update({ class_name: "Forged A" }).eq("id", classBId).select("id")).data).toEqual([]);
  expect((await clientB.from("teacher_classes").update({ class_name: "Forged B" }).eq("id", classAId).select("id")).data).toEqual([]);

  await page.goto("/play");
  const gameUrl = await page.getByTestId("legacy-game-launch").getAttribute("href");
  expect(gameUrl).toBe("http://127.0.0.1:4173/docs/index.html");
  await page.goto(gameUrl!);
  await page.locator('.grade-card[data-grade="6"]').click();
  const topic = page.locator(".topic-card:not(.incomplete)").first();
  await topic.locator("summary").click(); await topic.locator(".choose-topic-button").click(); await page.locator(".lesson-row").first().click();
  const placements = await page.evaluate(() => window.__MATH_WORD_HUNT__.getState().placements);
  expect(placements.length).toBeGreaterThan(1);
  const selector = (cell: { row: number; col: number }) => `.grid-cell[data-row="${cell.row}"][data-col="${cell.col}"]`;
  await page.locator(`.word-card[data-term-key="${placements[0].key}"]`).click();
  const startBox = await page.locator(selector(placements[0].cells[0])).boundingBox();
  const endBox = await page.locator(selector(placements[0].cells.at(-1)!)).boundingBox();
  expect(startBox).not.toBeNull(); expect(endBox).not.toBeNull();
  await page.mouse.move(startBox!.x + startBox!.width / 2, startBox!.y + startBox!.height / 2); await page.mouse.down();
  await page.mouse.move(endBox!.x + endBox!.width / 2, endBox!.y + endBox!.height / 2, { steps: Math.max(4, placements[0].key.length) }); await page.mouse.up();
  await expect(page.locator("#findLayer")).toBeVisible(); await page.locator("#gotItButton").click();
  await page.locator(`.word-card[data-term-key="${placements[1].key}"]`).focus(); await page.keyboard.press("Enter");
  await page.locator(selector(placements[1].cells[0])).focus(); await page.keyboard.press("Enter");
  await page.locator(selector(placements[1].cells.at(-1)!)).focus(); await page.keyboard.press("Enter");
  await expect(page.locator("#findLayer")).toBeVisible();

  await page.goto("http://127.0.0.1:3000/pilot/feedback");
  await page.getByLabel(/Workflow being tested/).fill("Canonical game launch");
  await page.getByLabel(/Reproducible steps/).fill("Open the gateway, choose a lesson, and trace a word.");
  await page.getByLabel(/Expected behavior/).fill("Keyboard and pointer input both find a word.");
  await page.getByLabel(/Observed behavior/).fill("Both supported input paths completed.");
  await page.getByRole("button", { name: "Prepare feedback summary" }).click();
  await expect(page.getByRole("heading", { name: "Prepared summary" })).toBeVisible();
  await page.goto("/pilot/support"); await expect(page.getByText(/Contact the pilot coordinator using the channel/)).toBeVisible();
  await page.goto("/pilot/exit"); await expect(page.getByText(/Permanent deletion is not automatic/)).toBeVisible();

  await page.goto("/account");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in\?signedOut=1$/);
  await expect(page.getByText("You are signed out.")).toBeVisible();
  await page.goto("/teacher/classes/new"); await expect(page.getByRole("button", { name: "Save class" })).toHaveCount(0);
  const restricted = await admin.from("teacher_profiles").update({ account_status: "suspended" }).eq("user_id", teacherB!.id);
  expect(restricted.error).toBeNull();
  await signIn(page, emailB);
  await expect(page.getByText("This account is suspended")).toBeVisible();
  await page.goto("/teacher/classes/new"); await expect(page.getByRole("button", { name: "Save class" })).toHaveCount(0);

  expect(unexpectedExternalRequests).toEqual([]);
  await cleanup();
});
