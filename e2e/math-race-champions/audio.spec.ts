import { expect, test, type Page } from "@playwright/test";

import { ENGINE_PROFILES } from "../../apps/platform-web/public/internal-games/math-race-champions/src/sound/engine-model.js";
import { OWNER, PAGE_ERRORS, answer, newPage, openClassroom, raceAnswer, signIn, waitForGo, waitForScreen } from "./helpers";

type RaceAudio = { car: string | null; sounding: boolean; profile: string | null; starts: number; ending: boolean; oneShots: number; level: number; rpm: number | null; gear: number | null; throttle: number | null; firing: number | null; speed: number | null };
type Snapshot = { source: string | null; paused: boolean; loop: boolean; volume: number; musicRoute: string; routeHeard: string; duck: number; playAttempts: number; unlocked: boolean; contextState: string; error: string | null; disposed: boolean; voices: number; race: RaceAudio };

const audio = (page: Page) => page.evaluate(() => (window as unknown as { __MATH_RACE__: { audio(): Snapshot } }).__MATH_RACE__.audio());
/** Whether this browser build has Web Audio at all (Playwright's WebKit for Windows does not; Safari does). */
const hasWebAudio = (page: Page) => page.evaluate(() => typeof (window.AudioContext ?? (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext) === "function");
const LIGHT = () => {
  try {
    localStorage.setItem("mathnexa:math-race-champions:preferences", JSON.stringify({ sound: true, music: true, graphics: "low" }));
  } catch {
    /* storage refused */
  }
};

/** Sample the engine every 50 ms for `ms`. */
async function sample(page: Page, ms: number): Promise<RaceAudio[]> {
  const frames: RaceAudio[] = [];
  const until = Date.now() + ms;
  while (Date.now() < until) {
    frames.push((await audio(page)).race);
    await page.waitForTimeout(50);
  }
  return frames;
}

type Recorded = RaceAudio & { correct: number; wrong: number; at: number };

/**
 * Records the engine inside the page, every 40 ms, together with the race's
 * own count of correct and wrong answers, so a recording can be cut at the
 * moment an answer landed however long the click itself took.
 */
async function record(page: Page, during: () => Promise<void>, afterMs: number): Promise<Recorded[]> {
  await page.evaluate(() => {
    const hook = window as unknown as { __MATH_RACE__: { audio(): { race: object }; race: { view(): { correct: number; wrong: number } | null } }; __raceLog?: object[]; __raceLogTimer?: number };
    hook.__raceLog = [];
    hook.__raceLogTimer = window.setInterval(() => {
      const view = hook.__MATH_RACE__.race.view();
      hook.__raceLog!.push({ ...hook.__MATH_RACE__.audio().race, correct: view?.correct ?? 0, wrong: view?.wrong ?? 0, at: performance.now() });
    }, 40);
  });
  await during();
  await page.waitForTimeout(afterMs);
  return page.evaluate(() => {
    const hook = window as unknown as { __raceLog: object[]; __raceLogTimer: number };
    window.clearInterval(hook.__raceLogTimer);
    return hook.__raceLog;
  }) as Promise<Recorded[]>;
}

async function testDrive(page: Page, carKey: string): Promise<void> {
  await page.evaluate(async (key) => {
    const hook = (window as unknown as { __MATH_RACE__: { context: unknown } }).__MATH_RACE__;
    const { startStage } = await import("/internal-games/math-race-champions/src/computer/start.js" as string);
    await startStage(hook.context, { stage: 1, carKey: key, reason: "try", settings: { categories: ["missing-addend", "powers"], difficulty: "beginner" } });
  }, carKey);
  await waitForScreen(page, "race");
}

test.afterEach(() => {
  expect(PAGE_ERRORS).toEqual([]);
});

test.describe("sound", () => {
  test("a race: music starts on the first press, steps back under the engine, and the engine follows the car", async ({ browser }) => {
    test.setTimeout(420_000);
    const { context, page } = await newPage(browser, { viewport: { width: 1366, height: 768 } });
    await context.addInitScript(LIGHT);
    await signIn(page, OWNER);
    await waitForScreen(page, "hub");
    const webAudio = await hasWebAudio(page);

    // Before any gesture: nothing has been played or even attempted.
    const silent = await audio(page);
    expect(silent.playAttempts).toBe(0);
    expect(silent.unlocked).toBe(false);
    expect(silent.contextState).toBe("uninitialized");
    expect(silent.race).toMatchObject({ car: null, sounding: false, starts: 0 });

    // The first real press, on something that is not the music button, starts the music.
    await page.getByRole("button", { name: "How to Play" }).click();
    await waitForScreen(page, "how-to");
    await page.waitForFunction(() => (window as unknown as { __MATH_RACE__: { audio(): { paused: boolean } } }).__MATH_RACE__.audio().paused === false, null, { timeout: 15_000 });
    const menu = await audio(page);
    expect(menu.source).toBe("/media/audio/cosmic-candy-catchers.mp3");
    expect(menu.loop).toBe(true);
    expect(menu.playAttempts).toBe(1);
    expect(menu.volume).toBeCloseTo(0.2, 5);
    expect(menu.duck).toBe(1);
    expect(menu.error).toBeNull();
    // Where Web Audio exists the music is mixed in the graph (so iPhone and iPad honour its level); otherwise by the element.
    expect(menu.musicRoute).toBe(webAudio ? "graph" : "element");
    if (webAudio) {
      expect(menu.contextState).toBe("running");
      // The routed music is checked for actually carrying sound, and it does: the route is kept.
      await page.waitForFunction(() => (window as unknown as { __MATH_RACE__: { audio(): { routeHeard: string } } }).__MATH_RACE__.audio().routeHeard !== "unknown", null, { timeout: 20_000 });
      const heard = await audio(page);
      expect(heard.routeHeard).toBe("yes");
      expect(heard.musicRoute).toBe("graph");
      expect(heard.paused).toBe(false);
      expect(heard.playAttempts).toBe(1);
    }
    await page.getByRole("button", { name: "Back to the game menu" }).click();
    await waitForScreen(page, "hub");

    // ---- A race in the Thunder X ----
    await testDrive(page, "thunder-x");
    await page.waitForFunction(() => (window as unknown as { __MATH_RACE__: { audio(): { race: { car: string | null } } } }).__MATH_RACE__.audio().race.car === "thunder-x", null, { timeout: 180_000 });
    const grid = await audio(page);
    // Music steps back under the race; it is the same single track, still playing.
    expect(grid.duck).toBeCloseTo(0.55, 5);
    expect(grid.volume).toBeCloseTo(0.11, 5);
    expect(grid.paused).toBe(false);
    expect(grid.playAttempts).toBe(1);
    expect(grid.race.car).toBe("thunder-x");
    if (!webAudio) {
      // No Web Audio in this build: no engine, no error, and the race still runs.
      expect(grid.race.sounding).toBe(false);
      await waitForGo(page, 180_000);
      await raceAnswer(page, true);
      await raceAnswer(page, false);
      expect((await audio(page)).race.sounding).toBe(false);
      await page.evaluate(() => (window as unknown as { __MATH_RACE__: { race: { driver: { quit(): Promise<void> } }; context: { navigate(name: string): void } } }).__MATH_RACE__.context.navigate("hub"));
      await waitForScreen(page, "hub");
      expect((await audio(page)).volume).toBeCloseTo(0.2, 5);
      await context.close();
      return;
    }

    const profile = ENGINE_PROFILES["thunder-x"];
    await page.waitForFunction(() => (window as unknown as { __MATH_RACE__: { audio(): { race: { sounding: boolean; rpm: number | null } } } }).__MATH_RACE__.audio().race.rpm !== null, null, { timeout: 30_000 });
    // On the grid the engine idles: this car's own idle, throttle shut, first gear, not moving.
    const idle = (await sample(page, 600)).filter((frame) => frame.rpm !== null);
    for (const frame of idle) {
      expect(frame.profile).toBe("thunder-x");
      expect(Math.abs(frame.rpm! - profile.idle)).toBeLessThan(60);
      expect(frame.throttle!).toBeLessThan(0.05);
      expect(frame.gear).toBe(1);
      expect(frame.speed).toBe(0);
    }
    expect(idle[0].starts).toBe(1);

    await waitForGo(page, 180_000);
    // A correct answer: the throttle opens and the engine climbs with the car.
    const before = (await audio(page)).race;
    const first = await record(page, () => raceAnswer(page, true), 900);
    const rising = first.slice(first.findIndex((frame) => frame.correct === 1));
    expect(rising.length).toBeGreaterThan(5);
    expect(Math.max(...rising.map((frame) => frame.throttle ?? 0))).toBeGreaterThan(0.8);
    expect(Math.max(...rising.map((frame) => frame.rpm ?? 0))).toBeGreaterThan(before.rpm! * 1.3);
    expect(Math.max(...rising.map((frame) => frame.speed ?? 0))).toBeGreaterThan(20);
    // Before the answer landed nothing had moved: the engine was still idling.
    for (const frame of first.filter((entry) => entry.correct === 0)) expect(frame.throttle!).toBeLessThan(0.05);

    // Several more: the engine is pulled up through the gears.
    for (let index = 0; index < 5; index += 1) await raceAnswer(page, true);
    await page.waitForTimeout(700);
    const fast = (await audio(page)).race;
    expect(fast.gear!).toBeGreaterThan(1);
    expect(fast.speed!).toBeGreaterThan(60);

    // A wrong answer: no acceleration sound. The throttle shuts, and the engine's road speed only falls.
    const second = await record(page, () => raceAnswer(page, false), 200);
    const landed = second.findIndex((frame) => frame.wrong === 1);
    expect(landed).toBeGreaterThan(0);
    // From 0.15 to 1.15 seconds after the wrong answer landed (the throttle stays shut for 1.3).
    const after = second.filter((frame) => frame.at > second[landed].at + 150 && frame.at < second[landed].at + 1250);
    // Software rendering draws only a few frames a second here (fewer on a busy machine): two samples of a shut throttle are enough.
    expect(after.length).toBeGreaterThan(1);
    expect(Math.max(...after.map((frame) => frame.throttle ?? 0))).toBeLessThan(0.05);
    for (let index = 1; index < after.length; index += 1) expect(after[index].speed!).toBeLessThanOrEqual(after[index - 1].speed! + 0.01);
    expect(after[after.length - 1].speed!).toBeLessThan(second[landed - 1].speed!);
    // And at no moment after the wrong answer was the throttle wider than it had been just before it.
    const throttleBefore = second[landed - 1].throttle!;
    expect(Math.max(...second.filter((frame) => frame.at >= second[landed].at && frame.at < second[landed].at + 1250).map((frame) => frame.throttle ?? 0))).toBeLessThanOrEqual(throttleBefore + 0.01);

    // One engine, one track: nothing has been started twice or left stacked up.
    const racing = await audio(page);
    expect(racing.race.starts).toBe(1);
    expect(racing.race.oneShots).toBeLessThanOrEqual(5);
    expect(racing.voices).toBeLessThanOrEqual(8);
    expect(racing.playAttempts).toBe(1);

    // Sound effects off: the engine stops at once, the music carries on. On again: one engine again.
    await page.evaluate(() => (window as unknown as { __MATH_RACE__: { context: { toggle(kind: string): boolean } } }).__MATH_RACE__.context.toggle("sound"));
    await page.waitForTimeout(300);
    const muted = await audio(page);
    expect(muted.race.sounding).toBe(false);
    expect(muted.paused).toBe(false);
    await page.evaluate(() => (window as unknown as { __MATH_RACE__: { context: { toggle(kind: string): boolean } } }).__MATH_RACE__.context.toggle("sound"));
    await page.waitForFunction(() => (window as unknown as { __MATH_RACE__: { audio(): { race: { sounding: boolean } } } }).__MATH_RACE__.audio().race.sounding, null, { timeout: 5000 });
    expect((await audio(page)).race.starts).toBe(2);

    // Music off leaves the engine alone; music on brings the one track back, still ducked.
    await page.evaluate(() => (window as unknown as { __MATH_RACE__: { context: { toggle(kind: string): boolean } } }).__MATH_RACE__.context.toggle("music"));
    const noMusic = await audio(page);
    expect(noMusic.paused).toBe(true);
    expect(noMusic.race.sounding).toBe(true);
    await page.evaluate(() => (window as unknown as { __MATH_RACE__: { context: { toggle(kind: string): boolean } } }).__MATH_RACE__.context.toggle("music"));
    await page.waitForFunction(() => (window as unknown as { __MATH_RACE__: { audio(): { paused: boolean } } }).__MATH_RACE__.audio().paused === false, null, { timeout: 15_000 });
    expect((await audio(page)).volume).toBeCloseTo(0.11, 5);

    // A hidden tab is silent: music paused, engine released. Seen again: both back, once each.
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    const hidden = await audio(page);
    expect(hidden.paused).toBe(true);
    expect(hidden.race.sounding).toBe(false);
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.locator(".race-stage").click({ position: { x: 5, y: 5 } });
    await page.waitForFunction(() => {
      const state = (window as unknown as { __MATH_RACE__: { audio(): { paused: boolean; race: { sounding: boolean } } } }).__MATH_RACE__.audio();
      return state.paused === false && state.race.sounding;
    }, null, { timeout: 15_000 });
    expect((await audio(page)).race.starts).toBe(3);

    // Leaving the race: the engine is released and the music comes back up.
    await page.getByRole("button", { name: "Leave the race" }).click();
    await page.getByRole("button", { name: "Leave", exact: true }).click();
    await page.waitForFunction(() => document.body.dataset.screen !== "race", null, { timeout: 30_000 });
    const left = await audio(page);
    expect(left.race).toMatchObject({ car: null, sounding: false });
    expect(left.duck).toBe(1);
    expect(left.volume).toBeCloseTo(0.2, 5);
    expect(left.paused).toBe(false);
    expect(left.error).toBeNull();
    await context.close();
  });

  test("each garage car has its own engine: idle note, redline and gearbox differ", async ({ browser }) => {
    test.setTimeout(600_000);
    const { context, page } = await newPage(browser, { viewport: { width: 1024, height: 768 } });
    await context.addInitScript(LIGHT);
    await signIn(page, OWNER);
    await waitForScreen(page, "hub");
    test.skip(!(await hasWebAudio(page)), "This browser build has no Web Audio; the engine cannot sound here.");
    const idles: Record<string, number> = {};
    for (const key of ["starter", "turbo-sprint", "velocity-gt", "thunder-x"]) {
      await page.getByRole("button").first().focus();
      await page.keyboard.press("Shift");
      await testDrive(page, key);
      await page.waitForFunction((car) => {
        const race = (window as unknown as { __MATH_RACE__: { audio(): { race: { profile: string | null; rpm: number | null } } } }).__MATH_RACE__.audio().race;
        return race.profile === car && race.rpm !== null;
      }, key, { timeout: 180_000 });
      await page.waitForTimeout(500);
      const race = (await audio(page)).race;
      expect(race.profile).toBe(key);
      expect(Math.abs(race.rpm! - ENGINE_PROFILES[key].idle)).toBeLessThan(60);
      idles[key] = race.firing!;
      await page.evaluate(async () => {
        const hook = (window as unknown as { __MATH_RACE__: { race: { driver: { quit(): Promise<void> } }; context: { navigate(name: string): Promise<void> } } }).__MATH_RACE__;
        await hook.race.driver.quit();
        await hook.context.navigate("hub");
      });
      await waitForScreen(page, "hub");
      expect((await audio(page)).race).toMatchObject({ car: null, sounding: false });
    }
    // Four different idle notes.
    expect(new Set(Object.values(idles).map((value) => Math.round(value))).size).toBe(4);
    // Four races, four engines: none left over, none doubled.
    expect((await audio(page)).race.starts).toBe(4);
    await context.close();
  });

  test("Classroom Competition: music and answer sounds only, never an engine", async ({ browser }) => {
    const { context, page } = await newPage(browser, { viewport: { width: 1366, height: 768 } });
    await signIn(page, OWNER);
    await openClassroom(page);
    await page.waitForFunction(() => (window as unknown as { __MATH_RACE__: { audio(): { paused: boolean } } }).__MATH_RACE__.audio().paused === false, null, { timeout: 15_000 });
    for (let round = 0; round < 6; round += 1) {
      await answer(page, "turquoise", round !== 2);
      await answer(page, "pink", round !== 4);
      const state = await audio(page);
      expect(state.race).toMatchObject({ car: null, sounding: false, starts: 0 });
      // The classroom keeps the music at its normal level: nothing to duck under.
      expect(state.duck).toBe(1);
      expect(state.volume).toBeCloseTo(0.2, 5);
      expect(state.voices).toBeLessThanOrEqual(8);
    }
    expect((await audio(page)).playAttempts).toBe(1);
    await context.close();
  });
});
