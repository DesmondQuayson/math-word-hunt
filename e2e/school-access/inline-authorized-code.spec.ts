import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const authorizedCode = process.env.SCHOOL_ACCESS_TEST_CODE ?? "";
const axeSource = readFileSync(resolve("node_modules/axe-core/axe.min.js"), "utf8");

async function enterAuthorizedAccess(page: Page, destination = "/games", code = authorizedCode) {
  await page.goto(`/access?next=${encodeURIComponent(destination)}`);
  await page.getByLabel("Authorized code (required)").fill(code);
  await page.getByRole("button", { name: "Continue" }).click();
}

test.beforeAll(() => {
  expect(authorizedCode.length).toBeGreaterThanOrEqual(4);
});

test("the existing access screen keeps public account choices and shows the masked code field inline", async ({ page }) => {
  await page.goto("/access?next=/map-prep");
  await expect(page.getByRole("link", { name: "Create an account" })).toHaveAttribute("href", "/sign-up?next=/map-prep");
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in?next=/map-prep");
  await expect(page.getByRole("heading", { name: "Enter authorized code to access MathNexa" })).toBeVisible();
  await expect(page.getByLabel("Authorized code (required)")).toHaveAttribute("type", "password");
  await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(authorizedCode);
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
    await expect(page.getByRole("heading", { name: "Enter authorized code to access MathNexa" })).toBeVisible();
    await expect(page.getByLabel("Authorized code (required)")).toHaveAttribute("type", "password");
    await expect(page.locator('input[name="next"]').last()).toHaveValue("/map-prep");
  }
});

test("invalid input is denied generically and the field remains keyboard reachable", async ({ page }) => {
  await page.goto("/access?next=/games");
  await page.keyboard.press("Tab");
  for (let index = 0; index < 20; index += 1) {
    if (await page.getByLabel("Authorized code (required)").evaluate((element) => element === document.activeElement)) break;
    await page.keyboard.press("Tab");
  }
  await expect(page.getByLabel("Authorized code (required)")).toBeFocused();
  await page.getByLabel("Authorized code (required)").fill("not-the-code");
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
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByText("Access provided through an authorized school code.")).toBeVisible();
  await expect(page.locator("#main-content").getByRole("button", { name: "Exit authorized access" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Enter authorized code to access MathNexa" })).toBeVisible();
  await expect(page.getByLabel("Authorized code (required)")).toBeVisible();
  await expect(page.getByTestId("consumer-account-summary")).toHaveCount(0);
  await expect(page.locator('input[type="email"], a[href="/subscriber-management"]')).toHaveCount(0);
});

test("school access never exposes Checkout and exits without a separate code-entry route", async ({ page, context }) => {
  await enterAuthorizedAccess(page, "/subscription");
  await expect(page).toHaveURL(/\/subscription$/);
  await expect(page.getByText("No subscription is required for this session")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/Stripe-hosted Checkout|Manage or cancel in Stripe/);
  await page.goto("/account");
  await page.getByRole("button", { name: "Exit authorized access" }).last().click();
  await expect(page).toHaveURL(/\/$/);
  expect((await context.cookies()).some((item) => item.name === "mathnexa-school-access")).toBe(false);
  for (const path of ["/school-access", "/access/code"]) {
    expect((await page.request.get(path, { maxRedirects: 0 })).status()).toBe(404);
  }
});
