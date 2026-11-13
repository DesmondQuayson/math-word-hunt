import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { OWNER, PAGE_ERRORS, evidence, newPage, signIn, waitForScreen } from "./helpers";

// Overtaking on the real race screen.
//
// Each test hands the game's own race screen a scripted race (scenario-harness.js:
// racers who answer at fixed moments, raced by the game's own engine) and reads
// back, frame by frame, what the screen drew. What is checked is the picture
// against the race: cars pass beside one another, never through and never by a
// jump, and the order on the road, the place read-out, the minimap and the
// leaderboard all say the same thing the race does.
//
// A headless browser draws the 3D road slowly (a few frames a second). The cars
// are placed by time, not by frame, so the checks hold at any frame rate; the
// frame rates themselves are measured on a real GPU, separately.

const HARNESS = readFileSync(new URL("./scenario-harness.js", import.meta.url), "utf8");

type Pass = { at: number; id: string; kind: "rival passes player" | "player passes rival"; lane: number; nearestLane: number | null; onScreen: boolean; besideFrames: number; besideOnScreen: number };
type Report = {
  title: string;
  racers: number;
  frames: number;
  fps: number;
  frameMsMean: number;
  frameMsP95: number;
  overlaps: number;
  offRoad: number;
  backwards: number;
  teleports: number;
  sideJumps: number;
  longestWrongSideMs: number;
  longestPositionWrongMs: number;
  longestMinimapWrongMs: number;
  longestBoardWrongMs: number;
  truePasses: number;
  passes: Pass[];
  flashes: { at: number; text: string; clear: boolean }[];
  flashOverQuestion: number;
  mirror: { at: number; text: string }[];
  positions: { at: number; text: string }[];
  mostCars: number;
  mostOnScreen: number;
  finishOrder: { player: number; rivals: { id: string; finishMs: number }[]; drawn: { id: string; gapM: number }[] } | null;
  examples: Record<string, unknown>[];
  requests: number;
  graphics: string | null;
  raceMs: number;
};
type Harness = { start(config: Record<string, unknown>): Promise<{ title: string; seconds: number; racers: number; lengthKm: number }>; report(): Report; stop(): void };
const harness = (page: Page) => page.evaluate(HARNESS);

async function open(page: Page): Promise<void> {
  await signIn(page, OWNER);
  await waitForScreen(page, "hub");
  await harness(page);
}

/** Run one scripted race to the end of its script and return what the screen drew. */
async function run(page: Page, config: Record<string, unknown>, shots: { name: string; when(report: Report): boolean }[] = []): Promise<Report> {
  const started = await page.evaluate((options) => (window as unknown as { __RACE_SCENARIO__: Harness }).__RACE_SCENARIO__.start(options), config);
  await waitForScreen(page, "race");
  await page.waitForFunction(() => ["low", "medium", "high"].includes(document.querySelector("main.race")?.getAttribute("data-graphics") ?? ""), null, { timeout: 120_000, polling: 100 });
  const pending = [...shots];
  const deadline = Date.now() + started.seconds * 1000 + 30_000;
  let report: Report;
  for (;;) {
    report = await page.evaluate(() => (window as unknown as { __RACE_SCENARIO__: Harness }).__RACE_SCENARIO__.report());
    for (const shot of [...pending]) {
      if (!shot.when(report)) continue;
      pending.splice(pending.indexOf(shot), 1);
      await evidence(page, shot.name);
    }
    if (report.raceMs >= started.seconds * 1000 || Date.now() > deadline) break;
    await page.waitForTimeout(250);
  }
  await page.evaluate(() => (window as unknown as { __RACE_SCENARIO__: Harness }).__RACE_SCENARIO__.stop());
  if (process.env.RACE_SCENARIO_DEBUG) console.log(JSON.stringify({ ...report, frameMs: undefined }, null, 1));
  console.log(`${report.title}: ${report.frames} frames at ${report.fps} fps, ${report.passes.length} passes drawn (${report.truePasses} in the race), ${report.mostCars} cars, flashes ${JSON.stringify(report.flashes.map((flash) => flash.text))}`);
  return report;
}

/** What must hold in every race, whatever happens in it. */
function expectPhysical(report: Report): void {
  expect(report.graphics, "the 3D road is drawing").toMatch(/^(low|medium|high)$/);
  expect(report.frames).toBeGreaterThan(20);
  expect(report.examples, "nothing through anything, nothing by a jump").toEqual([]);
  expect(report.overlaps).toBe(0);
  expect(report.offRoad).toBe(0);
  expect(report.backwards).toBe(0);
  expect(report.teleports).toBe(0);
  expect(report.sideJumps).toBe(0);
  // The read-outs are refreshed several times a second: they may trail the race by one refresh, no more.
  expect(report.longestPositionWrongMs).toBeLessThan(1200);
  expect(report.longestMinimapWrongMs).toBeLessThan(1200);
  expect(report.longestBoardWrongMs).toBeLessThan(1200);
  // Whatever is said about a place gained or lost is said over the road, clear of the question.
  expect(report.flashOverQuestion).toBe(0);
  // A scripted race talks to no server; the picture asks for nothing either.
  expect(report.requests).toBeLessThan(40);
}

/**
 * Every pass is beside the player's car: the other car is a lane to the side when it is drawn level and when
 * it is drawn past. Where the browser draws enough frames to see the pass happen (a real GPU), the car is also
 * in the picture while it is alongside. A headless browser draws two or three frames a second, and a quick pass
 * can fall between two of them; the placing rules themselves are checked at every frame rate in traffic.test.ts.
 */
function expectRealPasses(report: Report): void {
  for (const pass of report.passes) {
    expect(Math.abs(pass.lane), `${pass.kind} at ${pass.at} ms: a lane to the side`).toBeGreaterThanOrEqual(2.3);
    if (pass.nearestLane !== null) expect(pass.nearestLane, `${pass.kind} at ${pass.at} ms: a lane to the side when level`).toBeGreaterThanOrEqual(2.3);
    if (report.fps < 20) continue;
    expect(pass.besideFrames, `${pass.kind} at ${pass.at} ms: drawn alongside`).toBeGreaterThan(0);
    expect(pass.besideOnScreen / pass.besideFrames, `${pass.kind} at ${pass.at} ms: in the picture while alongside`).toBeGreaterThan(0.5);
  }
}

test.afterEach(() => {
  expect(PAGE_ERRORS).toEqual([]);
});

test.describe("Overtaking: Computer Race", () => {
  test("A: the player catches the computer, draws alongside and passes", async ({ browser }) => {
    const { context, page } = await newPage(browser, { viewport: { width: 1366, height: 768 } });
    await open(page);
    const report = await run(page, { scenario: "A" }, [
      { name: "overtake-A-catching", when: (now) => now.raceMs > 3000 },
      { name: "overtake-A-passed", when: (now) => now.passes.length === 1 }
    ]);
    expectPhysical(report);
    expectRealPasses(report);
    expect(report.truePasses).toBe(1);
    expect(report.passes.map((pass) => pass.kind)).toEqual(["player passes rival"]);
    expect(report.longestWrongSideMs).toBe(0);
    expect(report.positions.map((position) => position.text)).toEqual(["2nd of 2", "1st of 2"]);
    expect(report.flashes.map((flash) => flash.text)).toEqual(["YOU MOVED INTO 1ST!"]);
    await context.close();
  });

  test("B: the computer catches the player, draws alongside and passes", async ({ browser }) => {
    const { context, page } = await newPage(browser, { viewport: { width: 1366, height: 768 } });
    await open(page);
    const report = await run(page, { scenario: "B" }, [
      { name: "overtake-B-in-the-mirror", when: (now) => now.mirror.length > 0 },
      { name: "overtake-B-passed", when: (now) => now.passes.length === 1 }
    ]);
    expectPhysical(report);
    expectRealPasses(report);
    expect(report.truePasses).toBe(1);
    expect(report.passes.map((pass) => pass.kind)).toEqual(["rival passes player"]);
    expect(report.longestWrongSideMs).toBe(0);
    expect(report.positions.map((position) => position.text)).toEqual(["1st of 2", "2nd of 2"]);
    expect(report.flashes.map((flash) => flash.text)).toEqual(["RIVAL MOVED AHEAD"]);
    // Before it is alongside, the car coming up behind is named, with the side it is on.
    expect(report.mirror.length).toBeGreaterThan(0);
    expect(report.mirror[0]!.text).toMatch(/^(left|right): Computer \d+ m behind$/);
    await context.close();
  });

  test("C and D: pass and re-pass, then four lead changes", async ({ browser }) => {
    test.setTimeout(400_000);
    const { context, page } = await newPage(browser, { viewport: { width: 1366, height: 768 } });
    await open(page);
    const again = await run(page, { scenario: "C" });
    expectPhysical(again);
    expectRealPasses(again);
    expect(again.truePasses).toBe(2);
    expect(again.passes.map((pass) => pass.kind)).toEqual(["player passes rival", "rival passes player"]);
    expect(again.longestWrongSideMs).toBe(0);
    expect(again.flashes.map((flash) => flash.text)).toEqual(["YOU MOVED INTO 1ST!", "RIVAL MOVED AHEAD"]);

    const many = await run(page, { scenario: "D" });
    expectPhysical(many);
    expectRealPasses(many);
    expect(many.truePasses).toBe(4);
    expect(many.passes.map((pass) => pass.kind)).toEqual(["player passes rival", "rival passes player", "player passes rival", "rival passes player"]);
    expect(many.longestWrongSideMs).toBe(0);
    expect(many.positions.map((position) => position.text)).toEqual(["2nd of 2", "1st of 2", "2nd of 2", "1st of 2", "2nd of 2"]);
    await context.close();
  });

  test("E: a near-simultaneous finish, and a start from the grid", async ({ browser }) => {
    test.setTimeout(400_000);
    const { context, page } = await newPage(browser, { viewport: { width: 1366, height: 768 } });
    await open(page);
    const finish = await run(page, { scenario: "E" });
    expectPhysical(finish);
    expect(finish.longestWrongSideMs).toBe(0);
    // The computer crossed first, a fraction of a second ahead: it is drawn ahead when the player crosses.
    expect(finish.finishOrder).not.toBeNull();
    const cpu = finish.finishOrder!.rivals[0]!;
    expect(cpu.finishMs).toBeLessThan(finish.finishOrder!.player);
    expect(finish.finishOrder!.player - cpu.finishMs).toBeLessThan(400);
    expect(finish.finishOrder!.drawn[0]!.gapM).toBeGreaterThanOrEqual(0);
    expect(finish.positions.at(-1)!.text).toBe("2nd of 2");

    const grid = await run(page, { scenario: "GRID" }, [{ name: "overtake-grid-lights", when: (now) => now.raceMs > 300 }]);
    expectPhysical(grid);
    expectRealPasses(grid);
    expect(grid.truePasses).toBe(1);
    expect(grid.passes.map((pass) => pass.kind)).toEqual(["player passes rival"]);
    await context.close();
  });

  test("a phone held upright: the pass is still seen", async ({ browser }) => {
    const { context, page } = await newPage(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await open(page);
    const report = await run(page, { scenario: "B" }, [{ name: "overtake-B-phone-passed", when: (now) => now.passes.length === 1 }]);
    expectPhysical(report);
    expectRealPasses(report);
    expect(report.passes.map((pass) => pass.kind)).toEqual(["rival passes player"]);
    expect(report.flashes.map((flash) => flash.text)).toEqual(["RIVAL MOVED AHEAD"]);
    await context.close();
  });
});

test.describe("Overtaking: Online Race", () => {
  for (const racers of [2, 5, 10]) {
    test(`${racers} racers on once-a-second standings`, async ({ browser }) => {
      test.setTimeout(400_000);
      const { context, page } = await newPage(browser, { viewport: { width: 1366, height: 768 } });
      await open(page);
      const report = await run(page, { room: racers, seconds: 40 }, [{ name: `overtake-online-${racers}-racers`, when: (now) => now.raceMs > 12_000 }]);
      expectPhysical(report);
      expectRealPasses(report);
      // The nearest cars are drawn (never more than the picture's limit), and they are in the picture.
      expect(report.mostCars).toBeGreaterThanOrEqual(Math.min(racers, 4));
      expect(report.mostCars).toBeLessThanOrEqual(10);
      expect(report.mostOnScreen).toBeGreaterThanOrEqual(2);
      // A late row can leave a car on the wrong side of the player for the moment it takes to drive there.
      expect(report.longestWrongSideMs).toBeLessThan(racers <= 5 ? 1500 : 4000);
      await context.close();
    });
  }
});
