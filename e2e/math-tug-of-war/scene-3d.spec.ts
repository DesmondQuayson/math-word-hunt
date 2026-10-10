import { expect, test, type Page } from "@playwright/test";

import { answer, expectNoHorizontalOverflow, openGame, panel, startLocal, waitForUnlocked } from "./helpers";

/**
 * Math Tug of War — 3D scene regression.
 *
 * The 3D layer is forced on with `?graphics=3d` (the harness runs on
 * SwiftShader, which the runtime would otherwise refuse) so these checks run
 * on every engine. They prove the 3D layer mirrors the authoritative SVG
 * scene, never changes the match, falls back cleanly, and keeps the layout
 * and accessibility contract.
 */

const GAME_3D = "/games/math-tug-of-war/play?graphics=3d";

type SceneSnapshot = {
  renderer: string;
  tier: string;
  fallback: string | null;
  three: null | {
    tier: string;
    ready: boolean;
    position: number;
    tugX: number;
    winner: string | null;
    frames: number;
    frameMs: number;
    drawCalls: number;
    triangles: number;
    states: Record<"turquoise" | "pink", string[]>;
    momentum: Record<"turquoise" | "pink", number>;
  };
};

async function sceneSnapshot(page: Page): Promise<SceneSnapshot> {
  return page.evaluate(() => (window as unknown as { __MATHNEXA_TUG_SCENE__: { snapshot(): SceneSnapshot } }).__MATHNEXA_TUG_SCENE__.snapshot());
}

async function waitFor3D(page: Page) {
  await expect(page.locator(".scene-stage")).toHaveAttribute("data-renderer", "3d", { timeout: 90_000 });
  await expect(page.locator(".scene-stage canvas.tug-scene-3d")).toBeVisible();
}

async function startTeams3D(page: Page, skill: "addition" | "multiplication" | "integers" = "addition") {
  await page.goto(GAME_3D);
  await expect(page.getByRole("heading", { level: 1, name: /Math Tug of War/ })).toBeVisible();
  await page.locator('button[data-mode="teams"]').click();
  await page.fill("#team-1-name", "Sharks");
  await page.fill("#team-2-name", "Comets");
  await page.locator(`#skill-${skill}`).check();
  await page.getByRole("button", { name: "Start Game" }).click();
  await expect(page.locator(".team-panel.team-turquoise")).toBeVisible();
  await waitFor3D(page);
}

test.describe("Math Tug of War — 3D scene", () => {
  test("3D layer loads over the SVG scene, keeps the accessible layer and mirrors every pull", async ({ page }) => {
    await startTeams3D(page);
    const snapshot = await sceneSnapshot(page);
    expect(snapshot.renderer).toBe("3d");
    expect(snapshot.three?.ready).toBe(true);
    expect(snapshot.three?.states.turquoise).toEqual(["ready", "ready", "ready"]);
    // The SVG stays in the tree with its semantics; the canvas is decoration only.
    await expect(page.locator(".tug-scene-svg")).toHaveAttribute("role", "img");
    await expect(page.locator(".tug-scene-svg title")).toHaveText(/The match is even/);
    await expect(page.locator("canvas.tug-scene-3d")).toHaveAttribute("aria-hidden", "true");

    await answer(page, "turquoise");
    await expect(page.locator(".tug-scene-svg")).toHaveAttribute("data-position", "-1");
    await expect.poll(async () => (await sceneSnapshot(page)).three?.position).toBe(-1);
    await expect.poll(async () => (await sceneSnapshot(page)).three?.states.turquoise.some((state) => state === "pulling")).toBe(true);
    await expect(page.locator(".scene-status")).toHaveText("Sharks pulled!");

    // A wrong answer moves nothing in either layer.
    await waitForUnlocked(page, "pink");
    await answer(page, "pink", { wrong: true });
    await expect(panel(page, "pink")).toHaveAttribute("data-result", "incorrect");
    await expect(page.locator(".tug-scene-svg")).toHaveAttribute("data-position", "-1");
    expect((await sceneSnapshot(page)).three?.position).toBe(-1);
    expect((await sceneSnapshot(page)).three?.winner).toBeNull();

    await waitForUnlocked(page, "pink");
    await answer(page, "pink");
    await expect(page.locator(".tug-scene-svg")).toHaveAttribute("data-position", "0");
    await expect.poll(async () => (await sceneSnapshot(page)).three?.position).toBe(0);
    // Pullers settle back to their stance between pulls.
    await expect.poll(async () => (await sceneSnapshot(page)).three?.states.pink.every((state) => state === "ready"), { timeout: 5_000 }).toBe(true);
  });

  test("celebration only starts after the engine confirms the winner; losers fall and recover", async ({ page }) => {
    await startTeams3D(page, "multiplication");
    for (let pull = 1; pull <= 6; pull += 1) {
      await waitForUnlocked(page, "turquoise");
      await answer(page, "turquoise");
      await expect(page.locator(".tug-scene-svg")).toHaveAttribute("data-position", String(-pull));
      expect((await sceneSnapshot(page)).three?.winner).toBeNull();
      expect((await sceneSnapshot(page)).three?.states.turquoise).not.toContain("celebrate");
    }
    await waitForUnlocked(page, "turquoise");
    await answer(page, "turquoise");
    await expect(page.locator(".tug-scene-svg")).toHaveClass(/won-turquoise/);
    await expect.poll(async () => (await sceneSnapshot(page)).three?.winner).toBe("turquoise");
    await expect.poll(async () => (await sceneSnapshot(page)).three?.states.turquoise).toEqual(["celebrate", "celebrate", "celebrate"]);
    await expect.poll(async () => (await sceneSnapshot(page)).three?.states.pink.every((state) => ["falling", "down"].includes(state)), { timeout: 10_000 }).toBe(true);
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Sharks WINS!" })).toBeVisible({ timeout: 8_000 });
    // Losers get up again while the result card shows.
    await expect.poll(async () => (await sceneSnapshot(page)).three?.states.pink.every((state) => ["rising", "dejected"].includes(state)), { timeout: 20_000 }).toBe(true);
    await dialog.getByRole("button", { name: "Play Again" }).click();
    await expect(page.locator(".tug-scene-svg")).toHaveAttribute("data-position", "0");
    await expect.poll(async () => (await sceneSnapshot(page)).three?.states.pink).toEqual(["ready", "ready", "ready"]);
    expect((await sceneSnapshot(page)).three?.winner).toBeNull();
  });

  test("the 3D toggle switches to the classic scene and back without touching the match", async ({ page }) => {
    await startTeams3D(page);
    await answer(page, "turquoise");
    await expect(page.locator(".tug-scene-svg")).toHaveAttribute("data-position", "-1");
    const toggle = page.locator('[data-action="graphics"]');
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator(".scene-stage")).toHaveAttribute("data-renderer", "svg");
    await expect(page.locator("canvas.tug-scene-3d")).toHaveCount(0);
    await expect(page.locator(".tug-scene-svg")).toHaveAttribute("data-position", "-1");
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("mathnexa:math-tug-of-war:preferences") ?? "{}"));
    expect(stored.graphics).toBe("classic");
    await waitForUnlocked(page, "pink");
    await answer(page, "pink");
    await expect(page.locator(".tug-scene-svg")).toHaveAttribute("data-position", "0");
    await toggle.click();
    await waitFor3D(page);
    expect((await sceneSnapshot(page)).three?.position).toBe(0);
  });

  test("classic preference, reduced motion and a classic override never create a canvas", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await startLocal(page, "teams", "addition", { turquoise: "Sharks", pink: "Comets" });
    await expect(page.locator(".scene-stage")).toHaveAttribute("data-renderer", "svg");
    await expect(page.locator("canvas")).toHaveCount(0);
    await expect(page.locator('[data-action="graphics"]')).toBeDisabled();
    await context.close();

    const classic = await browser.newPage();
    await classic.goto("/games/math-tug-of-war/play?graphics=classic");
    await classic.locator('button[data-mode="robot"]').click();
    await classic.getByRole("button", { name: "Start Game" }).click();
    await expect(classic.locator(".scene-stage")).toHaveAttribute("data-renderer", "svg");
    await expect(classic.locator("canvas")).toHaveCount(0);
    await classic.close();
  });

  test("the scene keeps the math readable: no overlap with questions or keys, no horizontal overflow, every size", async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name.includes("mobile"), "viewport sweep runs once per engine");
    const SIZES: Array<[number, number]> = [[320, 568], [360, 800], [375, 667], [390, 844], [414, 896], [430, 932], [768, 1024], [1024, 768], [1366, 768], [1920, 1080], [2560, 1440], [3840, 2160]];
    for (const [width, height] of SIZES) {
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 1000 });
      const page = await context.newPage();
      await startTeams3D(page);
      await expectNoHorizontalOverflow(page);
      const boxes = await page.evaluate(() => {
        const rect = (selector: string) => {
          const element = document.querySelector(selector);
          const box = element?.getBoundingClientRect();
          return box ? { x: box.x, y: box.y, w: box.width, h: box.height } : null;
        };
        const canvas = document.querySelector<HTMLCanvasElement>("canvas.tug-scene-3d");
        return {
          stage: rect(".scene-stage"),
          svg: rect(".tug-scene-svg"),
          canvas: canvas ? { w: canvas.width, h: canvas.height, cssW: canvas.clientWidth, cssH: canvas.clientHeight } : null,
          questions: [...document.querySelectorAll(".question")].map((node) => node.getBoundingClientRect()).map((b) => ({ x: b.x, y: b.y, w: b.width, h: b.height })),
          keys: [...document.querySelectorAll(".key")].map((node) => node.getBoundingClientRect()).filter((b) => b.width < 40 || b.height < 40).length
        };
      });
      expect(boxes.stage, `${width}x${height} stage`).not.toBeNull();
      expect(boxes.canvas, `${width}x${height} canvas`).not.toBeNull();
      // The canvas is exactly the SVG's box (same aspect, no stretching) and has real pixels.
      expect(Math.abs((boxes.canvas!.cssW ?? 0) - boxes.svg!.w), `${width}x${height} canvas width`).toBeLessThanOrEqual(1.5);
      expect(Math.abs((boxes.canvas!.cssH ?? 0) - boxes.svg!.h), `${width}x${height} canvas height`).toBeLessThanOrEqual(1.5);
      expect(boxes.canvas!.w).toBeGreaterThan(100);
      // The scene never covers a question or a key.
      const stage = boxes.stage!;
      for (const question of boxes.questions) {
        const overlap = !(question.x + question.w <= stage.x || question.x >= stage.x + stage.w || question.y + question.h <= stage.y || question.y >= stage.y + stage.h);
        expect(overlap, `${width}x${height} question overlaps the scene`).toBe(false);
      }
      expect(boxes.keys, `${width}x${height} small keys`).toBe(0);
      await context.close();
    }
  });

  test("accessibility with the 3D scene on: no serious or critical axe violations", async ({ page }) => {
    const { axeSeriousOrCritical } = await import("./helpers");
    await startTeams3D(page);
    expect(await axeSeriousOrCritical(page)).toEqual([]);
    await answer(page, "turquoise");
    await expect(page.locator("#announcer")).toContainText(/pulled/);
    // Let the pull motion and the status pill settle before auditing colours.
    await page.waitForTimeout(900);
    expect(await axeSeriousOrCritical(page)).toEqual([]);
  });

  test("home screen prefetch and teardown: leaving the game disposes the renderer", async ({ page }) => {
    await page.goto(GAME_3D);
    await expect(page.getByRole("heading", { level: 1, name: /Math Tug of War/ })).toBeVisible();
    // Prefetch starts from the home screen (idle), before any match.
    await expect.poll(async () => page.evaluate(() => performance.getEntriesByType("resource").some((entry) => entry.name.includes("/models/characters.gltf"))), { timeout: 30_000 }).toBe(true);
    await page.locator('button[data-mode="teams"]').click();
    await page.getByRole("button", { name: "Start Game" }).click();
    await waitFor3D(page);
    await page.locator('[data-action="exit"]').click();
    await expect(page.getByRole("heading", { name: /Two Teams/ })).toBeVisible();
    await expect(page.locator("canvas.tug-scene-3d")).toHaveCount(0);
    expect(await page.evaluate(() => "__MATHNEXA_TUG_SCENE__" in window)).toBe(false);
    void openGame;
  });
});
