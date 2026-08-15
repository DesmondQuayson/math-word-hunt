import { createHmac } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

const url = process.env.SUPABASE_TEST_URL ?? "";
const secretKey = process.env.SUPABASE_TEST_SECRET_KEY ?? "";
const run = `crosscalc-native-${Date.now()}`;
const password = "SyntheticAdult42!";
const ownerEmail = `${run}-owner@example.test`;
const subscriberEmail = `${run}-subscriber@example.test`;
let admin: SupabaseClient;
let owner: User;
let subscriber: User;

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

async function installStrictAudioPolicy(page: Page) {
  await page.addInitScript(() => {
    const host = window as typeof window & { __crossCalcAudioProbe?: { contexts: number; resumes: boolean[]; decodes: number; starts: number; stops: number; closes: number } };
    const probe = host.__crossCalcAudioProbe = { contexts: 0, resumes: [], decodes: 0, starts: 0, stops: 0, closes: 0 };
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
      resume() {
        const active = navigator.userActivation?.isActive === true;
        probe.resumes.push(active);
        if (!active && this.state !== "running") return Promise.reject(new DOMException("User activation required", "NotAllowedError"));
        this.state = "running";
        return Promise.resolve();
      }
      close() { probe.closes += 1; this.state = "closed"; return Promise.resolve(); }
    }
    Object.defineProperty(window, "AudioContext", { configurable: true, value: StrictAudioContext });
    Object.defineProperty(window, "webkitAudioContext", { configurable: true, value: StrictAudioContext });
  });
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
  const ownerRow = await admin.from("admin_users").insert({ user_id: owner.id, role: "owner", mfa_enrolled: false });
  if (ownerRow.error) throw ownerRow.error;
  const startsAt = new Date();
  const account = await admin.from("consumer_accounts").update({ trial_redeemed_at: startsAt.toISOString() }).eq("user_id", subscriber.id);
  if (account.error) throw account.error;
  const entitlement = await admin.from("consumer_game_entitlements").insert({ user_id: subscriber.id, entitlement_state: "trial-active", trial_started_at: startsAt.toISOString(), trial_ends_at: new Date(startsAt.getTime() + 86_400_000).toISOString() });
  if (entitlement.error) throw entitlement.error;
});

test("Draft Admin Preview is same-origin, playable, persistent, and hidden from subscribers", async ({ page, context }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error" && !message.text().includes("Autoplay")) consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await installStrictAudioPolicy(page);

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
  const card = page.locator("article").filter({ has: page.getByRole("heading", { name: "CrossCalc", exact: true }) });
  await expect(card).toContainText("internal");
  await expect(card).toContainText("draft");
  await expect(card.getByAltText("Thumbnail for CrossCalc")).toBeVisible();
  const previewHref = await card.getByRole("link", { name: "Preview" }).getAttribute("href");
  expect(previewHref).toMatch(/^\/admin\/games\/catalog\/[0-9a-f-]{36}\/preview$/);

  const oldskool = page.waitForResponse((response) => response.url().endsWith("/assets/oldskool-cc0-CQNT44Pl.mp3"));
  await page.goto(previewHref!);
  await expect(page.getByRole("heading", { name: "Every answer opens another." })).toBeVisible();
  expect(new URL(page.url()).origin).toBe("http://127.0.0.1:3000");
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Back to MathNexa Games" })).toHaveAttribute("href", "/games");
  await page.getByRole("button", { name: "Settings" }).click();
  const response = await oldskool;
  expect(response.status()).toBe(200);
  await expect(page.locator(".app-shell")).toHaveAttribute("data-audio-playback", "PLAYING");
  await expect(page.locator(".app-shell")).toHaveAttribute("data-active-music-sources", "1");
  expect(await page.evaluate(() => (window as typeof window & { __crossCalcAudioProbe: { contexts: number; decodes: number; starts: number } }).__crossCalcAudioProbe)).toMatchObject({ contexts: 1, decodes: 1, starts: 1 });
  await page.getByLabel("Music").uncheck();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-active-music-sources", "0");
  await page.getByLabel("Music").check();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-active-music-sources", "1");
  await page.getByRole("button", { name: "Done" }).click();

  for (const mode of ["addition", "subtraction", "multiplication", "division", "mixed"]) {
    await page.getByLabel("Operation").selectOption(mode);
    for (const difficulty of ["beginner", "easy", "medium", "hard", "expert"]) {
      await page.getByLabel("Difficulty").selectOption(difficulty);
      await expect(page.locator(".cell.crossing").first()).toBeVisible();
      expect(await page.locator(".cell").count()).toBeGreaterThanOrEqual(4);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    }
  }

  const firstCell = page.locator(".cell").first();
  await firstCell.click();
  await firstCell.press("7");
  await page.getByRole("button", { name: /^Hint/ }).click();
  const reasoningBefore = await page.locator(".status-cluster").getByText("RI").locator("..").locator("strong").textContent();
  await page.reload();
  await expect(page.locator(".status-cluster").getByText("RI").locator("..").locator("strong")).toHaveText(reasoningBefore ?? "");
  await expect(page.locator(".cell").first()).not.toHaveText("");

  const clues = page.locator(".clue-list button");
  for (let index = 0; index < await clues.count(); index += 1) {
    if (await page.getByRole("heading", { name: "Grid complete." }).isVisible()) break;
    await clues.nth(index).click();
    for (let tier = 0; tier < 4; tier += 1) {
      if (await page.getByRole("heading", { name: "Grid complete." }).isVisible()) break;
      await page.getByRole("button", { name: /^Hint/ }).click({ force: true });
    }
  }
  await expect(page.getByRole("heading", { name: "Grid complete." })).toBeVisible();
  expect(Number(await page.locator(".ri-orbit strong").textContent())).toBeLessThan(100);
  const progress = await page.evaluate(() => JSON.parse(localStorage.getItem("mathnexa.crosscalc.v1.progress") ?? "null"));
  expect(progress.results).toHaveLength(1);

  await context.clearCookies();
  await signIn(page, subscriberEmail, "/games");
  await expect(page.getByRole("heading", { name: "CrossCalc", exact: true })).toHaveCount(0);
  const direct = await page.goto("/games/crosscalc/play");
  expect(direct?.status() === 404 || page.url().endsWith("/games")).toBe(true);
  await expect(page.getByRole("heading", { name: "CrossCalc", exact: true })).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
