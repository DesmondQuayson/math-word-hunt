import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

// The logged-out homepage hero (2026-11-22): Start free trial, Create account and
// Sign in, in that order, on their existing routes; reachable by keyboard in the
// same order with a visible focus indicator; never clipped, overlapping or
// scrolling sideways; roomy touch targets; and no axe findings for contrast,
// names or target size. Signed-in states are covered in teacher-first-access-flow.
//
// Create account opens the same /sign-up page as Start free trial, in its
// account presentation (entry=account): the account heading and lead, no plan
// card, the button "Create account" and one short next-step line under it.
// The form, its destination and the request it sends are identical.

const axeSource = readFileSync(resolve("node_modules/axe-core/axe.min.js"), "utf8");
const EXPECTED = [["Start free trial", "/sign-up?next=/subscription"], ["Create account", "/sign-up?entry=account"], ["Sign in", "/sign-in"]];
// Create account is registration first (2026-11-22): no plan card, only this short line under its button.
const ACCOUNT_DISCLOSURE = "After creating your account and confirming your email, you can start your 24-hour free trial. A payment method is required to begin the trial. After the trial, MathNexa renews at $5.99/month unless canceled.";
const SIGN_UP_MODES = [
  { name: "Create account", path: "/sign-up?entry=account", heading: "Create your MathNexa account", button: "Create account" },
  { name: "Start free trial", path: "/sign-up?next=/subscription", heading: "Start your free trial", button: "Start free trial" }
] as const;

async function settleAnimations(page: Page) {
  // Let one-shot entrance animations finish (never wait on an endless one), so nothing is measured half faded in.
  await page.evaluate(async () => {
    const finite = document.getAnimations().filter((animation) => Number.isFinite(Number(animation.effect?.getComputedTiming().endTime)));
    await Promise.all(finite.map((animation) => animation.finished.catch(() => undefined)));
  });
}

async function axeViolations(page: Page, context: string) {
  await page.evaluate(axeSource);
  return page.evaluate(async (selector) => {
    const axe = (window as unknown as { axe: { run: (context: string, options: unknown) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe;
    const result = await axe.run(selector, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } });
    return result.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`);
  }, context);
}

test("logged-out hero: the three entry points in order, by pointer and keyboard", async ({ page }) => {
  await page.goto("/");
  const actions = page.locator(".teacher-home-actions a");
  await expect(actions).toHaveCount(3);
  expect(await actions.evaluateAll((links) => links.map((link) => [link.textContent?.trim(), link.getAttribute("href")]))).toEqual(EXPECTED);
  for (const [name] of EXPECTED) await expect(page.locator(".teacher-home-actions").getByRole("link", { name, exact: true })).toBeVisible();
  // Primary, secondary, then the lighter action.
  expect(await actions.evaluateAll((links) => links.map((link) => link.className))).toEqual(["button button-primary", "button button-secondary", "button button-ghost"]);

  // Keyboard: reach the first by Tab, then Tab walks the other two in visual order, each with a visible focus ring.
  await actions.nth(1).focus();
  await page.keyboard.press("Shift+Tab");
  for (const [name] of EXPECTED) {
    const focused = page.locator(".teacher-home-actions a:focus-visible");
    await expect(focused, name).toHaveText(name);
    const ring = await focused.evaluate((link) => {
      const style = getComputedStyle(link);
      return { outline: style.outlineStyle, width: parseFloat(style.outlineWidth), shadow: style.boxShadow };
    });
    expect((ring.outline !== "none" && ring.width > 0) || ring.shadow !== "none", `${name} focus indicator`).toBe(true);
    await page.keyboard.press("Tab");
  }

  // Each goes to its existing page.
  // A. Start free trial: the sign-up page in its trial wording, unchanged.
  await page.locator(".teacher-home-actions").getByRole("link", { name: "Start free trial", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-up\?next=\/subscription$/);
  await expect(page.getByRole("heading", { level: 1, name: "Start your free trial" })).toBeVisible();
  await expect(page.locator("form").first().getByRole("button", { name: "Start free trial" })).toBeVisible();
  // The trial wording keeps its plan card.
  await expect(page.getByRole("region", { name: "Plan" })).toContainText("After the trial, $5.99 USD is billed monthly and renews automatically until canceled.");
  // B. Create account: the same page and form, registration first: no plan card, one short line under the button.
  await page.goto("/");
  await page.locator(".teacher-home-actions").getByRole("link", { name: "Create account", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-up\?entry=account$/);
  await expect(page.getByRole("heading", { level: 1, name: "Create your MathNexa account" })).toBeVisible();
  await expect(page.locator(".onboarding-header .lede")).toHaveText("Set up your account to access MathNexa.");
  await expect(page.getByRole("region", { name: "Plan" })).toHaveCount(0);
  await expect(page.locator(".plan-summary, .plan-summary-card, .plan-facts")).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText(/MathNexa monthly|USD \/ month|renews automatically until canceled/);
  await expect(page.locator(".form-actions--primary .form-footnote")).toHaveText(ACCOUNT_DISCLOSURE);
  await expect(page.locator("form").first().getByRole("button", { name: "Create account" })).toBeVisible();
  await expect(page.locator("form").first().locator('input[name="next"]')).toHaveValue("/subscription");
  await expect(page.getByLabel("Email address")).toBeVisible();
  await page.goto("/");
  await page.locator(".teacher-home-actions").getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
});

test("C. both sign-up wordings send the same request to the same sign-up action: same fields, next=/subscription, no entry", async ({ page }) => {
  // The submission is captured and stopped in the browser, so no account is created and no email is sent.
  const captured: { action: string; fields: string[][] }[] = [];
  await page.route("**/sign-up**", async (route) => {
    const request = route.request();
    const action = request.headers()["next-action"];
    if (request.method() !== "POST" || !action) return route.continue();
    const body = request.postData() ?? "";
    captured.push({ action, fields: [...body.matchAll(/name="([^"]+)"\r\n\r\n([\s\S]*?)\r\n--/g)].map(([, name, value]) => [name, value]) });
    await route.abort();
  });
  for (const [index, mode] of [SIGN_UP_MODES[1], SIGN_UP_MODES[0]].entries()) {
    await page.goto(mode.path);
    await expect(page.getByRole("heading", { level: 1, name: mode.heading })).toBeVisible();
    const form = page.locator("form").first();
    await form.locator('input[name="email"]').fill("same-person@example.test");
    await form.locator('input[name="password"]').fill("SyntheticAdult42!");
    await form.locator('input[name="passwordConfirmation"]').fill("SyntheticAdult42!");
    await form.getByRole("button", { name: mode.button }).click();
    await expect.poll(() => captured.length, mode.name).toBe(index + 1);
  }
  const [trial, account] = captured;
  expect(account).toEqual(trial);
  const next = trial.fields.find(([name]) => /(^|_)next$/.test(name));
  expect(next?.[1]).toBe("/subscription");
  expect(trial.fields.map(([name]) => name).join(" ")).not.toMatch(/entry/);
  expect(JSON.stringify(trial.fields)).not.toContain("entry");
});

test("sign-up wordings at phone, tablet and desktop widths: no sideways scroll or clipping, one h1 and ordered headings, labelled controls, keyboard order, focus ring and no axe findings", async ({ page }) => {
  test.setTimeout(240_000);
  for (const mode of SIGN_UP_MODES) {
    for (const width of [320, 375, 390, 768, 820, 1024, 1366, 1920]) {
      const label = `${mode.name} ${width}px`;
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      await page.goto(mode.path);
      await expect(page.getByRole("heading", { level: 1 }), label).toHaveText(mode.heading);
      await settleAnimations(page);
      const facts = await page.evaluate(() => {
        const visible = (element: Element) => {
          const box = element.getBoundingClientRect();
          return box.width > 0 && box.height > 0 && getComputedStyle(element).visibility !== "hidden";
        };
        const clientWidth = document.documentElement.clientWidth;
        const main = document.querySelector("main") ?? document.body;
        const levels = [...main.querySelectorAll("h1, h2, h3, h4, h5, h6")].filter(visible).map((heading) => Number(heading.tagName[1]));
        const disclosure = [...document.querySelectorAll(".onboarding-header h1, .onboarding-header .lede, .onboarding-header .trial-offer-note, .plan-summary, .plan-facts li, .form-footnote, .form-actions button")];
        // Text is cut off only where overflow is hidden: by the element itself (its content is larger than its
        // box) or by an ancestor whose box ends before the element does. Glyph tails past a tight line height
        // in a visible-overflow box are not clipping.
        const hides = (element: Element) => { const style = getComputedStyle(element); return style.overflowX !== "visible" || style.overflowY !== "visible"; };
        const cutOff = (element: Element) => {
          if (hides(element) && (element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1)) return true;
          const box = element.getBoundingClientRect();
          for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
            if (!hides(parent)) continue;
            const frame = parent.getBoundingClientRect();
            if (box.left < frame.left - 1 || box.right > frame.right + 1 || box.top < frame.top - 1 || box.bottom > frame.bottom + 1) return true;
          }
          return false;
        };
        return {
          overflow: document.documentElement.scrollWidth - clientWidth,
          levels,
          clipped: disclosure.filter(cutOff).map((element) => element.className || element.tagName),
          outside: disclosure.filter((element) => { const box = element.getBoundingClientRect(); return box.left < -0.5 || box.right > clientWidth + 0.5; }).map((element) => element.className || element.tagName),
          disclosureShown: disclosure.length > 0 && disclosure.every(visible)
        };
      });
      expect(facts.overflow, `${label} horizontal overflow`).toBeLessThanOrEqual(0);
      expect(facts.clipped, `${label} clipped text`).toEqual([]);
      expect(facts.outside, `${label} outside the viewport`).toEqual([]);
      expect(facts.disclosureShown, `${label} terms shown`).toBe(true);
      expect(facts.levels.filter((level) => level === 1), `${label} one h1`).toHaveLength(1);
      expect(facts.levels[0], `${label} h1 first`).toBe(1);
      expect(facts.levels.every((level, index) => index === 0 || level <= facts.levels[index - 1] + 1), `${label} heading levels ${facts.levels.join(",")}`).toBe(true);
      // Screen-reader names for every control of the form.
      const form = page.locator("form").first();
      await expect(form.getByLabel("Email address"), label).toBeVisible();
      await expect(form.getByLabel(/^Password/), label).toBeVisible();
      await expect(form.getByLabel(/^Confirm password/), label).toBeVisible();
      await expect(form.getByRole("button", { name: "Show password" }), label).toHaveCount(2);
      await expect(form.getByRole("button", { name: mode.button }), label).toBeVisible();
      if (mode.name === "Create account") {
        await expect(page.locator(".form-actions--primary .form-footnote"), label).toHaveText(ACCOUNT_DISCLOSURE);
        await expect(page.getByRole("region", { name: "Plan" }), label).toHaveCount(0);
      } else {
        await expect(page.getByRole("region", { name: "Plan" }), label).toBeVisible();
      }
      expect(await axeViolations(page, "main"), `${label} axe`).toEqual([]);
    }

    // Keyboard: from the email field, Tab walks the form in reading order to the button and Sign in, each with a visible focus ring.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(mode.path);
    const form = page.locator("form").first();
    await form.locator('input[name="email"]').focus();
    const order: string[] = [];
    for (let step = 0; step < 7; step += 1) {
      const focused = await page.evaluate(() => {
        const element = document.activeElement as HTMLElement | null;
        if (!element) return { name: "none", ring: false };
        const style = getComputedStyle(element);
        const ring = (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0) || style.boxShadow !== "none";
        const name = element.tagName === "INPUT" ? `input:${(element as HTMLInputElement).name}` : `${element.tagName.toLowerCase()}:${element.getAttribute("aria-label") ?? element.textContent?.trim()}`;
        return { name, ring };
      });
      order.push(focused.name);
      expect(focused.ring, `${mode.name} focus ring on ${focused.name}`).toBe(true);
      await page.keyboard.press("Tab");
    }
    expect(order, mode.name).toEqual(["input:email", "input:password", "button:Show password", "input:passwordConfirmation", "button:Show password", `button:${mode.button}`, "a:Sign in"]);
  }
});

test("logged-out hero: no sideways scroll, clipping or overlap, roomy targets, and no axe findings at phone, tablet and desktop widths", async ({ page }) => {
  for (const width of [320, 375, 390, 768, 820, 1024, 1366, 1920]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
    await page.goto("/");
    const row = page.locator(".teacher-home-actions");
    await expect(row.locator("a")).toHaveCount(3);
    // Let the hero's one-shot entrance animations finish first (never wait on an endless one), as the
    // other phase 9 checks do, so nothing is measured half faded in.
    await page.locator(".teacher-home-copy").evaluate(async (copy) => {
      const finite = document.getAnimations().filter((animation) => {
        const target = (animation.effect as KeyframeEffect | null)?.target;
        return target instanceof Element && copy.contains(target) && Number.isFinite(Number(animation.effect?.getComputedTiming().endTime));
      });
      await Promise.all(finite.map((animation) => animation.finished.catch(() => undefined)));
    });
    const facts = await row.evaluate((element) => {
      const links = [...element.querySelectorAll("a")];
      const boxes = links.map((link) => link.getBoundingClientRect());
      const overlap = boxes.some((a, i) => boxes.some((b, j) => i < j && a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5));
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        clipped: links.some((link) => link.scrollWidth > link.clientWidth + 1 || link.scrollHeight > link.clientHeight + 1),
        overlap,
        minHeight: Math.min(...boxes.map((box) => box.height)),
        minWidth: Math.min(...boxes.map((box) => box.width)),
        outside: boxes.some((box) => box.left < 0 || box.right > document.documentElement.clientWidth),
        order: boxes.every((box, index) => index === 0 || box.top > boxes[index - 1].top + 1 || (Math.abs(box.top - boxes[index - 1].top) <= 1 && box.left > boxes[index - 1].left))
      };
    });
    expect(facts.overflow, `${width}px horizontal overflow`).toBeLessThanOrEqual(0);
    expect(facts.clipped, `${width}px clipped label`).toBe(false);
    expect(facts.overlap, `${width}px overlapping buttons`).toBe(false);
    expect(facts.outside, `${width}px button outside the viewport`).toBe(false);
    expect(facts.minHeight, `${width}px target height`).toBeGreaterThanOrEqual(44);
    expect(facts.minWidth, `${width}px target width`).toBeGreaterThanOrEqual(44);
    expect(facts.order, `${width}px visual order follows reading order`).toBe(true);

    await page.evaluate(axeSource);
    const violations = await page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run: (context: string, options: unknown) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe;
      const result = await axe.run(".teacher-home-copy", { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } });
      return result.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`);
    });
    expect(violations, `${width}px axe`).toEqual([]);
  }
});
