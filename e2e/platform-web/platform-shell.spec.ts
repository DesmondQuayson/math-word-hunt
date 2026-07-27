import { expect, test } from "@playwright/test";

const routes = [
  ["/", "Words make math visible."],
  ["/play", "Launch the vocabulary hunt"],
  ["/teacher", "Your next classroom move, made clear"],
  ["/teacher/classes", "Organize the room without identifying students"],
  ["/teacher/classes/new", "Describe a future class"],
  ["/teacher/classes/not-a-record", "No class record is available"],
  ["/teacher/activities", "Turn curriculum choices into a classroom-ready plan"],
  ["/teacher/activities/new", "Shape a vocabulary activity"],
  ["/teacher/sessions", "Know which kind of session you are starting"],
  ["/teacher/sessions/new", "Prepare the room before the clock starts"],
  ["/teacher/reports", "Review the lesson, not a prediction about a child"],
  ["/teacher/curriculum", "See what is playable before you plan"],
  ["/account", "A future teacher account, with clear boundaries"]
] as const;

test("all platform routes render with one clear page heading", async ({ page }) => {
  for (const [route, heading] of routes) {
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    await expect(page.locator("h1")).toHaveCount(1);
  }
});

test("the shell exposes semantic landmarks and navigation", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("banner")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("contentinfo")).toBeVisible();
});

test("keyboard navigation reaches the skip link and visible primary actions", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();

  await page.keyboard.press("Tab");
  const primaryAction = page.getByRole("link", { name: "Launch the current game" });
  await expect(primaryAction).toBeFocused();
  const outlineWidth = await primaryAction.evaluate(
    (element) => getComputedStyle(element).outlineWidth
  );
  expect(outlineWidth).not.toBe("0px");
});

test("mobile layouts avoid horizontal overflow and preserve 44px targets", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [route] of routes) {
    await page.goto(route);
    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
  }

  await page.goto("/");
  const targets = await page.locator("a:visible, summary:visible").evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height, text: element.textContent };
    })
  );
  for (const target of targets) {
    expect.soft(target.height, target.text ?? "interactive target").toBeGreaterThanOrEqual(44);
  }
});

test("tablet, desktop, and Smart Board layouts remain bounded and readable", async ({ page }) => {
  const viewports = [
    { width: 768, height: 1024 },
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 }
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const [route] of routes) {
      await page.goto(route);
      const layout = await page.evaluate(() => {
        const documentWidth = document.documentElement.scrollWidth;
        const main = document.querySelector("main");
        const widestContainer = Math.max(
          ...Array.from(document.querySelectorAll<HTMLElement>(".container")).map(
            (element) => element.getBoundingClientRect().width
          )
        );
        return {
          documentWidth,
          viewportWidth: window.innerWidth,
          mainVisible: Boolean(main && main.getBoundingClientRect().height > 0),
          widestContainer
        };
      });

      expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
      expect(layout.mainVisible).toBe(true);
      expect(layout.widestContainer).toBeLessThanOrEqual(1440);
    }
  }
});

test("interactive controls preserve minimum sizing and visible focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/teacher");

  const targets = await page.locator(
    "header a:visible, main a:visible, main button:visible, main summary:visible, footer a:visible"
  ).evaluateAll(
    (elements) => elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { height: rect.height, width: rect.width, text: element.textContent };
    })
  );
  for (const target of targets) {
    expect.soft(target.height, target.text ?? "interactive target").toBeGreaterThanOrEqual(44);
  }

  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Skip to main content" });
  await expect(skipLink).toBeFocused();
  const focus = await skipLink.evaluate((element) => ({
    style: getComputedStyle(element).outlineStyle,
    width: getComputedStyle(element).outlineWidth
  }));
  expect(focus.style).not.toBe("none");
  expect(parseFloat(focus.width)).toBeGreaterThanOrEqual(3);
});

test("every route has unique IDs and a logical landmark structure", async ({ page }) => {
  for (const [route] of routes) {
    await page.goto(route);
    const structure = await page.evaluate(() => {
      const ids = Array.from(document.querySelectorAll<HTMLElement>("[id]")).map(
        (element) => element.id
      );
      return {
        duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index),
        banners: document.querySelectorAll("header.site-header").length,
        mains: document.querySelectorAll("main").length,
        footers: document.querySelectorAll("footer").length
      };
    });
    expect(structure.duplicateIds).toEqual([]);
    expect(structure.banners).toBe(1);
    expect(structure.mains).toBe(1);
    expect(structure.footers).toBe(1);
  }
});

test("reduced-motion preference removes meaningful transitions", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const motion = await page.getByTestId("term-track").locator("span").first().evaluate(
    (element) => ({
      transitionDuration: getComputedStyle(element).transitionDuration,
      scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior
    })
  );
  expect(parseFloat(motion.transitionDuration)).toBeLessThanOrEqual(0.001);
  expect(motion.scrollBehavior).toBe("auto");
});

test("teacher workspace is anonymous and cannot claim Pro access", async ({ page }) => {
  await page.goto("/teacher");
  await expect(page.getByText("Teacher accounts are not connected in this preview.")).toBeVisible();
  const access = page.getByTestId("premium-access-state");
  await expect(access).toHaveAttribute("data-access", "denied");
  await expect(access).toHaveText("Free plan");
});

test("teacher navigation exposes the complete future information architecture", async ({ page }) => {
  await page.goto("/teacher/activities/new");
  const navigation = page.getByRole("navigation", { name: "Teacher workspace" });
  for (const label of [
    "Overview",
    "Classes",
    "Activities",
    "Live Sessions",
    "Reports",
    "Curriculum",
    "Account"
  ]) {
    await expect(navigation.getByRole("link", { name: new RegExp(label) })).toBeVisible();
  }
  await expect(navigation.getByRole("link", { name: /Activities/ })).toHaveAttribute(
    "aria-current",
    "page"
  );

  const links = navigation.getByRole("link");
  await links.first().focus();
  await expect(links.first()).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(links.nth(1)).toBeFocused();
});

test("browser-controlled values never grant premium authority", async ({ context, page }) => {
  await context.addCookies([
    {
      name: "premium",
      value: "true",
      domain: "127.0.0.1",
      path: "/"
    }
  ]);
  await page.addInitScript(() => {
    localStorage.setItem("premium", "true");
    sessionStorage.setItem("entitlement", "premium-game-modes");
  });
  await page.goto("/teacher?premium=true&paid=true#premium-game-modes");
  await expect(page.getByTestId("premium-access-state")).toHaveAttribute(
    "data-access",
    "denied"
  );
});

test("browser-controlled values cannot enable demonstration records", async ({ context, page }) => {
  await context.addCookies([
    {
      name: "MVH_TEACHER_PROTOTYPE_MODE",
      value: "enabled",
      domain: "127.0.0.1",
      path: "/"
    }
  ]);
  await page.addInitScript(() => {
    localStorage.setItem("MVH_TEACHER_PROTOTYPE_MODE", "enabled");
    sessionStorage.setItem("teacherPrototype", "enabled");
  });
  await page.goto("/teacher/classes?MVH_TEACHER_PROTOTYPE_MODE=enabled#enabled");
  await expect(page.getByText("Demonstration data", { exact: true })).toHaveCount(0);
  await expect(page.locator("[data-prototype-fixture]")).toHaveCount(0);
  await expect(page.getByText("No saved classes", { exact: true })).toBeVisible();
});

test("play gateway links directly and safely to canonical v7", async ({ page }) => {
  await page.goto("/play");
  const launch = page.getByTestId("legacy-game-launch");
  await expect(launch).toHaveAttribute(
    "href",
    "http://127.0.0.1:4173/docs/index.html"
  );
  await expect(launch).toHaveAttribute("target", "_blank");
  await expect(launch).toHaveAttribute("rel", /noopener/);
  const response = await page.request.get(
    "http://127.0.0.1:4173/docs/index.html"
  );
  expect(response.ok()).toBe(true);
});

test("an unavailable legacy game leaves a usable fallback on the gateway", async ({ page }) => {
  await page.route("http://127.0.0.1:4173/docs/index.html", (route) => route.abort());
  await page.goto("/play");
  const popupPromise = page.waitForEvent("popup");
  await page.getByTestId("legacy-game-launch").click();
  const popup = await popupPromise;
  await popup.waitForLoadState("domcontentloaded").catch(() => undefined);
  await popup.close();

  await expect(page).toHaveURL(/\/play$/);
  await page.getByText("If the game does not open", { exact: true }).click();
  await expect(page.getByTestId("legacy-game-fallback")).toBeVisible();
  await expect(page.getByText("Your platform preview has no saved work to lose.")).toBeVisible();
});

test("future workspace routes contain no fabricated persisted records", async ({ page }) => {
  for (const route of [
    "/teacher",
    "/teacher/classes",
    "/teacher/classes/algebra-foundations",
    "/teacher/activities",
    "/teacher/sessions",
    "/teacher/reports",
    "/account"
  ]) {
    await page.goto(route);
    await expect(page.locator("[data-persisted-record]")).toHaveCount(0);
    await expect(page.locator("[data-prototype-fixture]")).toHaveCount(0);
    await expect(page.getByText("Demonstration data", { exact: true })).toHaveCount(0);
  }
  await page.goto("/teacher/classes");
  await expect(page.getByText("No saved classes", { exact: true })).toBeVisible();
  await page.goto("/teacher/reports");
  await expect(page.getByText("No reports exist", { exact: true })).toBeVisible();
  await page.goto("/account");
  await expect(page.getByText("No profile has been created")).toBeVisible();
  await expect(page.getByText(/no sign-up, login, saved profile, plan, subscription/i)).toBeVisible();
});

test("class and activity prototypes expose accessible validation and honest outcomes", async ({ page }) => {
  await page.goto("/teacher/classes/new");
  await page.getByRole("button", { name: "Check class setup" }).click();
  await expect(page.getByTestId("error-summary")).toBeFocused();
  await expect(page.getByLabel(/Class name/)).toHaveAttribute("aria-invalid", "true");
  await page.getByLabel(/Class name/).fill("Math Language Lab");
  await page.getByRole("button", { name: "Check class setup" }).click();
  await expect(page.getByText("Nothing was saved.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Cancel and return to classes" })).toBeVisible();
  await page.getByRole("link", { name: "Cancel and return to classes" }).click();
  await expect(page).toHaveURL(/\/teacher\/classes$/);

  await page.goto("/teacher/activities/new");
  await page.getByRole("button", { name: "Check activity setup" }).click();
  await expect(page.getByTestId("error-summary")).toBeFocused();
  await expect(page.getByText("Choose a grade.").first()).toBeVisible();
  await page.getByLabel(/Grade/).selectOption("7");
  await page.getByLabel(/Topic/).selectOption("g7-probability");
  await page.getByLabel(/Lesson/).selectOption("g7-7-3");
  await page.getByLabel(/Game mode/).selectOption("team-hunt");
  await page.getByLabel(/Team count/).selectOption("4");
  await page.getByRole("button", { name: "Check activity setup" }).click();
  await expect(page.getByText("Nothing was assigned or saved.")).toBeVisible();
  await page.getByRole("link", { name: "Cancel and return to activities" }).click();
  await expect(page).toHaveURL(/\/teacher\/activities$/);
});

test("curriculum and session boundaries are explicit", async ({ page }) => {
  await page.goto("/teacher/curriculum");
  for (const count of ["506", "170", "8", "13"]) {
    await expect(page.getByText(count, { exact: true })).toBeVisible();
  }
  await expect(page.getByText(/definitions still require teacher review/i)).toBeVisible();
  await expect(page.getByText(/Combine Mode/i).first()).toBeVisible();

  await page.goto("/teacher/sessions/new");
  await expect(page.getByRole("link", { name: "Open current v7 game" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create managed session" })).toBeDisabled();
  await expect(page.getByText("Unavailable until account and live-session services are ready.")).toBeVisible();
});
