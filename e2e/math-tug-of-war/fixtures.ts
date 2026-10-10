import { test as base, type Browser } from "@playwright/test";

/**
 * Math Tug of War e2e fixtures.
 *
 * The runtime chooses the 3D scene whenever the browser has a hardware WebGL2
 * path. Headless WebKit does, so the classic projects would otherwise build a
 * full 3D scene for every match they open. The classic projects pin the
 * classic (SVG) scene through the runtime's review hook; the `*-3d` projects
 * (scene-3d.spec.ts) force the 3D scene on with `?graphics=3d` instead.
 */
export const test = base.extend({
  browser: async ({ browser }, use, testInfo) => {
    if (/-3d/.test(testInfo.project.name)) {
      await use(browser);
      return;
    }
    const original = browser.newContext.bind(browser);
    const pinned: Browser["newContext"] = async (options) => {
      const context = await original(options);
      await context.addInitScript(() => {
        (window as unknown as { __MATHNEXA_GRAPHICS__?: string }).__MATHNEXA_GRAPHICS__ = "classic";
      });
      return context;
    };
    browser.newContext = pinned;
    try {
      await use(browser);
    } finally {
      browser.newContext = original;
    }
  }
});

export { expect } from "@playwright/test";
