import { execFileSync } from "node:child_process";

import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

/**
 * Navigation performance regression for the critical product journeys of an
 * ENTITLED teacher (the owner's experience): homepage → Math Games / Online
 * Math Prep / Homework PDFs / Quiz PDFs / Account / Subscription.
 *
 * The Online Math Prep destination is a locally published CMS document (created
 * through the real CMS functions) pointing at the production ShowMe origin, so
 * the launch measures the true cross-origin leg; redirected navigations cannot
 * be intercepted by Playwright, which is why no stub is used. Assertions are
 * structural (redirect-hop ceiling, no duplicate navigation requests, no
 * requests outside MathNexa and the approved destination, a generous route
 * response budget) rather than millisecond-perfect; medians are printed for the
 * before/after record.
 */

const url = process.env.SUPABASE_TEST_URL ?? "";
const secretKey = process.env.SUPABASE_TEST_SECRET_KEY ?? "";
const container = process.env.SUPABASE_TEST_DB_CONTAINER ?? "supabase_db_math-vocabulary-hunt";
const password = "Perf-Fixture-Passw0rd!";
const stamp = Date.now();
const entitledEmail = `perf-entitled-${stamp}@example.invalid`;
const adminEmail = `perf-admin-${stamp}@example.invalid`;
const destinationOrigin = "https://showme.mathnexa.com";
const destinationUrl = `${destinationOrigin}/`;
const fixtureMarker = "Performance fixture destination.";
const hopBudget = Number(process.env.MVH_NAV_HOP_BUDGET ?? 2);
const routeBudgetMs = Number(process.env.MVH_NAV_ROUTE_BUDGET_MS ?? 4000);
const runs = Number(process.env.MVH_NAV_RUNS ?? 3);
/** Baseline capture only: log structural violations instead of failing, so before/after timings can be recorded. */
const recordOnly = process.env.MVH_NAV_RECORD_ONLY === "1";

let admin: SupabaseClient;
let entitledUser: User;
let adminUser: User;
let adminId: string;
let documentId: string;

/**
 * Removes every row this fixture creates, through the local database container
 * (the CMS tables are write-protected from the API and published history is
 * immutable by trigger, so this is the only honest way to leave no trace). The
 * runner only ever points this suite at 127.0.0.1, never a hosted project.
 */
function removeFixtureRows() {
  const fixtureDocuments = `select document_id from public.cms_document_versions where document_key='map-prep' and content::text like '%${fixtureMarker}%'`;
  const fixtureUsers = `select id from auth.users where email like 'perf-%@example.invalid'`;
  // Ordered so that no foreign key or immutability trigger can refuse a step.
  const statements = [
    "alter table public.cms_document_versions disable trigger user",
    "alter table public.cms_documents disable trigger user",
    "alter table public.admin_audit_log disable trigger user",
    `delete from public.cms_media_usage where document_id in (${fixtureDocuments})`,
    `delete from public.cms_document_versions where document_id in (${fixtureDocuments})`,
    "delete from public.cms_documents where document_key='map-prep' and id not in (select document_id from public.cms_document_versions)",
    `delete from public.admin_audit_log where admin_user_id in (select id from public.admin_users where user_id in (${fixtureUsers}))`,
    `delete from public.admin_users where user_id in (${fixtureUsers})`,
    "alter table public.admin_audit_log enable trigger user",
    "alter table public.cms_documents enable trigger user",
    "alter table public.cms_document_versions enable trigger user",
    `delete from public.consumer_game_entitlements where user_id in (${fixtureUsers})`,
    `delete from public.consumer_accounts where user_id in (${fixtureUsers})`,
    "delete from auth.users where email like 'perf-%@example.invalid'"
  ];
  try {
    execFileSync("docker", ["exec", container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", statements.join("; ")], { stdio: "pipe" });
  } catch (error) {
    console.warn(`[perf] fixture cleanup through ${container} failed: ${String(error).slice(0, 300)}`);
  }
}

async function createConfirmedUser(email: string): Promise<User> {
  const result = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (result.error || !result.data.user) throw result.error ?? new Error("Synthetic account was not created.");
  return result.data.user;
}

async function signIn(page: Page) {
  await page.goto("/sign-in?next=/");
  await page.getByLabel("Email address").fill(entitledEmail);
  await page.locator("input[name=\"password\"]").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByText("Your MathNexa resource shelf is ready below.")).toBeVisible();
}

type Hop = { url: string; status: number | null; ms: number };

/** Clicks `locator`, waits for the destination to be usable, returns the navigation hops and timings. */
async function clickAndMeasure(page: Page, locator: ReturnType<Page["getByRole"]>, usable: () => Promise<void>): Promise<{ hops: Hop[]; all: string[]; clickToUsableMs: number }> {
  // A settled page: the entry animation must not be counted as navigation time.
  await page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => null))));
  const started = performance.now();
  const hops: Hop[] = [];
  const all: string[] = [];
  const onRequest = (request: import("@playwright/test").Request) => {
    all.push(request.url());
    if (request.isNavigationRequest() || /[?&]_rsc=/.test(request.url())) hops.push({ url: request.url(), status: null, ms: Math.round(performance.now() - started) });
  };
  const onResponse = (response: import("@playwright/test").Response) => {
    const hop = hops.find((entry) => entry.url === response.url() && entry.status === null);
    if (hop) hop.status = response.status();
  };
  page.on("request", onRequest);
  page.on("response", onResponse);
  await locator.click();
  await usable();
  const clickToUsableMs = Math.round(performance.now() - started);
  page.off("request", onRequest);
  page.off("response", onResponse);
  return { hops, all, clickToUsableMs };
}

const median = (values: number[]) => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)] ?? 0; };
const isFirstParty = (entry: string) => entry.startsWith("http://127.0.0.1:3000");
const isDestination = (entry: string) => entry.startsWith(destinationOrigin);

test.beforeAll(async () => {
  expect(url).toMatch(/^http:\/\/127\.0\.0\.1:/);
  admin = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
  removeFixtureRows(); // idempotent: a crashed earlier run must not block this one
  entitledUser = await createConfirmedUser(entitledEmail);
  adminUser = await createConfirmedUser(adminEmail);
  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + 24 * 60 * 60 * 1000);
  const account = await admin.from("consumer_accounts").update({ trial_redeemed_at: startsAt.toISOString() }).eq("user_id", entitledUser.id);
  if (account.error) throw account.error;
  const entitlement = await admin.from("consumer_game_entitlements").insert({
    user_id: entitledUser.id, entitlement_state: "trial-active", trial_started_at: startsAt.toISOString(), trial_ends_at: endsAt.toISOString()
  });
  if (entitlement.error) throw entitlement.error;

  // A published Online Math Prep destination created through the real CMS
  // functions (the CMS tables are write-protected from service_role by design):
  // create (draft v1) → ready_for_review → published, acting as a local owner admin.
  const adminRow = await admin.from("admin_users").insert({ user_id: adminUser.id, role: "owner", mfa_enrolled: true }).select("id").single();
  if (adminRow.error) throw adminRow.error;
  adminId = adminRow.data.id;
  const existing = await admin.from("cms_documents").select("id").eq("document_key", "map-prep").maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) throw new Error("A map-prep CMS document already exists in the local database; refusing to touch it.");
  const block = {
    type: "external-link", label: "Online Math Prep", href: destinationUrl, destinationUrl, adminDestinationUrl: null, publicDescription: fixtureMarker,
    enabled: true, openMode: "same_tab", allowedHosts: [new URL(destinationUrl).hostname], lastVerifiedAt: startsAt.toISOString(), status: "verified"
  };
  const created = await admin.rpc("create_cms_document", {
    p_actor_admin_id: adminId, p_document_key: "map-prep", p_document_kind: "configuration",
    p_content: { key: "map-prep", title: "Online Math Prep", description: "", seoTitle: "", seoDescription: "", socialTitle: "", socialDescription: "", blocks: [block] },
    p_seo_metadata: {}
  });
  if (created.error) throw created.error;
  documentId = created.data as string;
  const review = await admin.rpc("transition_cms_document", { p_actor_admin_id: adminId, p_document_id: documentId, p_version_number: 1, p_expected_lock_version: 1, p_target_state: "ready_for_review" });
  if (review.error) throw review.error;
  const published = await admin.rpc("transition_cms_document", { p_actor_admin_id: adminId, p_document_id: documentId, p_version_number: 1, p_expected_lock_version: Number(review.data), p_target_state: "published" });
  if (published.error) throw published.error;
});

test.afterAll(async () => {
  removeFixtureRows();
});

test("entitled Online Math Prep launch: redirect ceiling, no duplicate or foreign requests, response budget", async ({ page }) => {
  await signIn(page);
  const timings: number[] = [];
  let lastHops: Hop[] = [];
  for (let run = 0; run < runs; run++) {
    await page.goto("/");
    await expect(page.getByText("Your MathNexa resource shelf is ready below.")).toBeVisible();
    const card = page.getByRole("link", { name: /Online Math Prep [(]Grades 3–8[)]/ });
    const result = await clickAndMeasure(page, card, async () => {
      await page.waitForURL((current) => current.origin === destinationOrigin, { timeout: 45_000 });
      await expect(page.locator("h1").first()).toBeVisible({ timeout: 45_000 });
    });
    timings.push(result.clickToUsableMs);
    lastHops = result.hops;
    // Every request during the launch is MathNexa's own or the approved destination's.
    const foreign = result.all.filter((entry) => !isFirstParty(entry) && !isDestination(entry));
    expect(foreign, "requests outside MathNexa and the approved destination").toEqual([]);
    // No MathNexa navigation request is issued twice.
    const navigationUrls = result.hops.filter((hop) => isFirstParty(hop.url)).map((hop) => hop.url.replace(/[?&]_rsc=[^&]+/, ""));
    if (new Set(navigationUrls).size !== navigationUrls.length) console.log(`[perf] duplicate navigation requests: ${navigationUrls.join(" | ")}`);
    if (!recordOnly) expect(new Set(navigationUrls).size, `duplicate navigation requests: ${navigationUrls.join(" | ")}`).toBe(navigationUrls.length);
  }
  const serverHops = lastHops.filter((hop) => isFirstParty(hop.url));
  console.log(`[perf] Online Math Prep: click→usable median ${median(timings)} ms (${timings.join(", ")}); MathNexa hops before the destination = ${serverHops.length}: ${serverHops.map((hop) => `${hop.status} ${new URL(hop.url).pathname} @${hop.ms}ms`).join(" -> ")}`);
  // Hop ceiling: the MathNexa side must answer with at most `hopBudget` server round trips before the destination loads.
  if (!recordOnly) {
    expect(serverHops.length, "MathNexa server hops before the destination").toBeLessThanOrEqual(hopBudget);
    expect(median(timings), "click→usable median (local dev budget)").toBeLessThanOrEqual(routeBudgetMs);
  }
});

test("entitled product and account navigations: single first-party hop, no foreign requests, response budget", async ({ page }) => {
  await signIn(page);
  const destinations: Array<[string, () => ReturnType<Page["getByRole"]>, string]> = [
    ["Math Games", () => page.getByRole("link", { name: /Math Games Engage/ }), "Pick a challenge."],
    ["Homework PDFs", () => page.getByRole("link", { name: /Homework PDFs Practice/ }), "Homework PDFs"],
    ["Quiz PDFs", () => page.getByRole("link", { name: /Quiz PDFs Assess/ }), "Quiz PDFs"],
    ["Account", () => page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "My Account", exact: true }), ""],
    ["Subscription", () => page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Subscription", exact: true }), ""]
  ];
  for (const [name, locator, heading] of destinations) {
    const timings: number[] = [];
    let lastHops: Hop[] = [];
    for (let run = 0; run < runs; run++) {
      await page.goto("/");
      await expect(page.getByText("Your MathNexa resource shelf is ready below.")).toBeVisible();
      const result = await clickAndMeasure(page, locator(), async () => {
        if (heading) await expect(page.getByRole("heading", { name: heading })).toBeVisible();
        else await expect(page.locator("h1").first()).toBeVisible();
      });
      timings.push(result.clickToUsableMs);
      lastHops = result.hops;
      const foreign = result.all.filter((entry) => !isFirstParty(entry));
      expect(foreign, `${name}: requests outside MathNexa`).toEqual([]);
    }
    const redirects = lastHops.filter((hop) => hop.status !== null && hop.status >= 300 && hop.status < 400);
    console.log(`[perf] ${name}: click→usable median ${median(timings)} ms (${timings.join(", ")}); redirects ${redirects.length}; hops ${lastHops.map((hop) => `${hop.status} ${new URL(hop.url).pathname}`).join(" -> ")}`);
    if (!recordOnly) {
      expect(redirects.length, `${name}: unexpected redirect for an entitled user`).toBe(0);
      expect(median(timings), `${name}: click→usable median (local dev budget)`).toBeLessThanOrEqual(routeBudgetMs);
    }
  }
});
