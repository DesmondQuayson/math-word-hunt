import { expect, test } from "@playwright/test";

test.skip(
  process.env.MVH_TEACHER_PROTOTYPE_TEST !== "enabled",
  "Runs only through the explicit server-side prototype test command."
);

test("explicit development prototype mode labels every demonstration record", async ({ page }) => {
  const routes = [
    ["/teacher", "overview-summary"],
    ["/teacher/classes", "class-list"],
    ["/teacher/classes/algebra-foundations", "class-detail"],
    ["/teacher/activities", "activity-list"],
    ["/teacher/sessions", "session-list"],
    ["/teacher/reports", "report-summary"],
    ["/account", "account-structure"]
  ] as const;

  for (const [route, fixture] of routes) {
    await page.goto(route);
    await expect(page.getByText("Demonstration data", { exact: true })).toBeVisible();
    await expect(page.locator(`[data-prototype-fixture="${fixture}"]`)).toBeVisible();
    await expect(page.locator("[data-persisted-record]")).toHaveCount(0);
  }
});

test("demonstration records support the planned browse path without fake persistence", async ({ page }) => {
  await page.goto("/teacher/classes");
  await expect(page.getByText("Algebra foundations")).toBeVisible();
  await page.getByRole("link", { name: "View demonstration structure" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Algebra foundations" })).toBeVisible();

  await page.goto("/teacher/reports");
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByText(/Experimental Probability/)).toBeVisible();
  await expect(page.getByText(/student-level analytics/i)).toBeVisible();
});

test("unknown class IDs remain empty even while fixture mode is enabled", async ({ page }) => {
  await page.goto("/teacher/classes/browser-controlled-id");
  await expect(page.getByRole("heading", { level: 1, name: "No class record is available" })).toBeVisible();
  await expect(page.locator("[data-prototype-fixture]")).toHaveCount(0);
});
