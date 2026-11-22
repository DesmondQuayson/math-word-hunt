import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const authorizedCode = process.env.SCHOOL_ACCESS_TEST_CODE ?? "";
const axeSource = readFileSync(resolve("node_modules/axe-core/axe.min.js"), "utf8");

async function enterAuthorizedAccess(page: Page, destination = "/games", code = authorizedCode) {
  await page.goto(`/access?next=${encodeURIComponent(destination)}`);
  await page.getByLabel("Code (required)").fill(code);
  await page.getByRole("button", { name: "Continue" }).click();
}

test.beforeAll(() => {
  expect(authorizedCode.length).toBeGreaterThanOrEqual(4);
});

test("the existing access screen keeps public account choices and shows the masked code field inline", async ({ page }) => {
  await page.goto("/access?next=/map-prep");
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in?next=/map-prep");
  await expect(page.getByRole("link", { name: "Create account" })).toHaveAttribute("href", "/sign-up?next=/map-prep&entry=account");
  await expect(page.getByRole("heading", { name: "Authorize Code" })).toBeVisible();
  const input = page.getByLabel("Code (required)");
  await expect(input).toHaveAttribute("type", "password");
  await expect(input).toBeInViewport();
  await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(authorizedCode);
  await expect(page.locator("body")).not.toContainText("Use the code provided by your school. No personal account is created.");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await page.addScriptTag({ content: axeSource });
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: () => Promise<{ violations: Array<{ impact: string | null; id: string }> }> } }).axe;
    return (await axe.run()).violations.filter((item) => item.impact === "critical" || item.impact === "serious");
  });
  expect(violations).toEqual([]);
});

test("sign-in and create-account screens keep the code field immediately visible", async ({ page }) => {
  for (const route of ["/sign-in?next=/map-prep", "/sign-up?next=/map-prep"]) {
    await page.goto(route);
    await expect(page.getByRole("heading", { name: "Authorize Code" })).toBeVisible();
    await expect(page.getByLabel("Code (required)")).toHaveAttribute("type", "password");
    await expect(page.locator('input[name="next"]').last()).toHaveValue("/map-prep");
  }
});

test("invalid input is denied generically and the field remains keyboard reachable", async ({ page }) => {
  await page.goto("/access?next=/games");
  await page.keyboard.press("Tab");
  for (let index = 0; index < 20; index += 1) {
    if (await page.getByLabel("Code (required)").evaluate((element) => element === document.activeElement)) break;
    await page.keyboard.press("Tab");
  }
  await expect(page.getByLabel("Code (required)")).toBeFocused();
  await page.getByLabel("Code (required)").fill("not-the-code");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/access\?next=\/games$/);
  const error = page.locator(".authorized-access-form .error-summary");
  await expect(error).toContainText("Invalid authorized code.");
  await expect(error).not.toContainText(/case|school|partial/i);
});

test("case-insensitive trimmed input creates one persistent all-access session", async ({ page, context }) => {
  await enterAuthorizedAccess(page, "/games", `  ${authorizedCode.toLowerCase()}  `);
  await expect(page).toHaveURL(/\/games$/);
  const cookie = (await context.cookies()).find((item) => item.name === "mathnexa-school-access");
  expect(cookie).toBeTruthy();
  expect(cookie?.httpOnly).toBe(true);
  // Playwright WebKit reports an explicitly set Lax cookie as None in local HTTP mode.
  // The exact production cookie contract is asserted in session.test.ts.
  expect(["Lax", "None"]).toContain(cookie?.sameSite);
  expect(cookie?.value).not.toContain(authorizedCode);

  for (const route of [
    "/games",
    "/play",
    "/homework",
    "/quizzes"
  ]) {
    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    expect(response?.status(), route).toBeLessThan(400);
    await expect(page).not.toHaveURL(/\/access(?:\?|$)/);
  }

  const mapPrep = await page.request.get("/map-prep", { maxRedirects: 0 });
  expect([200, 303, 307, 308]).toContain(mapPrep.status());
  expect(mapPrep.headers().location ?? "").not.toContain("/access");
});

test("unsafe next is rejected and account UI contains no fake identity or billing", async ({ page }) => {
  await enterAuthorizedAccess(page, "https://attacker.example");
  // An unowned next is never followed: the action falls back to the post-authentication
  // destination, Home on this origin (b13ce5e moved that fallback from /account to /).
  await expect(page).toHaveURL("/");
  // The school-session account view renders only for a valid session (otherwise /account
  // redirects to /access?next=/account), so reaching it proves the session was created.
  await page.goto("/account");
  await expect(page).toHaveURL("/account");
  await expect(page.getByText("Access provided through an authorized school code.")).toBeVisible();
  await expect(page.locator("#main-content").getByRole("button", { name: "Exit authorized access" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Authorized access active" })).toBeVisible();
  await expect(page.getByLabel("Code (required)")).toHaveCount(0);
  await expect(page.getByTestId("consumer-account-summary")).toHaveCount(0);
  await expect(page.locator('input[type="email"], a[href="/subscriber-management"]')).toHaveCount(0);
});

test("the authorize action itself refuses an unowned next, even when the form is tampered with", async ({ page }) => {
  await page.goto("/access?next=/games");
  const form = page.locator("form", { has: page.getByLabel("Code (required)") });
  await form.getByLabel("Code (required)").fill(authorizedCode);
  // The page already sanitises ?next; rewrite the submitted value so only the server action can refuse it.
  await form.locator('input[type="hidden"][name="next"]').evaluate((input) => { (input as HTMLInputElement).value = "https://attacker.example/collect"; });
  await form.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL("/");
});

test("school access never exposes Checkout and exits without a separate code-entry route", async ({ page, context }) => {
  await enterAuthorizedAccess(page, "/subscription");
  await expect(page).toHaveURL(/\/subscription$/);
  // Next's route announcer (role=alert) repeats the h1 after the action's navigation; match the heading itself.
  await expect(page.getByRole("heading", { level: 1, name: "No subscription is required for this session", exact: true })).toBeVisible();
  await expect(page.locator("form.consent-form")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(/Stripe-hosted Checkout|Manage or cancel in Stripe/);
  await page.goto("/account");
  await page.getByRole("button", { name: "Exit authorized access" }).last().click();
  await expect(page).toHaveURL(/\/$/);
  expect((await context.cookies()).some((item) => item.name === "mathnexa-school-access")).toBe(false);
  for (const path of ["/school-access", "/access/code"]) {
    expect((await page.request.get(path, { maxRedirects: 0 })).status()).toBe(404);
  }
});

test("ShowMe Math opens only with a pass: none without access, one for a code holder, gone when access ends", async ({ page, context }) => {
  const secret = process.env.MVH_SHOWME_ACCESS_SECRET ?? "";
  expect(secret.length).toBeGreaterThanOrEqual(32);
  const cookie = async (name: string) => (await context.cookies()).find((item) => item.name === name);
  const setCookies = (response: { headersArray(): Array<{ name: string; value: string }> }) =>
    response.headersArray().filter((header) => header.name.toLowerCase() === "set-cookie").flatMap((header) => header.value.split("\n"));

  // Sent here by ShowMe with no access: the ordinary access page, no pass, and the page asked for is remembered.
  const refused = await page.request.get(`/map-prep/pass?to=${encodeURIComponent("/assignment?a=AbC-123")}`, { maxRedirects: 0 });
  expect(refused.status()).toBe(307);
  expect(new URL(refused.headers()["location"]!, "http://127.0.0.1:3181").pathname).toBe("/access");
  expect(new URL(refused.headers()["location"]!, "http://127.0.0.1:3181").searchParams.get("next")).toBe("/map-prep");
  expect(await cookie("mathnexa-showme-pass")).toBeUndefined();
  expect(await cookie("mathnexa-showme-return")).toMatchObject({ httpOnly: true, path: "/map-prep" });

  // The visitor enters the access code. Coming back by way of the ShowMe home page, they get the pass
  // and are sent to the page they first asked for, on ShowMe and nowhere else.
  await enterAuthorizedAccess(page, "/games");
  await expect(page).toHaveURL(/\/games$/);
  const granted = await page.request.get("/map-prep/pass?to=/", { maxRedirects: 0 });
  expect(granted.status()).toBe(307);
  expect(granted.headers()["location"]).toBe("https://showme.mathnexa.com/assignment?a=AbC-123");
  expect(granted.headers()["cache-control"]).toBe("no-store");
  expect(setCookies(granted).find((value) => value.startsWith("mathnexa-showme-pass="))).toMatch(/^mathnexa-showme-pass=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+; Path=\/; Expires=[^;]+; Max-Age=43200; HttpOnly; SameSite=lax$/i);
  expect(await cookie("mathnexa-showme-return")).toBeUndefined();
  const pass = (await cookie("mathnexa-showme-pass"))!;
  expect(pass.httpOnly).toBe(true);
  const [body, signature] = pass.value.split(".") as [string, string];
  expect(createHmac("sha256", secret).update(body).digest("base64url")).toBe(signature);
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  expect(Object.keys(payload).sort()).toEqual(["exp", "iat", "v"]);
  expect(payload.exp - payload.iat).toBe(12 * 60 * 60);
  await page.goto("/account");
  expect(await page.evaluate(() => document.cookie)).not.toContain("mathnexa-showme-pass");

  // A hostile return address still lands on ShowMe.
  for (const to of ["//evil.example", "https://evil.example/", "/\\evil.example"]) {
    const answer = await page.request.get(`/map-prep/pass?to=${encodeURIComponent(to)}`, { maxRedirects: 0 });
    expect(new URL(answer.headers()["location"]!).origin, to).toBe("https://showme.mathnexa.com");
  }

  // Ending authorized access takes the pass away, and the route refuses again.
  await page.getByRole("button", { name: "Exit authorized access" }).last().click();
  await expect(page).toHaveURL(/\/$/);
  expect(await cookie("mathnexa-showme-pass")).toBeUndefined();
  const after = await page.request.get("/map-prep/pass?to=/grades", { maxRedirects: 0 });
  expect(new URL(after.headers()["location"]!, "http://127.0.0.1:3181").pathname).toBe("/access");
  expect(await cookie("mathnexa-showme-pass")).toBeUndefined();
});
