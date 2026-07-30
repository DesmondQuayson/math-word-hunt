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
  await expect(page.getByText(/Confirmation and recovery delivery are unavailable/)).toBeVisible();
  await page.goto("/forgot-password");
  await expect(page.getByText(/Do not rely on email delivery/)).toBeVisible();
  await expect(page.getByText(/result never confirms whether an email address belongs/)).toBeVisible();
  await page.goto("/pilot/exit");
  await expect(page.getByText(/Permanent deletion is not automatic/)).toBeVisible();
  await expect(page.getByText(/permanent deletion execution remains separately controlled and disabled/i)).toBeVisible();
});

test("pilot routes reflow across the required local viewport matrix", async ({ page }) => {
  const viewports = [
    { width: 320, height: 568 }, { width: 360, height: 800 }, { width: 390, height: 844 }, { width: 412, height: 915 },
    { width: 844, height: 390 }, { width: 768, height: 1024 }, { width: 1024, height: 768 },
    { width: 1280, height: 720 }, { width: 1366, height: 768 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }
  ];
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const [route] of pilotRoutes) {
      await page.goto(route);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    }
  }
});

test("pilot controls preserve visible focus and minimum target size", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/pilot");
  const targets = await page.locator(".pilot-status-banner a:visible, .pilot-shell a:visible, .pilot-shell button:visible, .pilot-shell input:visible").evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect(); return { height: rect.height, width: rect.width, label: element.textContent || element.getAttribute("aria-label") };
  }));
  for (const target of targets) expect.soft(target.height, target.label ?? "pilot target").toBeGreaterThanOrEqual(44);
  const privacyLink = page.getByRole("navigation", { name: "Pilot readiness" }).getByRole("link", { name: "Privacy" });
  await privacyLink.focus();
  const focus = await privacyLink.evaluate((element) => ({ width: parseFloat(getComputedStyle(element).outlineWidth), style: getComputedStyle(element).outlineStyle }));
  expect(focus.style).not.toBe("none"); expect(focus.width).toBeGreaterThanOrEqual(3);
});

test("pilot routes respect reduced motion and forced colors", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  await page.goto("/pilot");
  const result = await page.getByRole("navigation", { name: "Pilot readiness" }).evaluate((element) => ({
    transition: parseFloat(getComputedStyle(element).transitionDuration || "0"),
    scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
    borderStyle: getComputedStyle(element).borderStyle
  }));
  expect(result.transition).toBeLessThanOrEqual(0.001);
  expect(result.scrollBehavior).toBe("auto");
  expect(result.borderStyle).not.toBe("none");
});

test("pilot content withstands text spacing, 200 percent scaling, and 400-percent-equivalent reflow", async ({ page }) => {
  for (const [width, fontSize] of [[640, "200%"], [320, "200%"]] as const) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["/pilot", "/pilot/feedback", "/pilot/exit"]) {
      await page.goto(route);
      await page.addStyleTag({ content: `*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}html{font-size:${fontSize}!important}` });
      const layout = await page.evaluate(() => ({
        contained: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
        offenders: Array.from(document.querySelectorAll<HTMLElement>("body *")).map((element) => {
          const rect = element.getBoundingClientRect(); return { tag: element.tagName, className: element.className, text: element.textContent?.trim().slice(0, 60), left: rect.left, right: rect.right, width: rect.width };
        }).filter((item) => item.right > document.documentElement.clientWidth + 1 || item.left < -1).slice(0, 8)
      }));
      expect(layout.contained, `${route} at ${width}px: ${JSON.stringify(layout)}`).toBe(true);
    }
  }
});
