import { expect, test, type Page } from "@playwright/test";

/**
 * Math Vocabulary Hunt audio balance, proven in real browsers.
 *
 * Contract: background music 0.50, vocabulary pronunciation 1.00, independent
 * channels. Everything here runs against the real enhanced game document under
 * the production /game/runtime CSP, with no autoplay-policy overrides — if a
 * browser would block a learner's audio, it blocks it here too.
 */

const MUSIC_LEVEL = 0.5;
const VOICE_LEVEL = 1;

interface MusicSnapshot {
  paused: boolean;
  loop: boolean;
  error: string | null;
  volume: number;
  level: number;
  mode: string;
}

interface VoiceLevels {
  voiceChannelLevel: number;
  voiceGainValue: number | null;
  fallbackVolume: number | null;
  sharesMusicChannel: boolean;
}

const musicSnapshot = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __MATHNEXA_GAME_MUSIC__: { snapshot(): MusicSnapshot } }).__MATHNEXA_GAME_MUSIC__.snapshot() as MusicSnapshot
  );

const voiceLevels = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { MathNexaVoice: { audioLevels(): VoiceLevels } }).MathNexaVoice.audioLevels() as VoiceLevels
  );

const voiceState = (page: Page) => page.evaluate(() => document.documentElement.getAttribute("data-voice-state"));

async function openGame(page: Page) {
  await page.goto("/");
  await page.locator('.grade-card[data-grade="6"]').click();
  await expect(page.locator("#topicScreen")).toBeVisible();
  const topic = page.locator(".topic-card:not(.incomplete)").first();
  await topic.locator("summary").click();
  await topic.locator(".choose-topic-button").click();
  await expect(page.locator("#lessonScreen")).toBeVisible();
  await page.locator(".lesson-row").first().click();
  await expect(page.locator("#gameScreen")).toBeVisible();
  await expect(page.locator("#letterGrid .grid-cell").first()).toBeVisible();
  // A trusted gesture on the game screen is what the browser requires before
  // the looping track may start. This is the same gesture a learner makes.
  await page.locator("#wordPanelTitle").click();
  await expect
    .poll(async () => (await musicSnapshot(page)).paused, { timeout: 20_000 })
    .toBe(false);
}

test.describe("math vocabulary hunt audio balance", () => {
  test("background music plays at 50 percent and pronunciation at 100 percent", async ({ page }) => {
    const violations: string[] = [];
    await page.addInitScript(() => {
      document.addEventListener("securitypolicyviolation", (event) => {
        (window as unknown as { __CSP__: string[] }).__CSP__ ??= [];
        (window as unknown as { __CSP__: string[] }).__CSP__.push(
          `${(event as SecurityPolicyViolationEvent).violatedDirective}:${(event as SecurityPolicyViolationEvent).blockedURI}`
        );
      });
    });

    await openGame(page);

    const music = await musicSnapshot(page);
    expect(music.mode).toBe("low");
    expect(music.level).toBe(MUSIC_LEVEL);
    expect(music.volume).toBe(MUSIC_LEVEL);
    expect(music.loop).toBe(true);
    expect(music.error).toBeNull();

    // Selecting a word speaks it. The engine reports honest states, so
    // "started" means the clip genuinely began in this browser's audio stack.
    const firstWord = page.locator(".word-card").first();
    // The card is labelled "Term 1: Decimal"; the engine speaks the display
    // name alone, so the spoken term must appear inside the card's label.
    const cardLabel = ((await firstWord.textContent()) ?? "").trim();
    await firstWord.click();
    await expect.poll(() => voiceState(page), { timeout: 20_000 }).not.toBe("requested");
    expect(await voiceState(page)).not.toBe("blocked");
    expect(["started", "ended"]).toContain(await voiceState(page));
    const spoken = await page.evaluate(() => document.documentElement.getAttribute("data-last-spoken-term"));
    expect(spoken, "a term was actually spoken").toBeTruthy();
    expect(cardLabel).toContain(spoken!);

    const levels = await voiceLevels(page);
    expect(levels.voiceChannelLevel).toBe(VOICE_LEVEL);
    expect(levels.sharesMusicChannel).toBe(false);
    // Whichever path this browser took, the level it took it at is unity.
    expect(levels.voiceGainValue ?? levels.fallbackVolume).toBe(VOICE_LEVEL);
    expect(levels.voiceGainValue ?? levels.fallbackVolume).not.toBe(MUSIC_LEVEL);

    // The music channel is ducked while the term speaks, then returns to the
    // authoritative level. The voice channel is never touched by the duck.
    expect((await musicSnapshot(page)).level).toBe(MUSIC_LEVEL);
    await expect.poll(async () => (await musicSnapshot(page)).volume, { timeout: 20_000 }).toBe(MUSIC_LEVEL);
    expect((await voiceLevels(page)).voiceGainValue ?? (await voiceLevels(page)).fallbackVolume).toBe(VOICE_LEVEL);

    expect(await page.evaluate(() => (window as unknown as { __CSP__?: string[] }).__CSP__ ?? [])).toEqual([]);
  });

  test("the music button moves music only and never silences pronunciation", async ({ page }) => {
    await openGame(page);
    expect((await musicSnapshot(page)).volume).toBe(MUSIC_LEVEL);

    // low -> medium
    await page.locator("#musicButton").click();
    expect((await musicSnapshot(page)).mode).toBe("medium");
    expect((await musicSnapshot(page)).paused).toBe(false);

    // medium -> off
    await page.locator("#musicButton").click();
    await expect.poll(async () => (await musicSnapshot(page)).paused, { timeout: 10_000 }).toBe(true);
    expect((await musicSnapshot(page)).level).toBe(0);

    // With music off, a selected word still speaks at full level.
    await page.locator(".word-card").nth(1).click();
    await expect.poll(() => voiceState(page), { timeout: 20_000 }).not.toBe("requested");
    expect(["started", "ended"]).toContain(await voiceState(page));
    const levels = await voiceLevels(page);
    expect(levels.voiceGainValue ?? levels.fallbackVolume).toBe(VOICE_LEVEL);
    expect((await musicSnapshot(page)).paused).toBe(true);

    // off -> low restores the normal background level, not full volume.
    await page.locator("#musicButton").click();
    await expect.poll(async () => (await musicSnapshot(page)).paused, { timeout: 10_000 }).toBe(false);
    await expect.poll(async () => (await musicSnapshot(page)).volume, { timeout: 20_000 }).toBe(MUSIC_LEVEL);
    expect((await musicSnapshot(page)).mode).toBe("low");
  });

  test("rapid word selection never stacks voices and never disturbs either level", async ({ page }) => {
    await openGame(page);
    const cards = page.locator(".word-card");
    const count = Math.min(await cards.count(), 3);
    expect(count).toBeGreaterThan(1);

    for (let index = 0; index < count; index += 1) {
      await cards.nth(index).click({ delay: 0 });
    }
    await expect.poll(() => voiceState(page), { timeout: 20_000 }).not.toBe("requested");
    expect(await voiceState(page)).not.toBe("error");

    const levels = await voiceLevels(page);
    expect(levels.voiceGainValue ?? levels.fallbackVolume).toBe(VOICE_LEVEL);
    expect((await musicSnapshot(page)).level).toBe(MUSIC_LEVEL);
    await expect.poll(async () => (await musicSnapshot(page)).volume, { timeout: 20_000 }).toBe(MUSIC_LEVEL);

    // Repeated selection of the same word keeps working at the same level.
    await cards.first().click();
    await expect.poll(() => voiceState(page), { timeout: 20_000 }).not.toBe("requested");
    expect((await voiceLevels(page)).voiceGainValue ?? (await voiceLevels(page)).fallbackVolume).toBe(VOICE_LEVEL);
    expect((await musicSnapshot(page)).error).toBeNull();
  });

  test("leaving the game tears the music down without orphaning a second loop", async ({ page }) => {
    await openGame(page);
    expect((await musicSnapshot(page)).paused).toBe(false);
    await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
    await expect.poll(async () => (await musicSnapshot(page)).paused, { timeout: 10_000 }).toBe(true);
  });
});
