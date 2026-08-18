import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

const url = process.env.SUPABASE_TEST_URL ?? "";
const secretKey = process.env.SUPABASE_TEST_SECRET_KEY ?? "";
const axeSource = readFileSync(resolve("node_modules/axe-core/axe.min.js"), "utf8");
const run = `number-logic-native-${Date.now()}`;
const password = "SyntheticAdult42!";
const ownerEmail = `${run}-owner@example.test`;
const subscriberEmail = `${run}-subscriber@example.test`;
let admin: SupabaseClient;
let owner: User;
let subscriber: User;
let ownerAdminId = "";

const modes = [
  { name: "Lines of 3", positions: "T|ML|MC|MR|BL|BC|BR", moves: 4, completion: "lines-completion", tray: "in tray", hint: "Place" },
  { name: "U Sums", positions: "TL|ML|BL|BC|BR|MR|TR", moves: 4, completion: "u-sums-completion", tray: "available in tray", hint: "Every remaining solution places" },
  { name: "Magic H", positions: "TL|TR|ML|C|MR|BL|BR", moves: 4, completion: "magic-h-completion", tray: "available in tray", hint: "Every remaining solution places" },
  { name: "Equal Sums", positions: "T|IL|IR|BL|BR", moves: 3, completion: "equal-sums-completion", tray: "available in tray", hint: "Every remaining solution places" },
  { name: "Square Sums", positions: "[A-I]", moves: 4, completion: "square-sums-completion", tray: "available in tray", hint: "Every remaining solution places" },
  { name: "Product Square", positions: "[A-I]", moves: 5, completion: "product-square-completion", tray: "available in tray", hint: "Every remaining solution places" }
] as const;

function base32(value: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of value.replaceAll("=", "").toUpperCase()) bits += alphabet.indexOf(character).toString(2).padStart(5, "0");
  const bytes = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  return Buffer.from(bytes);
}

function totp(secret: string): string {
  const payload = Buffer.alloc(8);
  payload.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac("sha1", base32(secret)).update(payload).digest();
  const offset = digest.at(-1)! & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

async function stableTotp(secret: string): Promise<string> {
  const remaining = 30_000 - (Date.now() % 30_000);
  if (remaining < 20_000) await new Promise((done) => setTimeout(done, remaining + 100));
  return totp(secret);
}

async function signIn(page: Page, email: string, destination: string) {
  await page.goto(`/sign-in?next=${destination}`);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

type PublishedAudioProbe = Readonly<{
  contexts: number;
  resumes: ReadonlyArray<Readonly<{ active: boolean; state: string }>>;
  decodes: number;
  musicStarts: number;
  musicStops: number;
  effectStarts: number;
  eligibleResumeRejections: number;
}>;

type NumberLogicMusicSnapshot = Readonly<{
  paused: boolean;
  loop: boolean;
  currentTime: number;
  activeSources: number;
  mediaElements: number;
  playAttempts: number;
  playPending: boolean;
  hasSource: boolean;
  muted: boolean;
  volume: number;
  blocked: boolean;
  fatal: boolean;
  error: string | null;
  disposed: boolean;
}>;

async function readNumberLogicMusic(page: Page) {
  return page.evaluate(() => {
    const hook = (window as typeof window & {
      __MATHNEXA_NUMBER_LOGIC_MUSIC__: { source: string; snapshot: () => NumberLogicMusicSnapshot };
    }).__MATHNEXA_NUMBER_LOGIC_MUSIC__;
    return { source: hook.source, frozen: Object.isFrozen(hook), snapshotFrozen: Object.isFrozen(hook.snapshot()), ...hook.snapshot() };
  });
}

async function expectNoTutorialAxeViolations(page: Page) {
  await page.evaluate(axeSource);
  const result = await page.evaluate(async () => {
    const tutorial = document.querySelector(".nl-tutorial-shell");
    if (!tutorial) throw new Error("The visible Number Logic tutorial was not found for Axe.");
    return (window as typeof window & {
      axe: { run: (context: Element, options: unknown) => Promise<{ violations: unknown[] }> };
    }).axe.run(tutorial, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] }
    });
  });
  expect(result.violations).toEqual([]);
}

async function installStrictPublishedAudioPolicy(page: Page) {
  await page.addInitScript(() => {
    const host = window as typeof window & { __numberLogicPublishedAudioProbe?: {
      contexts: number;
      resumes: Array<{ active: boolean; state: string }>;
      decodes: number;
      musicStarts: number;
      musicStops: number;
      effectStarts: number;
      eligibleResumeRejections: number;
    } };
    const rejectionKey = "__mathnexa_number_logic_eligible_resume_rejected__";
    const probe = host.__numberLogicPublishedAudioProbe = {
      contexts: 0, resumes: [], decodes: 0, musicStarts: 0, musicStops: 0, effectStarts: 0, eligibleResumeRejections: 0,
    };
    class StrictAudioContext {
      state: AudioContextState = "suspended";
      currentTime = 0;
      destination = {};
      constructor() { probe.contexts += 1; }
      createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
      createBufferSource() {
        return {
          buffer: null, loop: false, loopStart: 0, loopEnd: 0,
          connect() {}, disconnect() {},
          start() { probe.musicStarts += 1; }, stop() { probe.musicStops += 1; },
        };
      }
      createOscillator() {
        let ended: (() => void) | null = null;
        return {
          type: "sine", frequency: { setValueAtTime() {}, linearRampToValueAtTime() {} },
          connect() {}, disconnect() {},
          addEventListener(_name: string, listener: () => void) { ended = listener; },
          start() { probe.effectStarts += 1; }, stop() { ended?.(); },
        };
      }
      decodeAudioData() {
        probe.decodes += 1;
        const samples = new Float32Array(1_000);
        return Promise.resolve({ sampleRate: 1_000, length: samples.length, duration: 1, numberOfChannels: 1, getChannelData: () => samples });
      }
      resume() {
        const active = navigator.userActivation?.isActive === true;
        probe.resumes.push({ active, state: this.state });
        if (!active) return Promise.reject(new DOMException("User activation required", "NotAllowedError"));
        if (sessionStorage.getItem(rejectionKey) !== "true") {
          sessionStorage.setItem(rejectionKey, "true");
          probe.eligibleResumeRejections += 1;
          return Promise.reject(new DOMException("Synthetic first-gesture rejection", "NotAllowedError"));
        }
        this.state = "running";
        return Promise.resolve();
      }
      close() { this.state = "closed"; return Promise.resolve(); }
    }
    Object.defineProperty(window, "AudioContext", { configurable: true, value: StrictAudioContext });
    Object.defineProperty(window, "webkitAudioContext", { configurable: true, value: StrictAudioContext });
  });
}

async function readPublishedAudioProbe(page: Page): Promise<PublishedAudioProbe> {
  return page.evaluate(() => (window as typeof window & { __numberLogicPublishedAudioProbe: PublishedAudioProbe }).__numberLogicPublishedAudioProbe);
}

async function completeMode(page: Page, mode: (typeof modes)[number], modeIndex: number) {
  await page.getByRole("button", { name: new RegExp(mode.name, "i") }).click();
  await expect(page.locator("[data-audio-manager-count='1'] [data-music-sources='1']")).toBeVisible();
  const skipTutorial = page.getByRole("button", { name: /skip tutorial/i });
  const playBeginner = page.getByRole("button", { name: /play beginner/i });
  await expect(skipTutorial.or(playBeginner)).toBeVisible();
  if (await skipTutorial.isVisible()) await skipTutorial.click();
  await playBeginner.click();
  const game = page.locator("main[data-puzzle-id]");
  await expect(game).toBeVisible();
  expect(await game.getAttribute("data-puzzle-id")).toBeTruthy();

  const firstTile = page.getByRole("button", { name: new RegExp(mode.tray, "i") }).first();
  const firstEmpty = page.locator("[data-position-id]").filter({ has: page.locator("small") }).first();
  await firstTile.dispatchEvent("pointerdown", { pointerId: 20 + modeIndex, pointerType: "touch", isPrimary: true });
  await firstEmpty.dispatchEvent("pointerup", { pointerId: 20 + modeIndex, pointerType: "touch", isPrimary: true });
  await expect(page.getByRole("button", { name: /undo/i })).toBeEnabled();
  await page.getByRole("button", { name: /undo/i }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: /restart/i }).click();
  await expect(page.locator("[data-feasibility]").first()).toBeVisible();

  await page.getByRole("button", { name: "Classroom Mode" }).click();
  await expect(page.locator("[data-classroom='true']")).toBeVisible();
  await page.getByRole("button", { name: "Exit Classroom Mode" }).click();

  for (let move = 0; move < mode.moves; move += 1) {
    for (let level = 1; level <= 4; level += 1) {
      const hintButton = page.getByRole("button", { name: new RegExp(`show hint ${level}`, "i") });
      if ((move + level + modeIndex) % 2 === 0) {
        await hintButton.focus();
        await page.keyboard.press("Enter");
      } else {
        await hintButton.click();
      }
    }
    const panel = page.locator("section").filter({ hasText: /proof-backed hints/i });
    const messagePattern = new RegExp(`${mode.hint} \\d+ at (${mode.positions})\\.`, "i");
    const message = await panel.getByText(messagePattern).textContent();
    const match = message?.match(new RegExp(`(?:Place|places) (\\d+) at (${mode.positions})`, "i"));
    if (!match) throw new Error(`Could not parse ${mode.name} proof hint: ${message}`);
    const tile = page.getByRole("button", { name: new RegExp(`^Number ${match[1]}, ${mode.tray}$`, "i") });
    const position = page.locator(`[data-position-id="${match[2]}"]`);
    if (move === 0) {
      await tile.dispatchEvent("pointerdown", { pointerId: 70 + modeIndex, pointerType: "touch", isPrimary: true });
      await position.dispatchEvent("pointerup", { pointerId: 70 + modeIndex, pointerType: "touch", isPrimary: true });
    } else if (move % 2 === 0) {
      await tile.focus();
      await page.keyboard.press("Enter");
      await position.focus();
      await page.keyboard.press("Enter");
    } else {
      await tile.click();
      await position.click();
    }
  }

  await expect(page.getByTestId(mode.completion)).toBeVisible();
  await expect(page.getByText(new RegExp(`${mode.name} Reasoning Index`, "i"))).toBeVisible();
  await expect(page.locator("[data-music-sources='1']")).toBeVisible();
  await page.getByRole("button", { name: "Return home" }).click();
  await expect(page.locator("[data-music-sources='1']")).toBeVisible();
}

test.beforeAll(async () => {
  expect(url).toMatch(/^http:\/\/127\.0\.0\.1:/);
  admin = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const ownerResult = await admin.auth.admin.createUser({ email: ownerEmail, password, email_confirm: true });
  const subscriberResult = await admin.auth.admin.createUser({ email: subscriberEmail, password, email_confirm: true });
  if (!ownerResult.data.user || ownerResult.error) throw ownerResult.error ?? new Error("Owner fixture unavailable.");
  if (!subscriberResult.data.user || subscriberResult.error) throw subscriberResult.error ?? new Error("Subscriber fixture unavailable.");
  owner = ownerResult.data.user;
  subscriber = subscriberResult.data.user;
  const ownerRow = await admin.from("admin_users").insert({ user_id: owner.id, role: "owner", mfa_enrolled: false }).select("id").single();
  if (ownerRow.error) throw ownerRow.error;
  ownerAdminId = ownerRow.data.id;
  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + 24 * 60 * 60 * 1000);
  const account = await admin.from("consumer_accounts").update({ trial_redeemed_at: startsAt.toISOString() }).eq("user_id", subscriber.id);
  if (account.error) throw account.error;
  const entitlement = await admin.from("consumer_game_entitlements").insert({
    user_id: subscriber.id,
    entitlement_state: "trial-active",
    trial_started_at: startsAt.toISOString(),
    trial_ends_at: endsAt.toISOString()
  });
  if (entitlement.error) throw entitlement.error;
});

test("Draft Admin Preview completes all six modes and preserves native lifecycle contracts", async ({ page, context }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on("console", (message) => { if (message.type() === "error" && !message.text().includes("Autoplay")) consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => failedRequests.push(new URL(request.url()).pathname));
  await page.addInitScript(() => {
    const host = window as typeof window & {
      __numberLogicAdminMediaProbe?: { calls: number; eligibleRejections: number };
    };
    const probe = host.__numberLogicAdminMediaProbe = { calls: 0, eligibleRejections: 0 };
    const nativePlay = HTMLMediaElement.prototype.play;
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: function (this: HTMLMediaElement) {
        probe.calls += 1;
        if (probe.eligibleRejections === 0) {
          probe.eligibleRejections += 1;
          return Promise.reject(new DOMException("Synthetic first-gesture rejection", "NotAllowedError"));
        }
        return nativePlay.call(this);
      }
    });
  });

  await page.goto("/admin/sign-in");
  await page.getByLabel("Owner email address").fill(ownerEmail);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Continue securely" }).click();
  await page.getByRole("button", { name: "Set up authenticator" }).click();
  const mfaSecret = (await page.locator("code.admin-setup-secret").textContent())?.trim() ?? "";
  await page.getByLabel("Six-digit authenticator code").fill(await stableTotp(mfaSecret));
  await page.getByRole("button", { name: "Verify and open admin" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto("/admin?section=games");
  const card = page.locator("article").filter({ has: page.getByRole("heading", { name: "Number Logic", exact: true }) });
  await expect(card).toContainText("internal");
  await expect(card).toContainText("draft");
  const previewHref = await card.getByRole("link", { name: "Preview" }).getAttribute("href");
  expect(previewHref).toMatch(/^\/admin\/games\/catalog\/[0-9a-f-]{36}\/preview$/);

  await page.evaluate(() => {
    localStorage.setItem("mathnexa:number-logic:v1:app", "{malformed");
    localStorage.setItem("mathnexa:number-logic-progress:1", JSON.stringify({ schemaVersion: "stale", records: new Array(1000).fill({}) }));
    localStorage.setItem("mathnexa:number-logic-audio:1", JSON.stringify({
      version: "number-logic-audio/1",
      masterMuted: false,
      musicEnabled: true,
      musicVolume: 0.42,
      soundEffectsEnabled: true,
      soundEffectsVolume: 0.61
    }));
  });
  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  await page.goto(previewHref!);
  await expect(page.getByRole("heading", { name: "Number Logic", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to MathNexa Games" })).toHaveAttribute("href", "/games");
  expect(new URL(page.url()).origin).toBe("http://127.0.0.1:3000");
  for (const mode of modes) await expect(page.getByRole("button", { name: new RegExp(mode.name, "i") })).toBeVisible();
  const previewRoot = page.locator("[data-audio-manager-count='1']");
  await expect(previewRoot).toBeVisible();

  // The first ordinary pointer is denied once by the synthetic browser policy.
  // A second ordinary pointer retries exactly once; the mode flow then runs
  // against a coherent, advancing single-source media backend.
  await page.getByRole("button", { name: /settings/i }).click();
  await expect(previewRoot.locator("[data-music-sources='0']")).toBeVisible();
  await expect.poll(() => readNumberLogicMusic(page)).toMatchObject({
    activeSources: 0,
    mediaElements: 1,
    playAttempts: 1,
    blocked: true,
    fatal: false,
  });
  expect(await page.evaluate(() => (window as typeof window & {
    __numberLogicAdminMediaProbe: { calls: number; eligibleRejections: number };
  }).__numberLogicAdminMediaProbe)).toEqual({ calls: 1, eligibleRejections: 1 });
  await page.getByRole("button", { name: /close settings/i }).click();
  await expect(previewRoot.locator("[data-music-sources='1']")).toBeVisible();
  await expect.poll(() => readNumberLogicMusic(page)).toMatchObject({
    activeSources: 1,
    mediaElements: 1,
    playAttempts: 2,
    blocked: false,
    fatal: false,
    error: null,
  });
  await expect.poll(async () => (await readNumberLogicMusic(page)).currentTime).toBeGreaterThan(0.05);

  for (const [index, mode] of modes.entries()) await completeMode(page, mode, index);
  await page.getByRole("button", { name: /settings/i }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.locator("[data-music-sources='1']")).toBeVisible();
  await page.getByRole("button", { name: /close settings/i }).click();
  const progress = await page.evaluate(() => JSON.parse(localStorage.getItem("mathnexa:number-logic-progress:1") ?? "null"));
  expect(progress.records).toHaveLength(6);
  expect(new Set(progress.records.map((record: { mode: string }) => record.mode)).size).toBe(6);
  const audioBeforeReset = await page.evaluate(() => localStorage.getItem("mathnexa:number-logic-audio:1"));
  await page.getByRole("button", { name: /open logic profile/i }).click();
  await expect(page.locator("[data-music-sources='1']")).toBeVisible();
  await page.getByRole("button", { name: "Reset Logic Profile" }).click();
  await page.getByRole("button", { name: "Confirm reset" }).click();
  expect(await page.evaluate(() => localStorage.getItem("mathnexa:number-logic-audio:1"))).toBe(audioBeforeReset);
  await page.getByRole("button", { name: /puzzle library/i }).click();

  for (const viewport of [
    { width: 320, height: 568 }, { width: 360, height: 800 }, { width: 390, height: 844 },
    { width: 430, height: 932 }, { width: 768, height: 1024 }, { width: 1024, height: 768 },
    { width: 1280, height: 720 }, { width: 1366, height: 768 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }
  ]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    const backBox = await page.getByRole("link", { name: "Back to MathNexa Games" }).boundingBox();
    expect(backBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  await page.evaluate(() => { document.documentElement.style.fontSize = ""; });

  await page.getByRole("link", { name: "Back to MathNexa Games" }).click();
  await expect(page).toHaveURL(/\/(?:games|subscription\?next=\/games)$/);
  expect(await page.locator("audio").count()).toBe(0);
  expect(await page.evaluate(() => document.querySelectorAll("[data-audio-manager-count]").length)).toBe(0);

  await context.clearCookies();
  await signIn(page, subscriberEmail, "/games");
  await expect(page.getByRole("heading", { name: "Number Logic", exact: true })).toHaveCount(0);
  const draftDirect = await page.goto("/games/number-logic/play");
  expect(draftDirect?.status() === 404 || page.url().endsWith("/games")).toBe(true);
  await expect(page.locator("[data-audio-manager-count='1']")).toHaveCount(0);
  expect(page.url()).not.toContain("/games/number-logic/play");
  consoleErrors.length = 0;

  const current = await admin.from("game_catalog_entries").select("id,lock_version").eq("stable_key", "number-logic").single();
  if (current.error) throw current.error;
  const published = await admin.rpc("transition_game_catalog_entry", {
    p_actor_admin_id: ownerAdminId,
    p_catalog_entry_id: current.data.id,
    p_expected_lock_version: current.data.lock_version,
    p_status: "published"
  });
  if (published.error) throw published.error;
  await page.goto("/games");
  const publicCard = page.locator("article").filter({ has: page.getByRole("heading", { name: "Number Logic", exact: true }) });
  await expect(publicCard).toBeVisible();
  await publicCard.getByRole("link", { name: "Play" }).click();
  await expect(page).toHaveURL("/games/number-logic/play");
  await expect(page.getByRole("heading", { name: "Number Logic", exact: true })).toBeVisible();
  expect(page.url()).not.toContain("vercel.app");
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
});

test("published Play starts one real music element on the first ordinary gesture and keeps retries explicit", async ({ page, context }) => {
  const current = await admin.from("game_catalog_entries").select("id,status,lock_version").eq("stable_key", "number-logic").single();
  if (current.error) throw current.error;
  if (current.data.status !== "published") {
    const published = await admin.rpc("transition_game_catalog_entry", {
      p_actor_admin_id: ownerAdminId,
      p_catalog_entry_id: current.data.id,
      p_expected_lock_version: current.data.lock_version,
      p_status: "published"
    });
    if (published.error) throw published.error;
  }

  await installStrictPublishedAudioPolicy(page);
  await signIn(page, subscriberEmail, "/games");
  await page.evaluate(() => localStorage.setItem("mathnexa:number-logic-audio:1", JSON.stringify({
    version: "number-logic-audio/1",
    masterMuted: false,
    musicEnabled: true,
    musicVolume: 0.35,
    soundEffectsEnabled: true,
    soundEffectsVolume: 0.6
  })));
  const card = page.locator("article").filter({ has: page.getByRole("heading", { name: "Number Logic", exact: true }) });
  await expect(card).toBeVisible();
  await card.getByRole("link", { name: "Play" }).click();
  await expect(page).toHaveURL("/games/number-logic/play");

  const root = page.locator("[data-audio-manager-count='1']");
  const sound = root.locator("[data-playback]");
  await expect(root).toHaveAttribute("data-audio-context-state", "uninitialized");
  await expect(root).toHaveAttribute("data-audio-permission", "UNKNOWN");
  await expect(root).toHaveAttribute("data-audio-track-decoded", "false");
  await expect(root).toHaveAttribute("data-audio-music-volume", "0.35");
  await expect(root).toHaveAttribute("data-audio-sfx-volume", "0.6");
  expect(await readPublishedAudioProbe(page)).toMatchObject({
    contexts: 0,
    resumes: [],
    decodes: 0,
    musicStarts: 0,
    eligibleResumeRejections: 0,
  });
  expect(await readNumberLogicMusic(page)).toMatchObject({
    source: expect.stringMatching(/\/internal-games\/number-logic\/assets\/oldskool-cc0-CQNT44Pl\.mp3$/),
    frozen: true,
    snapshotFrozen: true,
    mediaElements: 0,
    activeSources: 0,
    playAttempts: 0,
    hasSource: false,
    error: null,
  });

  const oldskool = page.waitForResponse((response) => response.url().endsWith("/assets/oldskool-cc0-CQNT44Pl.mp3"));
  await page.getByRole("button", { name: /lines of 3/i }).click();
  const response = await oldskool;
  expect([200, 206]).toContain(response.status());
  expect(response.headers()["content-type"]).toContain("audio/mpeg");
  if (response.status() === 206) {
    expect(response.headers()["content-range"]).toMatch(/\/1024417$/);
  } else {
    expect(response.headers()["content-length"]).toBe("1024417");
  }
  await expect(root).toHaveAttribute("data-audio-context-state", "suspended");
  await expect(root).toHaveAttribute("data-audio-permission", "LOCKED");
  await expect(root).toHaveAttribute("data-audio-track-decoded", "true");
  await expect(sound).toHaveAttribute("data-playback", "PLAYING");
  await expect(sound).toHaveAttribute("data-music-sources", "1");
  await expect.poll(() => readNumberLogicMusic(page)).toMatchObject({
    mediaElements: 1,
    activeSources: 1,
    paused: false,
    loop: true,
    playAttempts: 1,
    hasSource: true,
    blocked: false,
    fatal: false,
    error: null,
  });
  await expect.poll(async () => (await readNumberLogicMusic(page)).currentTime).toBeGreaterThan(0.05);
  expect(await readPublishedAudioProbe(page)).toMatchObject({
    contexts: 1,
    resumes: [{ active: true, state: "suspended" }],
    decodes: 0,
    musicStarts: 0,
    eligibleResumeRejections: 1,
  });
  const tutorialProgress = page.getByRole("progressbar", { name: "Tutorial progress" });
  await expect(tutorialProgress).toHaveAttribute("aria-valuemin", "1");
  await expect(tutorialProgress).toHaveAttribute("aria-valuemax", "3");
  await expect(tutorialProgress).toHaveAttribute("aria-valuenow", "1");
  await expect(tutorialProgress).toHaveAttribute("aria-valuetext", "Step 1 of 3");
  await expectNoTutorialAxeViolations(page);

  // A second ordinary pointer retries only the rejected Web Audio effects
  // context. Background music is already advancing and never depends on the
  // Music control or a decoded AudioBuffer.
  await page.getByRole("button", { name: /settings/i }).click();
  await expect(root).toHaveAttribute("data-audio-context-state", "running");
  await expect(root).toHaveAttribute("data-audio-track-decoded", "true");
  await expect(page.locator("[data-audio-activated=true]")).toHaveAttribute("data-playback", "PLAYING");
  await expect(page.locator("[data-music-sources='1']")).toBeVisible();
  expect(await readNumberLogicMusic(page)).toMatchObject({ mediaElements: 1, activeSources: 1, playAttempts: 1 });
  expect(await readPublishedAudioProbe(page)).toMatchObject({
    contexts: 1,
    resumes: [{ active: true, state: "suspended" }, { active: true, state: "suspended" }],
    decodes: 0,
    musicStarts: 0,
    eligibleResumeRejections: 1,
  });

  await page.getByRole("button", { name: /close settings/i }).click();
  await page.getByRole("button", { name: /settings/i }).click();
  const musicToggle = page.getByLabel("Music", { exact: true });
  await musicToggle.uncheck();
  await expect(root).toHaveAttribute("data-audio-music-enabled", "false");
  await expect(sound).toHaveAttribute("data-music-sources", "0");
  expect(await readNumberLogicMusic(page)).toMatchObject({ mediaElements: 1, activeSources: 0, paused: true, playAttempts: 1 });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("mathnexa:number-logic-audio:1") ?? "null").musicEnabled)).toBe(false);

  await page.reload();
  await expect(root).toHaveAttribute("data-audio-music-enabled", "false");
  await expect(root).toHaveAttribute("data-audio-context-state", "uninitialized");
  expect(await readPublishedAudioProbe(page)).toMatchObject({ contexts: 0, decodes: 0, musicStarts: 0 });
  expect(await readNumberLogicMusic(page)).toMatchObject({ mediaElements: 0, activeSources: 0, playAttempts: 0, hasSource: false });
  await page.getByRole("button", { name: /settings/i }).click();
  await expect(page.getByLabel("Music", { exact: true })).not.toBeChecked();
  await page.getByLabel("Music", { exact: true }).check();
  await expect(root).toHaveAttribute("data-audio-music-enabled", "true");
  await expect(root).toHaveAttribute("data-audio-context-state", "running");
  await expect(sound).toHaveAttribute("data-music-sources", "1");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("mathnexa:number-logic-audio:1") ?? "null").musicEnabled)).toBe(true);
  expect(await readPublishedAudioProbe(page)).toMatchObject({ contexts: 1, decodes: 0, musicStarts: 0 });
  await expect.poll(() => readNumberLogicMusic(page)).toMatchObject({ mediaElements: 1, activeSources: 1, paused: false, playAttempts: 1 });
  await expect.poll(async () => (await readNumberLogicMusic(page)).currentTime).toBeGreaterThan(0.05);
  await page.getByRole("button", { name: /close settings/i }).click();
  await page.getByRole("button", { name: /lines of 3/i }).click();
  await expect(sound).toHaveAttribute("data-music-sources", "1");
  expect(await readPublishedAudioProbe(page)).toMatchObject({ contexts: 1, decodes: 0, musicStarts: 0 });
  expect(await readNumberLogicMusic(page)).toMatchObject({ mediaElements: 1, activeSources: 1, playAttempts: 1 });
  await Promise.all([
    root.dispatchEvent("pointerdown", { pointerId: 101, pointerType: "mouse", isPrimary: true }),
    root.dispatchEvent("pointerdown", { pointerId: 102, pointerType: "mouse", isPrimary: true }),
    root.dispatchEvent("pointerdown", { pointerId: 103, pointerType: "mouse", isPrimary: true }),
  ]);
  expect(await readNumberLogicMusic(page)).toMatchObject({ mediaElements: 1, activeSources: 1, playAttempts: 1 });

  await page.setViewportSize({ width: 320, height: 568 });
  await expect(page.getByRole("heading", { name: "Make every line match." })).toBeVisible();
  await expect(page.getByRole("img", { name: /blank is 2/i })).toBeVisible();
  await expect(page.getByText("7 + ? + 3 = 12", { exact: true })).toBeVisible();
  await expect(page.getByText("? = 2", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  await expect(tutorialProgress).toHaveAttribute("aria-valuenow", "1");
  await page.getByRole("button", { name: "Next", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(tutorialProgress).toHaveAttribute("aria-valuenow", "2");
  await expect(tutorialProgress).toHaveAttribute("aria-valuetext", "Step 2 of 3");
  await expect(page.getByRole("heading", { name: "Place each number once." })).toBeVisible();
  await expect(page.getByRole("img", { name: /remaining number tiles 2, 5, and 6/i })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(tutorialProgress).toHaveAttribute("aria-valuenow", "3");
  await expect(tutorialProgress).toHaveAttribute("aria-valuetext", "Step 3 of 3");
  await expect(page.getByRole("heading", { name: "Five green lines means solved." })).toBeVisible();
  await expect(page.getByRole("img", { name: /all five lines total 12/i })).toBeVisible();
  await page.getByRole("button", { name: "Choose a puzzle" }).click();
  await page.getByRole("button", { name: /play beginner/i }).click();
  const firstTile = page.locator("[data-drag-tile-id]").first();
  await firstTile.click();
  const firstEmpty = page.locator("[data-position-id]").filter({ has: page.locator("small") }).first();
  await firstEmpty.click();
  await expect.poll(async () => (await readPublishedAudioProbe(page)).effectStarts).toBeGreaterThanOrEqual(2);
  // The reloaded document creates and resumes its one effects context once;
  // later puzzle interactions reuse that already-running context.
  expect((await readPublishedAudioProbe(page)).resumes).toHaveLength(1);

  const beforePauseTime = (await readNumberLogicMusic(page)).currentTime;
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByRole("dialog", { name: /puzzle paused/i })).toBeVisible();
  await expect.poll(() => readNumberLogicMusic(page)).toMatchObject({ activeSources: 0, paused: true, mediaElements: 1 });
  expect((await readPublishedAudioProbe(page)).musicStops).toBe(0);
  await page.getByRole("button", { name: /resume puzzle/i }).click();
  await expect.poll(() => readNumberLogicMusic(page)).toMatchObject({ activeSources: 1, paused: false, mediaElements: 1, playAttempts: 2 });
  await expect.poll(async () => (await readNumberLogicMusic(page)).currentTime).toBeGreaterThan(beforePauseTime);
  expect((await readPublishedAudioProbe(page)).musicStarts).toBe(0);
  await expect(page.locator("[data-music-sources='1']")).toBeVisible();

  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true })));
  await expect.poll(() => readNumberLogicMusic(page)).toMatchObject({ activeSources: 0, paused: true, hasSource: true });
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
  await expect.poll(() => readNumberLogicMusic(page)).toMatchObject({ activeSources: 1, paused: false, hasSource: true });
  await expect.poll(async () => (await readNumberLogicMusic(page)).currentTime).toBeGreaterThan(beforePauseTime);

  await page.getByRole("link", { name: "Back to MathNexa Games" }).click();
  await expect(page).toHaveURL(/\/(?:games|subscription\?next=\/games)$/);
  await expect(page.locator("[data-audio-manager-count]")).toHaveCount(0);

  const reentryCard = page.locator("article").filter({ has: page.getByRole("heading", { name: "Number Logic", exact: true }) });
  await reentryCard.getByRole("link", { name: "Play" }).click();
  const reentryRoot = page.locator("[data-audio-manager-count='1']");
  await expect(reentryRoot).toHaveAttribute("data-audio-context-state", "uninitialized");
  await expect(reentryRoot).toHaveAttribute("data-audio-permission", "UNKNOWN");
  expect(await readNumberLogicMusic(page)).toMatchObject({ mediaElements: 0, activeSources: 0, playAttempts: 0 });
  const productSquare = page.getByRole("button", { name: /product square/i });
  await productSquare.focus();
  await page.keyboard.press("Enter");
  await expect(reentryRoot).toHaveAttribute("data-audio-context-state", "running");
  await expect(reentryRoot.locator("[data-music-sources='1']")).toBeVisible();
  await expect.poll(() => readNumberLogicMusic(page)).toMatchObject({ mediaElements: 1, activeSources: 1, playAttempts: 1, error: null });
  await expect.poll(async () => (await readNumberLogicMusic(page)).currentTime).toBeGreaterThan(0.05);
  expect(await readPublishedAudioProbe(page)).toMatchObject({ contexts: 1, decodes: 0, musicStarts: 0 });
  await page.getByRole("link", { name: "Back to MathNexa Games" }).click();
  await expect(page.locator("[data-audio-manager-count]")).toHaveCount(0);

  // A second page shares only the authenticated subscriber context; it does not
  // inherit the strict probe. The real browser must advance the HTMLMedia clock;
  // a visual-only "Music on" state is not sufficient.
  const realPage = await context.newPage();
  await realPage.goto("/games");
  const realCard = realPage.locator("article").filter({ has: realPage.getByRole("heading", { name: "Number Logic", exact: true }) });
  await expect(realCard).toBeVisible();
  await realCard.getByRole("link", { name: "Play" }).click();
  const realRoot = realPage.locator("[data-audio-manager-count='1']");
  const realSound = realRoot.locator("[data-playback]");
  await expect(realRoot).toHaveAttribute("data-audio-context-state", "uninitialized");
  expect(await readNumberLogicMusic(realPage)).toMatchObject({ mediaElements: 0, activeSources: 0, playAttempts: 0 });
  await realPage.getByRole("button", { name: /lines of 3/i }).click();
  await expect(realRoot).toHaveAttribute("data-audio-context-state", "running");
  await expect(realRoot).toHaveAttribute("data-audio-permission", "UNLOCKED");
  await expect(realRoot).toHaveAttribute("data-audio-track-decoded", "true");
  await expect(realSound).toHaveAttribute("data-playback", "PLAYING");
  await expect(realSound).toHaveAttribute("data-music-sources", "1");
  await expect.poll(() => readNumberLogicMusic(realPage)).toMatchObject({ mediaElements: 1, activeSources: 1, paused: false, error: null });
  await expect.poll(async () => (await readNumberLogicMusic(realPage)).currentTime).toBeGreaterThan(0.05);

  await realPage.getByRole("button", { name: /settings/i }).click();
  await realPage.getByLabel("Music", { exact: true }).uncheck();
  await expect(realSound).toHaveAttribute("data-playback", "PAUSED");
  await expect(realSound).toHaveAttribute("data-music-sources", "0");
  expect(await readNumberLogicMusic(realPage)).toMatchObject({ mediaElements: 1, activeSources: 0, paused: true });
  await realPage.getByLabel("Music", { exact: true }).check();
  await expect(realRoot).toHaveAttribute("data-audio-context-state", "running");
  await expect(realSound).toHaveAttribute("data-playback", "PLAYING");
  await expect(realSound).toHaveAttribute("data-music-sources", "1");
  await expect.poll(() => readNumberLogicMusic(realPage)).toMatchObject({ mediaElements: 1, activeSources: 1, paused: false });
  await realPage.getByRole("button", { name: /close settings/i }).click();
  await realPage.getByRole("link", { name: "Back to MathNexa Games" }).click();
  await expect(realPage.locator("[data-audio-manager-count]")).toHaveCount(0);
  await realPage.close();
});
