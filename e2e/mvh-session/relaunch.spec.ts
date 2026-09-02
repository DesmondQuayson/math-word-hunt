import { expect, test, type Page } from "@playwright/test";

/**
 * The owner's production scenario, automated: a session born on an OLD
 * application generation, a deployment underneath it, and Math Vocabulary Hunt
 * relaunched through the normal UI in the SAME tab. No reload. No cache
 * clearing. HTTP cache and executing JavaScript are different things: a
 * content-hashed asset cannot replace a document that is already running, so
 * the DOCUMENT lifecycle itself is under test here.
 */

const BASE = 0.5;
const DUCKED = 0.15;

const base = () => process.env.MVH_SESSION_URL ?? "http://127.0.0.1:4199";
const control = async (path: string) => (await fetch(base() + path)).text();
const requests = async () => JSON.parse(await control("/__control/log")) as { mode: string; path: string; search: string }[];

const instrument = () => {
  const scope = window as unknown as { __EL__: HTMLAudioElement[]; Audio: typeof Audio };
  scope.__EL__ = [];
  const NativeAudio = scope.Audio;
  const Wrapped = function (this: unknown, src?: string) {
    const element = new NativeAudio(src);
    scope.__EL__.push(element);
    return element;
  } as unknown as typeof Audio;
  Wrapped.prototype = NativeAudio.prototype;
  scope.Audio = Wrapped;
};

const musicVolume = (page: Page) =>
  page.evaluate(() => {
    const found = (window as unknown as { __EL__: HTMLAudioElement[] }).__EL__.find((element) =>
      (element.currentSrc || element.src || "").includes("cosmic-candy-catchers")
    );
    return found ? { volume: found.volume, paused: found.paused } : null;
  });
const voiceState = (page: Page) => page.evaluate(() => document.documentElement.getAttribute("data-voice-state"));
const loadedRuntimeSrc = (page: Page) =>
  page.evaluate(
    () => document.querySelector('script[data-mathnexa-game-suite="audio-runtime"]')?.getAttribute("src") ?? null
  );
const hasFreshnessGuard = (page: Page) =>
  page.evaluate(() => Boolean(document.querySelector('script[data-mathnexa-game-suite="freshness"]')));

async function playIntoGame(page: Page) {
  await page.locator('.grade-card[data-grade="6"]').click();
  const topic = page.locator(".topic-card:not(.incomplete)").first();
  await topic.locator("summary").click();
  await topic.locator(".choose-topic-button").click();
  await page.locator(".lesson-row").first().click();
  await expect(page.locator("#letterGrid .grid-cell").first()).toBeVisible();
  await page.locator("#wordPanelTitle").click();
}

async function assertDucks(page: Page) {
  await expect.poll(async () => (await musicVolume(page))?.paused, { timeout: 25_000 }).toBe(false);
  expect((await musicVolume(page))?.volume).toBe(BASE);
  await page.locator(".word-card").first().click();
  await expect.poll(() => voiceState(page), { timeout: 25_000 }).toBe("started");
  expect((await musicVolume(page))?.volume, "ducking must hold in the relaunched generation").toBe(DUCKED);
  await expect.poll(() => voiceState(page), { timeout: 30_000 }).toBe("ended");
  await expect.poll(async () => (await musicVolume(page))?.volume, { timeout: 15_000 }).toBe(BASE);
}

test.describe("same-session relaunch across a deployment", () => {
  test.beforeEach(async () => {
    await control("/__control/mode/A");
    await control("/__control/clearlog");
  });

  test("leave the old game via its own UI, relaunch from Games, and the NEW generation loads and ducks", async ({
    page
  }) => {
    await page.addInitScript(instrument);

    // ---- The session begins in the OLD world, launched the normal way.
    await page.goto("/games");
    await page.locator("#launch").click();
    await page.waitForURL(/\/game\/runtime\/index\.html/);
    expect(await loadedRuntimeSrc(page), "the old generation shipped the standalone modules").toBeNull();
    expect(await hasFreshnessGuard(page), "the old generation had no freshness guard").toBe(false);
    const oldGenerationRequests = await requests();
    expect(oldGenerationRequests.some((r) => r.path === "/game-suite/natural-voice.js")).toBe(true);

    // ---- Deployment happens underneath the live session.
    await control("/__control/mode/B");
    await control("/__control/clearlog");

    // ---- The learner leaves the game with the game's own Back to Games link
    //      and relaunches from the Games page. Same tab. Nothing cleared.
    await page.locator(".mathnexa-back-link").click();
    await page.waitForURL(/\/games/);
    await page.locator("#launch").click();
    await page.waitForURL(/\/game\/runtime\/index\.html/);

    // The relaunch went through /play and carries the NEW generation identity.
    const relaunch = await requests();
    const documentHits = relaunch.filter((r) => r.path === "/game/runtime/index.html");
    expect(documentHits.length, "the relaunch must fetch a fresh game document").toBeGreaterThan(0);
    expect(
      documentHits.some((r) => /^\?launch=[0-9a-f]{7,40}$/.test(r.search)),
      `the launch URL must carry the deployment generation: ${JSON.stringify(documentHits)}`
    ).toBe(true);

    // The document IS the new generation: atomic runtime tag, freshness guard,
    // and the hashed runtime actually fetched.
    const runtimeSrc = await loadedRuntimeSrc(page);
    expect(runtimeSrc).toMatch(/^\/game-suite\/mvh-audio-runtime\.[0-9a-f]{12}\.js$/);
    expect(await hasFreshnessGuard(page)).toBe(true);
    expect(relaunch.some((r) => /mvh-audio-runtime\.[0-9a-f]{12}\.js/.test(r.path))).toBe(true);

    // And the whole point: the real music element ducks in the relaunched game.
    await playIntoGame(page);
    await assertDucks(page);
  });

  test("a tab parked on the old Games page still launches the current generation", async ({ page }) => {
    await page.addInitScript(instrument);
    // Chrome from the OLD world sits idle while the deployment lands.
    await page.goto("/games");
    await control("/__control/mode/B");
    await control("/__control/clearlog");

    // The parked link is generation-free ("/play"): the server-side redirect is
    // what stamps the current generation, so stale chrome cannot pin the game.
    await page.locator("#launch").click();
    await page.waitForURL(/\/game\/runtime\/index\.html\?launch=/);
    expect(await loadedRuntimeSrc(page)).toMatch(/mvh-audio-runtime\.[0-9a-f]{12}\.js$/);
    await playIntoGame(page);
    await assertDucks(page);
  });

  test("a revived old document stays stale (the defect), a revived new document reloads itself (the fix)", async ({
    page
  }) => {
    // REPRODUCTION half: the OLD generation had no revival guard. A
    // back/forward-cache restore hands the learner this exact document, alive,
    // with its old audio modules -- and nothing reacts.
    await page.goto("/game/runtime/index.html");
    expect(await hasFreshnessGuard(page)).toBe(false);
    const staleNavigation = page
      .waitForNavigation({ timeout: 3_000 })
      .then(() => "navigated")
      .catch(() => "stayed");
    await page.evaluate(() => {
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    });
    expect(await staleNavigation, "the old generation ignores revival and keeps running stale code").toBe("stayed");

    // FIX half: the CURRENT document refuses revival -- one reload into the
    // no-store route, which serves the current generation. (The persisted flag
    // is dispatched synthetically: automation engines disable the real
    // back/forward cache, so the browser-internal trigger cannot fire here;
    // the handler and its wiring are what is under test.)
    await control("/__control/mode/B");
    await page.goto("/game/runtime/index.html");
    expect(await hasFreshnessGuard(page)).toBe(true);
    await control("/__control/clearlog");
    await Promise.all([
      page.waitForNavigation({ timeout: 15_000 }),
      page.evaluate(() => {
        window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
      })
    ]);
    const afterRevival = await requests();
    expect(
      afterRevival.filter((r) => r.path === "/game/runtime/index.html").length,
      "revival must become a real fetch of the current document"
    ).toBeGreaterThan(0);
    expect(await loadedRuntimeSrc(page)).toMatch(/mvh-audio-runtime\.[0-9a-f]{12}\.js$/);

    // A fresh load must NOT reload (persisted=false): no loop.
    const steady = page
      .waitForNavigation({ timeout: 3_000 })
      .then(() => "navigated")
      .catch(() => "stayed");
    await page.evaluate(() => {
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: false }));
    });
    expect(await steady, "a normal load must never trigger the revival reload").toBe("stayed");
  });

  test("the two generations have distinguishable launch URLs", async () => {
    const oldLocation = (await fetch(base() + "/play", { redirect: "manual" })).headers.get("location");
    await control("/__control/mode/B");
    const newLocation = (await fetch(base() + "/play", { redirect: "manual" })).headers.get("location");
    expect(oldLocation).toBe("/game/runtime/index.html");
    expect(newLocation).toMatch(/^\/game\/runtime\/index\.html\?launch=[0-9a-f]{7,40}$/);
    expect(newLocation).not.toBe(oldLocation);
  });
});
