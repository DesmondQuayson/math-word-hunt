import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

const url = process.env.SUPABASE_TEST_URL ?? "";
const secretKey = process.env.SUPABASE_TEST_SECRET_KEY ?? "";
const run = `crosscalc-v2-native-${Date.now()}`;
const password = "SyntheticAdult42!";
const ownerEmail = `${run}-owner@example.test`;
const subscriberEmail = `${run}-subscriber@example.test`;
const unentitledEmail = `${run}-unentitled@example.test`;
const axeSource = readFileSync(resolve("node_modules/axe-core/axe.min.js"), "utf8");
let admin: SupabaseClient;
let owner: User;
let subscriber: User;
let unentitled: User;

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
  await page.goto(`/sign-in?next=${encodeURIComponent(destination)}`);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function installAudioAndResultProbes(page: Page) {
  await page.addInitScript(() => {
    const host = window as typeof window & {
      __crossCalcV2AudioProbe?: { contexts: number; decodes: number; starts: number; stops: number; closes: number };
      __crossCalcV2Results?: unknown[];
    };
    const probe = host.__crossCalcV2AudioProbe = { contexts: 0, decodes: 0, starts: 0, stops: 0, closes: 0 };
    host.__crossCalcV2Results = [];
    window.addEventListener("mathnexa:game-result", (event) => host.__crossCalcV2Results!.push((event as CustomEvent).detail));
    class StrictAudioContext {
      state: AudioContextState = "suspended";
      currentTime = 0;
      destination = {};
      constructor() { probe.contexts += 1; }
      createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
      createBufferSource() { return { buffer: null, loop: false, loopStart: 0, loopEnd: 0, connect() {}, disconnect() {}, start() { probe.starts += 1; }, stop() { probe.stops += 1; } }; }
      createOscillator() {
        let ended: (() => void) | null = null;
        return { type: "sine", frequency: { setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, disconnect() {}, addEventListener(_name: string, listener: () => void) { ended = listener; }, start() {}, stop() { ended?.(); } };
      }
      decodeAudioData() { probe.decodes += 1; const samples = new Float32Array(1_000); return Promise.resolve({ sampleRate: 1_000, length: 1_000, duration: 1, numberOfChannels: 1, getChannelData: () => samples }); }
      resume() { this.state = "running"; return Promise.resolve(); }
      close() { probe.closes += 1; this.state = "closed"; return Promise.resolve(); }
    }
    Object.defineProperty(window, "AudioContext", { configurable: true, value: StrictAudioContext });
    Object.defineProperty(window, "webkitAudioContext", { configurable: true, value: StrictAudioContext });
  });
}

test.beforeAll(async () => {
  expect(url).toMatch(/^http:\/\/127\.0\.0\.1:/);
  admin = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const [ownerResult, subscriberResult, unentitledResult] = await Promise.all([
    admin.auth.admin.createUser({ email: ownerEmail, password, email_confirm: true }),
    admin.auth.admin.createUser({ email: subscriberEmail, password, email_confirm: true }),
    admin.auth.admin.createUser({ email: unentitledEmail, password, email_confirm: true })
  ]);
  if (!ownerResult.data.user || ownerResult.error) throw ownerResult.error ?? new Error("Owner fixture unavailable.");
  if (!subscriberResult.data.user || subscriberResult.error) throw subscriberResult.error ?? new Error("Subscriber fixture unavailable.");
  if (!unentitledResult.data.user || unentitledResult.error) throw unentitledResult.error ?? new Error("Non-entitled fixture unavailable.");
  owner = ownerResult.data.user;
  subscriber = subscriberResult.data.user;
  unentitled = unentitledResult.data.user;
  const ownerRow = await admin.from("admin_users").insert({ user_id: owner.id, role: "owner", mfa_enrolled: false });
  if (ownerRow.error) throw ownerRow.error;
  const startsAt = new Date();
  const account = await admin.from("consumer_accounts").update({ trial_redeemed_at: startsAt.toISOString() }).eq("user_id", subscriber.id);
  if (account.error) throw account.error;
  const entitlement = await admin.from("consumer_game_entitlements").insert({ user_id: subscriber.id, entitlement_state: "trial-active", trial_started_at: startsAt.toISOString(), trial_ends_at: new Date(startsAt.getTime() + 86_400_000).toISOString() });
  if (entitlement.error) throw entitlement.error;
});

test("V2 is admin-only while the published V1 subscriber route remains unchanged", async ({ page, context, browserName }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const remoteRequests: string[] = [];
  page.on("console", (message) => { if (message.type() === "error" && !message.text().includes("Autoplay")) consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => { const target = new URL(request.url()); if (target.hostname !== "127.0.0.1") remoteRequests.push(request.url()); });
  await installAudioAndResultProbes(page);

  const anonymousV2 = await page.goto("/games/crosscalc/v2/preview");
  expect(anonymousV2?.status()).toBe(404);

  await signIn(page, unentitledEmail, "/games");
  await expect(page.getByRole("heading", { name: "CrossCalc", exact: true })).toHaveCount(0);
  expect((await page.goto("/games/crosscalc/v2/preview"))?.status()).toBe(404);

  await context.clearCookies();
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
  let ownerCard = page.locator("article").filter({ has: page.getByRole("heading", { name: "CrossCalc", exact: true }) });
  const publishButton = ownerCard.getByRole("button", { name: "Publish game" });
  if (await publishButton.count()) {
    await publishButton.click();
    await expect(page).toHaveURL(/\/admin\?section=games&package=published$/);
    ownerCard = page.locator("article").filter({ has: page.getByRole("heading", { name: "CrossCalc", exact: true }) });
  }
  await expect(ownerCard.locator(".admin-publication-badge")).toHaveText("published");
  const ownerCookies = await context.cookies();

  await context.clearCookies();
  await signIn(page, subscriberEmail, "/games");
  await expect(page.getByRole("heading", { name: "CrossCalc", exact: true })).toBeVisible();
  await page.goto("/games/crosscalc/play?version=0.2.0");
  await expect(page.getByRole("heading", { name: "Every answer opens another." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Place the numbers. Prove every path." })).toHaveCount(0);
  expect((await page.goto("/games/crosscalc/v2/preview"))?.status()).toBe(404);

  await context.clearCookies();
  await context.addCookies(ownerCookies);
  await page.goto("/admin?section=games");
  const card = page.locator("article").filter({ has: page.getByRole("heading", { name: "CrossCalc", exact: true }) });
  await expect(card).toContainText("published");
  await expect(card).toContainText("CrossCalc V2 · Preview Version 0.2.0");
  await expect(card).toContainText("NOT LIVE · Public subscribers remain on 0.1.0.");
  const thumbnail = card.getByAltText("Unreleased CrossCalc V2 number-placement thumbnail");
  await thumbnail.scrollIntoViewIfNeeded();
  await expect(thumbnail).toBeVisible();
  await expect.poll(() => thumbnail.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBe(1200);
  const thumbnailMetrics = await thumbnail.evaluate((image) => ({ naturalWidth: (image as HTMLImageElement).naturalWidth, naturalHeight: (image as HTMLImageElement).naturalHeight, width: image.getBoundingClientRect().width, height: image.getBoundingClientRect().height }));
  expect(thumbnailMetrics).toMatchObject({ naturalWidth: 1200, naturalHeight: 675 });
  expect(thumbnailMetrics.width / thumbnailMetrics.height).toBeCloseTo(16 / 9, 1);
  const previewHref = await card.getByRole("link", { name: "Preview V2 0.2.0 · NOT LIVE" }).getAttribute("href");
  expect(previewHref).toMatch(/^\/admin\/games\/catalog\/[0-9a-f-]{36}\/preview\?version=0\.2\.0$/);

  const oldskool = page.waitForResponse((response) => response.url().endsWith("/assets/oldskool-cc0-CQNT44Pl.mp3"));
  await page.goto(previewHref!);
  await expect(page.getByText("CrossCalc", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Preview Version 0.2.0", { exact: true })).toBeVisible();
  await expect(page.getByText("NOT LIVE", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Place the numbers. Prove every path." })).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0);
  expect(new URL(page.url()).origin).toBe("http://127.0.0.1:3000");

  await page.getByRole("button", { name: "Settings" }).click();
  expect((await oldskool).status()).toBe(200);
  await expect(page.locator(".app-shell")).toHaveAttribute("data-audio-playback", "PLAYING");
  await expect(page.locator(".app-shell")).toHaveAttribute("data-active-music-sources", "1");
  await page.getByRole("checkbox", { name: "Music" }).uncheck();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-active-music-sources", "0");
  await page.getByRole("checkbox", { name: "Music" }).check();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-active-music-sources", "1");
  await page.getByRole("button", { name: "Save settings" }).click();
  const audioProbe = await page.evaluate(() => (window as typeof window & { __crossCalcV2AudioProbe: { contexts: number; decodes: number; starts: number; stops: number } }).__crossCalcV2AudioProbe);
  expect(audioProbe).toMatchObject({ contexts: 1, decodes: 1 });
  expect(audioProbe.starts).toBeGreaterThanOrEqual(2);
  expect(audioProbe.stops).toBeGreaterThanOrEqual(1);

  const tile = page.locator(".number-tray button").first();
  const cell = page.locator(".number-cell.empty").first();
  await tile.focus();
  await page.keyboard.press("Enter");
  await cell.focus();
  await page.keyboard.press("Enter");
  await expect(cell).not.toContainText("?");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(cell).toContainText("?");
  await page.getByRole("button", { name: "Redo" }).click();
  const placed = (await cell.textContent()) ?? "";
  await page.reload();
  await expect(page.locator(".number-cell.empty").first()).toContainText(placed.replace("◆", "").trim());
  expect(await page.evaluate(() => localStorage.getItem("mathnexa.crosscalc.v1.progress"))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("mathnexa.crosscalc.v2.active"))).not.toBeNull();

  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 768, height: 1024 }]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    await expect(page.locator(".number-tray")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Hint/ })).toBeVisible();
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await page.locator("[aria-label*='equation' i], [aria-describedby]").count()).toBeGreaterThan(0);

  await page.evaluate(axeSource);
  const accessibility = await page.evaluate(async (engine) => (window as typeof window & { axe: { run: (options: unknown) => Promise<{ violations: unknown[] }> } }).axe.run({
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
    // Playwright WebKit cannot read axe-core's text-measurement canvas and emits
    // an engine console error. Chromium remains the authoritative contrast gate.
    rules: { "color-contrast": { enabled: engine !== "webkit" } }
  }), browserName);
  expect(accessibility.violations).toEqual([]);
  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  await expect(page.locator(".number-tray")).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "none" });

  await page.getByLabel("Difficulty").selectOption("beginner");
  for (let index = 0; index < 30; index += 1) {
    if (await page.getByRole("heading", { name: "Network complete." }).isVisible()) break;
    await page.getByRole("button", { name: /^Hint/ }).click();
  }
  await expect(page.getByRole("heading", { name: "Network complete." })).toBeVisible();
  const results = await page.evaluate(() => (window as typeof window & { __crossCalcV2Results: unknown[] }).__crossCalcV2Results);
  expect(results).toHaveLength(1);
  expect(results[0]).toMatchObject({ schema: "crosscalc-result/2", game: "crosscalc", gameVersion: "0.2.0", mechanic: "number-placement", completionValid: true });
  const storedResults = await page.evaluate(() => JSON.parse(localStorage.getItem("mathnexa.crosscalc.v2.results") ?? "[]"));
  expect(storedResults).toHaveLength(1);
  expect(remoteRequests).toEqual([]);
  expect(consoleErrors.filter((message) => !message.includes("status of 404"))).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(["chromium", "webkit"]).toContain(browserName);
});
