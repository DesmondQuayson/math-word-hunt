import { expect, test, type Page } from "@playwright/test";

/**
 * Returning-browser certification for the version-atomic audio runtime.
 *
 * The production failure: a browser (or school proxy) kept an old standalone
 * audio module under its stable name and never revalidated it, so the real
 * game ran a mismatched pair and ducking silently died — while every server
 * served correct bytes. These tests prove the new delivery removes that class:
 * a browser that loaded the ENTIRE legacy world, with those files pinned for a
 * year, picks up the new atomic runtime on its next visit with NO cache
 * clearing, and ducking works.
 */

const BASE = 0.5;
const DUCKED = 0.15;

const base = () => process.env.MVH_ATOMIC_URL ?? "http://127.0.0.1:4198";
const control = async (path: string) => {
  const response = await fetch(base() + path);
  return response.text();
};
const requests = async () => JSON.parse(await control("/__control/log")) as { mode: string; path: string }[];

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

async function playIntoGame(page: Page) {
  await page.locator('.grade-card[data-grade="6"]').click();
  const topic = page.locator(".topic-card:not(.incomplete)").first();
  await topic.locator("summary").click();
  await topic.locator(".choose-topic-button").click();
  await page.locator(".lesson-row").first().click();
  await expect(page.locator("#letterGrid .grid-cell").first()).toBeVisible();
  await page.locator("#wordPanelTitle").click();
}

test.describe("version-atomic audio delivery", () => {
  test.beforeEach(async () => {
    await control("/__control/mode/A");
    await control("/__control/clearlog");
  });

  test("a returning browser full of pinned legacy assets loads the new runtime and ducks — no cache clearing", async ({
    page
  }) => {
    // ---- Visit 1: the legacy world (old enhancer, old standalone modules,
    //      pinned for a year so the browser will not revalidate them).
    await page.addInitScript(instrument);
    await page.goto("/game/runtime/index.html");
    const legacyRequests = await requests();
    expect(
      legacyRequests.filter((r) => r.path === "/game-suite/natural-voice.js" && r.mode === "A").length,
      "the legacy visit must really fetch the standalone voice module"
    ).toBeGreaterThan(0);
    expect(
      legacyRequests.filter((r) => r.path === "/game-suite/math-vocabulary-music.js" && r.mode === "A").length
    ).toBeGreaterThan(0);

    // ---- "Redeploy": same origin flips to the atomic architecture.
    await control("/__control/mode/B");
    await control("/__control/clearlog");

    // ---- Visit 2: SAME browser context, cache intact. No clearing, no
    //      hard refresh, no incognito — a plain navigation.
    await page.goto("/game/runtime/index.html");

    const afterRedeploy = await requests();
    const runtimeFetches = afterRedeploy.filter((r) => /\/game-suite\/mvh-audio-runtime\.[0-9a-f]{12}\.js/.test(r.path));
    expect(runtimeFetches.length, "NEW RUNTIME FETCHED must be YES").toBeGreaterThan(0);

    const legacyScriptTags = await page.evaluate(
      () => document.querySelectorAll('script[src*="natural-voice.js"], script[src*="math-vocabulary-music.js"]').length
    );
    expect(legacyScriptTags, "the new document must not reference the legacy modules").toBe(0);
    const runtimeScriptTags = await page.evaluate(
      () => document.querySelectorAll('script[data-mathnexa-game-suite="audio-runtime"]').length
    );
    expect(runtimeScriptTags, "ACTIVE_MVH_AUDIO_RUNTIME_COUNT").toBe(1);

    // ---- And the whole point: ducking works, on the actual playing element.
    await playIntoGame(page);
    await expect.poll(async () => (await musicVolume(page))?.paused, { timeout: 25_000 }).toBe(false);
    expect((await musicVolume(page))?.volume).toBe(BASE);
    await page.locator(".word-card").first().click();
    await expect.poll(() => voiceState(page), { timeout: 25_000 }).toBe("started");
    expect((await musicVolume(page))?.volume, "DUCKING must be PASS in the returning browser").toBe(DUCKED);
    await expect.poll(() => voiceState(page), { timeout: 30_000 }).toBe("ended");
    await expect.poll(async () => (await musicVolume(page))?.volume, { timeout: 15_000 }).toBe(BASE);

    // OLD CACHED ASSETS PRESENT = YES: re-request the legacy module the way it
    // was originally loaded (script destination, same cache key). The pinned
    // copy answers from the browser cache with no network hit — proving the
    // stale generation is still sitting there, and the new document simply
    // never asks for it. (Safe to execute: the voice engine's first line
    // returns when window.MathNexaVoice already exists.)
    await control("/__control/clearlog");
    const probeLoaded = await page.evaluate(
      () =>
        new Promise((done) => {
          const probe = document.createElement("script");
          probe.src = "/game-suite/natural-voice.js";
          probe.onload = () => done("loaded");
          probe.onerror = () => done("error");
          document.head.append(probe);
        })
    );
    expect(probeLoaded).toBe("loaded");
    const probeHits = (await requests()).filter((r) => r.path === "/game-suite/natural-voice.js");
    expect(probeHits.length, "the year-pinned legacy asset must answer from cache, not the network").toBe(0);
  });

  test("a fresh browser on the new architecture fetches one runtime and ducks", async ({ page }) => {
    await control("/__control/mode/B");
    await control("/__control/clearlog");
    await page.addInitScript(instrument);
    await page.goto("/game/runtime/index.html");

    const log = await requests();
    expect(log.filter((r) => /mvh-audio-runtime\.[0-9a-f]{12}\.js/.test(r.path)).length).toBeGreaterThan(0);
    expect(log.filter((r) => r.path === "/game-suite/natural-voice.js").length).toBe(0);
    expect(log.filter((r) => r.path === "/game-suite/math-vocabulary-music.js").length).toBe(0);

    await playIntoGame(page);
    await expect.poll(async () => (await musicVolume(page))?.paused, { timeout: 25_000 }).toBe(false);
    await page.locator(".word-card").first().click();
    await expect.poll(() => voiceState(page), { timeout: 25_000 }).toBe("started");
    expect((await musicVolume(page))?.volume).toBe(DUCKED);
    await expect.poll(() => voiceState(page), { timeout: 30_000 }).toBe("ended");
    await expect.poll(async () => (await musicVolume(page))?.volume, { timeout: 15_000 }).toBe(BASE);
  });

  test("the two generations are distinguishable resources — an old URL can never masquerade as the new build", async ({
    page
  }) => {
    await control("/__control/mode/B");
    await page.goto("/game/runtime/index.html");
    const runtimeUrl = await page.evaluate(
      () => document.querySelector('script[data-mathnexa-game-suite="audio-runtime"]')?.getAttribute("src") ?? ""
    );
    expect(runtimeUrl).toMatch(/^\/game-suite\/mvh-audio-runtime\.[0-9a-f]{12}\.js$/);

    // The current URL serves the current generation...
    const current = await page.evaluate(async (url) => (await fetch(url)).text(), runtimeUrl);
    expect(current).toContain("mathnexa:voice-activity");
    expect(current).toContain("DUCKED_MUSIC_LEVEL = .15");

    // ...and a request for any OTHER hash cannot be satisfied by it.
    const bogus = runtimeUrl.replace(/[0-9a-f]{12}/, "000000000000");
    const bogusStatus = await page.evaluate(async (url) => (await fetch(url)).status, bogus);
    expect(bogusStatus, "a different generation is a different resource, never a silent alias").toBe(404);
  });
});
