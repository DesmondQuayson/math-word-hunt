import { createHmac } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

const url = process.env.SUPABASE_TEST_URL ?? "";
const secretKey = process.env.SUPABASE_TEST_SECRET_KEY ?? "";
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
}>;

async function installStrictPublishedAudioPolicy(page: Page) {
  await page.addInitScript(() => {
    const host = window as typeof window & { __numberLogicPublishedAudioProbe?: {
      contexts: number;
      resumes: Array<{ active: boolean; state: string }>;
      decodes: number;
      musicStarts: number;
      musicStops: number;
      effectStarts: number;
    } };
    const probe = host.__numberLogicPublishedAudioProbe = {
      contexts: 0, resumes: [], decodes: 0, musicStarts: 0, musicStops: 0, effectStarts: 0,
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
        if (probe.resumes.length === 1 || !active) return Promise.reject(new DOMException("User activation required", "NotAllowedError"));
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
  await page.getByRole("button", { name: /skip tutorial/i }).click();
  await page.getByRole("button", { name: /play beginner/i }).click();
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
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: () => Promise.reject(new DOMException("Autoplay blocked by browser policy", "NotAllowedError"))
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
  await expect(page.locator("[data-audio-manager-count='1']")).toBeVisible();

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

test("published normal-user Play unlocks music and SFX on the first in-game gesture", async ({ page }) => {
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
  await expect(root).toHaveAttribute("data-audio-context-state", "suspended");
  await expect(root).toHaveAttribute("data-audio-permission", "LOCKED");
  await expect(root).toHaveAttribute("data-audio-track-decoded", "false");
  await expect(root).toHaveAttribute("data-audio-music-volume", "0.35");
  await expect(root).toHaveAttribute("data-audio-sfx-volume", "0.6");
  expect(await readPublishedAudioProbe(page)).toMatchObject({
    contexts: 1,
    resumes: [{ active: false, state: "suspended" }],
    decodes: 0,
    musicStarts: 0,
  });

  const oldskool = page.waitForResponse((response) => response.url().endsWith("/assets/oldskool-cc0-CQNT44Pl.mp3"));
  await page.getByRole("button", { name: /lines of 3/i }).click();
  const response = await oldskool;
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("audio/mpeg");
  expect(response.headers()["content-length"]).toBe("1295630");
  await expect(root).toHaveAttribute("data-audio-context-state", "running");
  await expect(root).toHaveAttribute("data-audio-track-decoded", "true");
  await expect(page.locator("[data-audio-activated=true]")).toHaveAttribute("data-playback", "PLAYING");
  await expect(page.locator("[data-music-sources='1']")).toBeVisible();
  expect(await readPublishedAudioProbe(page)).toMatchObject({
    contexts: 1,
    resumes: [
      { active: false, state: "suspended" },
      { active: true, state: "suspended" },
    ],
    decodes: 1,
    musicStarts: 1
  });

  await page.getByRole("button", { name: /skip tutorial/i }).click();
  await page.getByRole("button", { name: /play beginner/i }).click();
  const firstTile = page.locator("[data-drag-tile-id]").first();
  await firstTile.click();
  const firstEmpty = page.locator("[data-position-id]").filter({ has: page.locator("small") }).first();
  await firstEmpty.click();
  await expect.poll(async () => (await readPublishedAudioProbe(page)).effectStarts).toBeGreaterThanOrEqual(2);
  expect((await readPublishedAudioProbe(page)).resumes).toHaveLength(2);

  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByRole("dialog", { name: /puzzle paused/i })).toBeVisible();
  await expect.poll(async () => (await readPublishedAudioProbe(page)).musicStops).toBe(1);
  await page.getByRole("button", { name: /resume puzzle/i }).click();
  await expect.poll(async () => (await readPublishedAudioProbe(page)).musicStarts).toBe(2);
  await expect(page.locator("[data-music-sources='1']")).toBeVisible();

  await page.getByRole("link", { name: "Back to MathNexa Games" }).click();
  await expect(page).toHaveURL(/\/(?:games|subscription\?next=\/games)$/);
  await expect(page.locator("[data-audio-manager-count]")).toHaveCount(0);

  const reentryCard = page.locator("article").filter({ has: page.getByRole("heading", { name: "Number Logic", exact: true }) });
  await reentryCard.getByRole("link", { name: "Play" }).click();
  const reentryRoot = page.locator("[data-audio-manager-count='1']");
  await expect(reentryRoot).toHaveAttribute("data-audio-context-state", "suspended");
  await expect(reentryRoot).toHaveAttribute("data-audio-permission", "LOCKED");
  await page.getByRole("button", { name: /product square/i }).click();
  await expect(reentryRoot).toHaveAttribute("data-audio-context-state", "running");
  expect(await readPublishedAudioProbe(page)).toMatchObject({ contexts: 1, decodes: 1, musicStarts: 1 });
  await page.getByRole("link", { name: "Back to MathNexa Games" }).click();
  await expect(page.locator("[data-audio-manager-count]")).toHaveCount(0);
});
