import { expect, test, type Page } from "@playwright/test";

/**
 * Real-runtime speech ducking for Math Vocabulary Hunt.
 *
 * The previous module-only harness passed while production did not duck, so
 * everything here binds to things that cannot be faked:
 *
 *  - the document is the one the shipped enhancer produces, served at the real
 *    route path under the real route CSP;
 *  - every assertion reads the ACTUAL playing HTMLAudioElement's volume,
 *    captured by wrapping the media-element volume setter before any game
 *    script runs -- never a hook that recomputes the intended level.
 *
 * ANTI-VACUITY: each test must observe a real pronunciation start, a real
 * playing music element, a real change on that element, a real pronunciation
 * end and a real restore. If any of those is not observed the test fails
 * rather than passing on an assertion that was never exercised.
 */

const BASE = 0.5;
const DUCKED = 0.15;

interface VolumeWrite {
  t: number;
  v: number;
  src: string;
}

declare global {
  interface Window {
    __VOL__: VolumeWrite[];
    __EL__: HTMLAudioElement[];
    MathNexaVoice: { audioLevels(): { fallbackVolume: number | null; voiceGainValue: number | null } };
  }
}

const instrument = () => {
  const scope = window as unknown as { __VOL__: VolumeWrite[]; __EL__: HTMLAudioElement[]; Audio: typeof Audio };
  scope.__VOL__ = [];
  scope.__EL__ = [];
  const proto = HTMLMediaElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, "volume")!;
  Object.defineProperty(proto, "volume", {
    configurable: true,
    get(this: HTMLMediaElement) {
      return (descriptor.get as () => number).call(this);
    },
    set(this: HTMLMediaElement, value: number) {
      scope.__VOL__.push({
        t: Math.round(performance.now()),
        v: value,
        src: (this.currentSrc || (this as HTMLAudioElement).src || "").split("/").pop() ?? ""
      });
      (descriptor.set as (v: number) => void).call(this, value);
    }
  });
  const NativeAudio = scope.Audio;
  const Wrapped = function (this: unknown, src?: string) {
    const element = new NativeAudio(src);
    scope.__EL__.push(element);
    return element;
  } as unknown as typeof Audio;
  Wrapped.prototype = NativeAudio.prototype;
  scope.Audio = Wrapped;
};

/** The real background-music element: the one whose source is the shipped track. */
const musicElement = (page: Page) =>
  page.evaluateHandle(() => {
    const found = (window as unknown as { __EL__: HTMLAudioElement[] }).__EL__.find((element) =>
      (element.currentSrc || element.src || "").includes("cosmic-candy-catchers")
    );
    if (!found) throw new Error("no music element was ever constructed");
    return found;
  });

const liveMusic = async (page: Page) => {
  const handle = await musicElement(page);
  const snapshot = await handle.evaluate((element: HTMLAudioElement) => ({
    volume: element.volume,
    paused: element.paused,
    muted: element.muted,
    src: (element.currentSrc || element.src || "").split("/").pop() ?? ""
  }));
  await handle.dispose();
  return snapshot;
};

const voiceState = (page: Page) => page.evaluate(() => document.documentElement.getAttribute("data-voice-state"));
const writes = (page: Page) => page.evaluate(() => (window as unknown as { __VOL__: VolumeWrite[] }).__VOL__);
const clearWrites = (page: Page) => page.evaluate(() => { (window as unknown as { __VOL__: VolumeWrite[] }).__VOL__.length = 0; });

async function openGame(page: Page) {
  await page.addInitScript(instrument);
  await page.goto("/game/runtime/index.html");
  await page.locator('.grade-card[data-grade="6"]').click();
  const topic = page.locator(".topic-card:not(.incomplete)").first();
  await topic.locator("summary").click();
  await topic.locator(".choose-topic-button").click();
  await page.locator(".lesson-row").first().click();
  await expect(page.locator("#letterGrid .grid-cell").first()).toBeVisible();
  // A trusted gesture on the game screen: what a learner does before playing.
  await page.locator("#wordPanelTitle").click();

  // ANTI-VACUITY: there must be a real element, really playing, at the base level.
  await expect.poll(async () => (await liveMusic(page)).paused, { timeout: 25_000 }).toBe(false);
  const music = await liveMusic(page);
  expect(music.src, "the real background track must be the element under test").toContain("cosmic-candy-catchers");
  expect(music.muted).toBe(false);
  expect(music.volume).toBe(BASE);
}

/** Click a word and wait until the engine reports a genuinely started clip. */
async function speakWord(page: Page, index = 0) {
  await page.locator(".word-card").nth(index).click();
  await expect
    .poll(() => voiceState(page), { timeout: 25_000 })
    .toBe("started");
}

test.describe("math vocabulary hunt real-runtime ducking", () => {
  test("the real music element goes 0.50 -> 0.15 -> 0.50 across a spoken word", async ({ page }) => {
    await openGame(page);
    await clearWrites(page);

    await speakWord(page);

    // Ducked WHILE the clip is genuinely playing, read off the element itself.
    const speaking = await liveMusic(page);
    expect(speaking.paused, "music must still be playing while ducked").toBe(false);
    expect(speaking.volume, "music must duck while the word is spoken").toBe(DUCKED);

    await expect.poll(() => voiceState(page), { timeout: 30_000 }).toBe("ended");
    await expect.poll(async () => (await liveMusic(page)).volume, { timeout: 15_000 }).toBe(BASE);

    const restored = await liveMusic(page);
    expect(restored.paused, "music must still be playing after the restore").toBe(false);

    // The ordered timeline on the real element, not a recomputed level.
    const timeline = (await writes(page)).filter((write) => write.src.includes("cosmic-candy-catchers"));
    const duckAt = timeline.findIndex((write) => write.v === DUCKED);
    expect(duckAt, `no 0.15 write on the music element: ${JSON.stringify(timeline)}`).toBeGreaterThanOrEqual(0);
    expect(
      timeline.slice(duckAt + 1).some((write) => write.v === BASE),
      `no restore to 0.50 after the duck: ${JSON.stringify(timeline)}`
    ).toBe(true);
  });

  test("routine game activity during speech cannot overwrite the ducked level", async ({ page }) => {
    await openGame(page);
    await speakWord(page);
    expect((await liveMusic(page)).volume).toBe(DUCKED);

    // Everything that also writes the music volume, fired mid-pronunciation.
    await page.evaluate(() => {
      document.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      document.dispatchEvent(new Event("keydown", { bubbles: true }));
      window.dispatchEvent(new Event("resize"));
      window.dispatchEvent(new Event("focus"));
      (window as unknown as { startMusic(): void }).startMusic();
      (window as unknown as { duck(...args: number[]): void }).duck(1600, 0.15, 100, 500);
    });
    await page.waitForTimeout(120);

    expect((await liveMusic(page)).volume, "a competing writer restored the base level mid-speech").toBe(DUCKED);
    expect(await voiceState(page)).toBe("started");
  });

  test("rapid replacement holds the duck and restores exactly once", async ({ page }) => {
    await openGame(page);
    const cards = page.locator(".word-card");
    expect(await cards.count()).toBeGreaterThan(2);
    await clearWrites(page);

    await speakWord(page, 0);
    await cards.nth(1).click();
    await page.waitForTimeout(120);
    await cards.nth(2).click();
    await expect.poll(() => voiceState(page), { timeout: 25_000 }).toBe("started");

    const timelineWhileSpeaking = (await writes(page)).filter((w) => w.src.includes("cosmic-candy-catchers"));
    const firstDuck = timelineWhileSpeaking.findIndex((w) => w.v === DUCKED);
    expect(firstDuck, "never ducked during rapid replacement").toBeGreaterThanOrEqual(0);
    expect(
      timelineWhileSpeaking.slice(firstDuck).every((w) => w.v === DUCKED),
      `music bounced back to base between words: ${JSON.stringify(timelineWhileSpeaking)}`
    ).toBe(true);
    expect((await liveMusic(page)).volume).toBe(DUCKED);

    await expect.poll(() => voiceState(page), { timeout: 30_000 }).toBe("ended");
    await expect.poll(async () => (await liveMusic(page)).volume, { timeout: 15_000 }).toBe(BASE);

    const full = (await writes(page)).filter((w) => w.src.includes("cosmic-candy-catchers"));
    const restores = full.slice(firstDuck).filter((w) => w.v === BASE);
    expect(restores.length, `restored more than once: ${JSON.stringify(full)}`).toBe(1);
  });

  test("music switched off during speech stays off, and the word still speaks", async ({ page }) => {
    await openGame(page);
    await speakWord(page);
    expect((await liveMusic(page)).volume).toBe(DUCKED);

    // Low -> medium -> off on the canonical control.
    await page.locator("#musicButton").click();
    await page.locator("#musicButton").click();
    await expect.poll(async () => (await liveMusic(page)).paused, { timeout: 15_000 }).toBe(true);

    // Hold the invariant continuously rather than sampling one instant: on a
    // slower engine the clip can finish while the two clicks land, and the
    // contract under test is "off stays off", not "off happened at time T".
    const deadline = Date.now() + 30_000;
    let sawSpeechFinish = false;
    while (Date.now() < deadline) {
      expect((await liveMusic(page)).paused, "music restarted while switched off").toBe(true);
      if ((await voiceState(page)) === "ended") {
        sawSpeechFinish = true;
        break;
      }
    }
    // ANTI-VACUITY: the loop must have watched a real pronunciation finish.
    expect(sawSpeechFinish, "the pronunciation never reached a finished state").toBe(true);

    // Speech ending must not switch music back on against the learner's choice.
    await page.waitForTimeout(400);
    expect((await liveMusic(page)).paused, "speech ending restarted music the learner turned off").toBe(true);
    expect(await page.evaluate(() => document.documentElement.getAttribute("data-last-spoken-term"))).toBeTruthy();
  });

  test("music switched on during speech enters ducked, then restores to base", async ({ page }) => {
    await openGame(page);

    // Turn music off first (low -> medium -> off).
    await page.locator("#musicButton").click();
    await page.locator("#musicButton").click();
    await expect.poll(async () => (await liveMusic(page)).paused, { timeout: 15_000 }).toBe(true);

    await speakWord(page);
    // Off -> low while the word is still speaking.
    await page.locator("#musicButton").click();
    await expect.poll(async () => (await liveMusic(page)).paused, { timeout: 15_000 }).toBe(false);
    expect((await liveMusic(page)).volume, "music rejoined at full level during speech").toBe(DUCKED);

    await expect.poll(() => voiceState(page), { timeout: 30_000 }).toBe("ended");
    await expect.poll(async () => (await liveMusic(page)).volume, { timeout: 15_000 }).toBe(BASE);
  });

  test("the HTMLAudio pronunciation fallback ducks too", async ({ page }) => {
    // Environments without Web Audio play clips through a shared audio element
    // instead. That path must report speech activity like any other, or a
    // learner on such a build hears a background that never drops.
    await page.addInitScript(() => {
      delete (window as unknown as { AudioContext?: unknown }).AudioContext;
      delete (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext;
    });
    await openGame(page);
    expect(
      await page.evaluate(() => window.MathNexaVoice.audioLevels().fallbackVolume),
      "this test must really be on the HTMLAudio path"
    ).toBe(1);

    await speakWord(page);
    expect((await liveMusic(page)).volume, "the fallback path bypassed ducking").toBe(DUCKED);

    await expect.poll(() => voiceState(page), { timeout: 30_000 }).toBe("ended");
    await expect.poll(async () => (await liveMusic(page)).volume, { timeout: 15_000 }).toBe(BASE);
  });

  test("ducking survives a voice engine that predates the activity broadcast", async ({ page }) => {
    // The exact production failure: an older cached natural-voice.js exposes no
    // onSpeechActivity and dispatches no event. The music module must still duck
    // from the data-voice-state attribute every build of the engine writes.
    await page.addInitScript(() => {
      const strip = () => {
        const voice = (window as unknown as { MathNexaVoice?: Record<string, unknown> }).MathNexaVoice;
        if (!voice) return false;
        delete voice.onSpeechActivity;
        delete voice.isSpeaking;
        return true;
      };
      if (!strip()) document.addEventListener("readystatechange", strip, true);
      window.addEventListener("mathnexa:voice-activity", (event) => event.stopImmediatePropagation(), true);
    });
    await openGame(page);
    await speakWord(page);

    expect(
      await page.evaluate(() => typeof (window as unknown as { MathNexaVoice?: { onSpeechActivity?: unknown } }).MathNexaVoice?.onSpeechActivity),
      "the degraded engine must really be missing the callback API"
    ).toBe("undefined");
    expect((await liveMusic(page)).volume, "ducking did not survive the degraded voice engine").toBe(DUCKED);

    await expect.poll(() => voiceState(page), { timeout: 30_000 }).toBe("ended");
    await expect.poll(async () => (await liveMusic(page)).volume, { timeout: 15_000 }).toBe(BASE);
  });
});
