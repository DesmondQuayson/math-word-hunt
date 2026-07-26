import { expect, test, type Page } from "@playwright/test";

async function expectNoPageOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
}

test("scenario 1: a teacher can reach the current v7 game before class", async ({ page }) => {
  await page.goto("/teacher");
  const launch = page.getByRole("link", { name: "Open current v7 game" });
  await expect(launch).toBeVisible();
  await launch.click();
  await expect(page.getByRole("heading", { level: 1, name: "Launch the vocabulary hunt" })).toBeVisible();
  await expect(page.getByTestId("legacy-game-launch")).toBeVisible();
});

test("scenario 2: classes explain their future purpose without implying saved data", async ({ page }) => {
  await page.goto("/teacher/classes");
  await expect(page.getByText("No saved classes", { exact: true })).toBeVisible();
  await expect(page.getByText(/will not require student accounts or a roster/i)).toBeVisible();
  await expect(page.getByRole("link", { name: "Review class setup" })).toBeVisible();
  await expect(page.locator("[data-prototype-fixture]")).toHaveCount(0);
});

test("scenario 3: activity planning covers every classroom setting without saving", async ({ page }) => {
  await page.goto("/teacher/activities/new");
  await page.getByLabel(/Grade/).selectOption("7");
  await page.getByLabel(/Topic/).selectOption("g7-probability");
  await page.getByLabel(/Lesson/).selectOption("g7-7-3");
  await page.getByLabel(/Game mode/).selectOption("team-hunt");
  await page.getByLabel(/Time limit/).fill("20");
  await page.getByLabel(/Team count/).selectOption("4");
  await page.getByLabel(/Use Combine Mode/).check();
  await page.getByRole("button", { name: "Check activity setup" }).click();
  await expect(page.getByText("Nothing was assigned or saved.")).toBeVisible();
});

test("scenario 4: class validation recovers without a fake save", async ({ page }) => {
  await page.goto("/teacher/classes/new");
  await page.getByRole("button", { name: "Check class setup" }).click();
  await expect(page.getByTestId("error-summary")).toBeFocused();
  await page.getByRole("link", { name: "Class name needs attention." }).click();
  await expect(page.getByLabel(/Class name/)).toBeFocused();
  await page.getByLabel(/Class name/).fill("Period 2 math");
  await page.getByRole("button", { name: "Check class setup" }).click();
  await expect(page.getByText("Nothing was saved.")).toBeVisible();
});

test("scenario 5: current v7 and a future managed live session remain distinct", async ({ page }) => {
  await page.goto("/teacher/sessions");
  await expect(page.getByRole("heading", { name: "Current v7 game" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Managed live session" })).toBeVisible();
  await expect(page.getByText("Remote student devices cannot join.")).toBeVisible();
  await page
    .getByLabel("No managed sessions")
    .getByRole("link", { name: "Review session setup" })
    .click();
  await expect(page.getByRole("button", { name: "Create managed session" })).toBeDisabled();
  await expect(page.getByRole("link", { name: "Open current v7 game" })).toBeVisible();
});

test("scenario 6: reports describe aggregate use without student tracking", async ({ page }) => {
  await page.goto("/teacher/reports");
  await expect(page.getByText("No reports exist", { exact: true })).toBeVisible();
  await expect(page.getByText(/no standards claims, student-level tracking/i)).toBeVisible();
  await expect(page.getByText("Aggregate activity and session history.")).toBeVisible();
});

test("scenario 7: curriculum states and review limits remain explicit", async ({ page }) => {
  await page.goto("/teacher/curriculum");
  for (const label of [
    "Ready",
    "Thin—Combine Mode recommended",
    "Coming soon",
    "Teacher review pending"
  ]) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(page.getByText("Teacher review is still required.")).toBeVisible();
});

test("scenario 8: Smart Board layouts keep actions readable and bounded", async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.goto("/teacher");
  await expectNoPageOverflow(page);
  const measurements = await page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>(".teacher-shell");
    const launch = Array.from(document.querySelectorAll<HTMLElement>("a"))
      .find((element) => element.textContent?.includes("Open current v7 game"));
    const heading = document.querySelector<HTMLElement>("h1");
    return {
      shellWidth: shell?.getBoundingClientRect().width ?? 0,
      launchHeight: launch?.getBoundingClientRect().height ?? 0,
      launchFontSize: launch ? parseFloat(getComputedStyle(launch).fontSize) : 0,
      headingFontSize: heading ? parseFloat(getComputedStyle(heading).fontSize) : 0
    };
  });
  expect(measurements.shellWidth).toBeLessThanOrEqual(1440);
  expect(measurements.launchHeight).toBeGreaterThanOrEqual(44);
  expect(measurements.launchFontSize).toBeGreaterThanOrEqual(16);
  expect(measurements.headingFontSize).toBeGreaterThanOrEqual(40);
});

test("scenario 9: keyboard users can traverse and identify teacher navigation", async ({ page }) => {
  await page.goto("/teacher/activities/new");
  const navigation = page.getByRole("navigation", { name: "Teacher workspace" });
  const overview = navigation.getByRole("link", { name: "Overview" });
  await overview.focus();
  await expect(overview).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(navigation.getByRole("link", { name: "Classes" })).toBeFocused();
  await expect(navigation.getByRole("link", { name: /Activities Current/ })).toHaveAttribute(
    "aria-current",
    "page"
  );
});

test("scenario 10: 200 and 400 percent zoom-equivalent reflow preserves content", async ({ page }) => {
  for (const viewport of [
    { width: 640, height: 720, label: "200 percent" },
    { width: 320, height: 568, label: "400 percent" }
  ]) {
    await test.step(viewport.label, async () => {
      await page.setViewportSize(viewport);
      for (const route of ["/teacher", "/teacher/activities/new", "/teacher/sessions/new"]) {
        await page.goto(route);
        await expectNoPageOverflow(page);
        await expect(page.getByRole("main")).toBeVisible();
      }
    });
  }
});

test("forced colors preserves focus, current navigation, and unavailable controls", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await page.goto("/teacher/sessions/new");
  const current = page.getByRole("navigation", { name: "Teacher workspace" })
    .getByRole("link", { name: /Live Sessions Current/ });
  await expect(current).toHaveAttribute("aria-current", "page");
  await current.focus();
  const focus = await current.evaluate((element) => ({
    outlineStyle: getComputedStyle(element).outlineStyle,
    outlineWidth: getComputedStyle(element).outlineWidth
  }));
  expect(focus.outlineStyle).not.toBe("none");
  expect(parseFloat(focus.outlineWidth)).toBeGreaterThanOrEqual(3);
  await expect(page.getByRole("button", { name: "Create managed session" })).toBeDisabled();
});

test("mobile landscape and text-spacing overrides preserve teacher workflows", async ({ page }) => {
  await page.setViewportSize({ width: 667, height: 375 });
  await page.goto("/teacher/activities/new");
  await page.addStyleTag({
    content: `
      * { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }
      p { margin-bottom: 2em !important; }
    `
  });
  await expectNoPageOverflow(page);
  await expect(page.getByLabel(/Grade/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Check activity setup" })).toBeVisible();
});

test("the complete responsive matrix has no horizontal page overflow", async ({ page }) => {
  const viewports = [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 667, height: 375 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
    { width: 2560, height: 1440 }
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const route of ["/teacher", "/teacher/activities/new", "/teacher/reports"]) {
      await page.goto(route);
      await expectNoPageOverflow(page);
    }
  }
});
