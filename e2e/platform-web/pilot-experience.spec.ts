import { expect, test } from "@playwright/test";

const pilotRoutes = [
  ["/pilot", "Evaluate the teacher experience without bringing student data."],
  ["/pilot/privacy", "Bring teacher planning—not student records."],
  ["/pilot/support", "Report the workflow, not the person."],
  ["/pilot/feedback", "Prepare feedback without sending or saving it."],
  ["/pilot/exit", "Stop participation without ambiguity."]
] as const;

test("restricted pilot disclosure is persistent and activation remains denied", async ({ page }) => {
  for (const [route, heading] of pilotRoutes) {
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    await expect(page.locator("h1")).toHaveCount(1);
    const banner = page.getByLabel("Restricted pilot status");
    await expect(banner).toContainText("Pilot inactive");
    await expect(banner).toContainText("Adult teachers only");
    await expect(banner).toContainText("No student data");
    await expect(banner).toContainText("No billing");
  }
});

test("pilot onboarding is keyboard-completable and non-persistent", async ({ page }) => {
  await page.goto("/pilot");
  const acknowledgment = page.getByLabel("I understand the pilot boundaries.");
  await acknowledgment.focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Review my understanding" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toContainText("Nothing was saved");
  await page.reload();
  await expect(acknowledgment).not.toBeChecked();
});

test("feedback prepares a sanitized local summary without persistence or delivery", async ({ page }) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== "http://127.0.0.1:4180") externalRequests.push(request.url());
  });
  await page.goto("/pilot/feedback");
  await page.getByLabel(/Workflow being tested/).fill("Launch the canonical game");
  await page.getByLabel(/Reproducible steps/).fill("Open the play gateway and activate the launch link.");
  await page.getByLabel(/Expected behavior/).fill("The game opens in a new tab.");
  await page.getByLabel(/Observed behavior/).fill("The game opened and remained keyboard accessible.");
  await page.getByRole("button", { name: "Prepare feedback summary" }).click();
  await expect(page.getByRole("heading", { name: "Prepared summary" })).toBeVisible();
  await expect(page.getByLabel("Prepared feedback summary")).toContainText("Launch the canonical game");
  expect(externalRequests).toEqual([]);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Prepared summary" })).toHaveCount(0);
  await expect(page.getByLabel(/Workflow being tested/)).toHaveValue("");
});

test("feedback and class labels reject obvious prohibited student or secret data", async ({ page }) => {
  await page.goto("/pilot/feedback");
  await page.getByLabel(/Workflow being tested/).fill("Roster review");
  await page.getByLabel(/Reproducible steps/).fill("Use password reset token");
  await page.getByLabel(/Expected behavior/).fill("No change");
  await page.getByLabel(/Observed behavior/).fill("No change");
  await page.getByRole("button", { name: "Prepare feedback summary" }).click();
  await expect(page.getByTestId("pilot-feedback-errors")).toBeFocused();
  await expect(page.getByText(/Remove roster information/)).toBeVisible();
  await expect(page.getByText(/Remove account secret/)).toBeVisible();

  await page.goto("/teacher/classes/new");
  await page.getByLabel(/Class name/).fill("Grade 7 roster");
  await page.getByRole("button", { name: "Check class setup" }).click();
  await expect(page.getByTestId("error-summary")).toBeFocused();
  await expect(page.getByText(/Remove roster information/)).toBeVisible();
});

test("authentication and exit copy remain honest", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByText(/Password-recovery email delivery is not active/)).toBeVisible();
  await page.goto("/forgot-password");
  await expect(page.getByText(/does not promise that an email will be delivered/)).toBeVisible();
  await page.goto("/pilot/exit");
  await expect(page.getByText(/Permanent deletion is not automatic/)).toBeVisible();
  await expect(page.getByText(/permanent deletion execution remains separately controlled and disabled/i)).toBeVisible();
});

test("pilot routes reflow across the required local viewport matrix", async ({ page }) => {
  const viewports = [
    { width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 },
    { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }
  ];
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const [route] of pilotRoutes) {
      await page.goto(route);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    }
  }
});
