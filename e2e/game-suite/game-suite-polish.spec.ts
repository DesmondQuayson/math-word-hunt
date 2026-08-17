import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

const url = process.env.SUPABASE_TEST_URL ?? "";
const secretKey = process.env.SUPABASE_TEST_SECRET_KEY ?? "";
const run = `game-suite-polish-${Date.now()}`;
const email = `${run}-subscriber@example.test`;
const ownerEmail = `${run}-owner@example.test`;
const password = "SyntheticAdult42!";
const axeSource = readFileSync(resolve("node_modules/axe-core/axe.min.js"), "utf8");
const audioHash = "6ba9a6b324807202bb148f77f2030086e7aa0b5fc0f81e1d3ddea072b47c7369";
let admin: SupabaseClient;
let subscriber: User;

const games = [
  { title: "Math Word Hunt", cardTitle: "Math Vocabulary Hunt", route: "/game/runtime/index.html", heading: /Math Word Hunt/i },
  { title: "Number Logic", cardTitle: "Number Logic", route: "/games/number-logic/play", heading: "Number Logic" },
  { title: "Number Cross", cardTitle: "Number Cross", route: "/games/number-cross/play", heading: /Every line has an answer/i },
  { title: "CrossCalc", cardTitle: "CrossCalc", route: "/games/crosscalc/play", heading: "Place the numbers. Prove every path." }
] as const;

const viewports = [
  { width: 304, height: 700 },
  { width: 320, height: 568 },
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 }
] as const;

async function signIn(page: Page) {
  await page.goto("/sign-in?next=%2Fgames");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/games$/);
}

async function expectNoOverflow(page: Page, context = page.url()) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(dimensions.scrollWidth, context).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

async function expectNoAxeViolations(page: Page, browserName: string) {
  await page.evaluate(axeSource);
  const result = await page.evaluate(async (engine) => (window as typeof window & {
    axe: { run: (options: unknown) => Promise<{ violations: unknown[] }> };
  }).axe.run({
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
    rules: { "color-contrast": { enabled: engine !== "webkit" } }
  }), browserName);
  expect(result.violations).toEqual([]);
}

test.beforeAll(async () => {
  expect(url).toBe("http://127.0.0.1:55321");
  admin = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const [created, ownerCreated] = await Promise.all([
    admin.auth.admin.createUser({ email, password, email_confirm: true }),
    admin.auth.admin.createUser({ email: ownerEmail, password, email_confirm: true })
  ]);
  if (created.error || !created.data.user) throw created.error ?? new Error("Subscriber fixture unavailable.");
  if (ownerCreated.error || !ownerCreated.data.user) throw ownerCreated.error ?? new Error("Owner fixture unavailable.");
  subscriber = created.data.user;
  const startsAt = new Date();
  const account = await admin.from("consumer_accounts")
    .update({ trial_redeemed_at: startsAt.toISOString() })
    .eq("user_id", subscriber.id);
  if (account.error) throw account.error;
  const entitlement = await admin.from("consumer_game_entitlements").insert({
    user_id: subscriber.id,
    entitlement_state: "trial-active",
    trial_started_at: startsAt.toISOString(),
    trial_ends_at: new Date(startsAt.getTime() + 86_400_000).toISOString()
  });
  if (entitlement.error) throw entitlement.error;
  const ownerRow = await admin.from("admin_users")
    .insert({ user_id: ownerCreated.data.user.id, role: "owner", mfa_enrolled: true })
    .select("id")
    .single();
  if (ownerRow.error) throw ownerRow.error;
  const publication = await admin.from("game_catalog_entries")
    .select("id,stable_key,status,lock_version")
    .in("stable_key", ["number-cross", "number-logic", "crosscalc"])
    .order("stable_key");
  if (publication.error) throw publication.error;
  expect(publication.data).toHaveLength(3);
  expect(new Set(publication.data.map((entry) => entry.stable_key))).toEqual(new Set(["number-cross", "number-logic", "crosscalc"]));
  for (const entry of publication.data) {
    expect(["draft", "published"]).toContain(entry.status);
    if (entry.status === "published") continue;
    const transitioned = await admin.rpc("transition_game_catalog_entry", {
      p_actor_admin_id: ownerRow.data.id,
      p_catalog_entry_id: entry.id,
      p_expected_lock_version: entry.lock_version,
      p_status: "published"
    });
    if (transitioned.error) throw transitioned.error;
  }
});

test("the four-game shelf and same-origin runtimes stay polished across classroom viewports", async ({ page, browserName }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const remoteRequests: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => {
    const target = new URL(request.url());
    if (target.hostname !== "127.0.0.1") remoteRequests.push(request.url());
  });
  await page.addInitScript(() => {
    const host = window as typeof window & { __gameSuitePlayAttempts?: number };
    host.__gameSuitePlayAttempts = 0;
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value() {
        host.__gameSuitePlayAttempts = (host.__gameSuitePlayAttempts ?? 0) + 1;
        return Promise.reject(new DOMException("Autoplay blocked for regression verification", "NotAllowedError"));
      }
    });
  });

  const anonymous = await page.goto("/games");
  expect(anonymous?.status()).toBeLessThan(400);
  await expect(page).toHaveURL(/\/access\?next=\/games$/);
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Pick a challenge." })).toBeVisible();
  await expect(page.locator(".game-card-grid article")).toHaveCount(4);

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await expectNoOverflow(page);
    for (const game of games) {
      const card = page.locator("article").filter({ has: page.getByRole("heading", { name: game.cardTitle, exact: true }) });
      await card.scrollIntoViewIfNeeded();
      await expect(card).toBeVisible();
      const image = card.getByAltText(`${game.cardTitle} gameplay artwork`);
      await expect(image).toBeVisible();
      await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBe(1200);
      const dimensions = await image.evaluate((element) => ({
        naturalWidth: (element as HTMLImageElement).naturalWidth,
        naturalHeight: (element as HTMLImageElement).naturalHeight,
        width: element.getBoundingClientRect().width,
        height: element.getBoundingClientRect().height,
        currentSrc: (element as HTMLImageElement).currentSrc
      }));
      expect(dimensions).toMatchObject({ naturalWidth: 1200, naturalHeight: 675 });
      expect(dimensions.width / dimensions.height).toBeCloseTo(16 / 9, 1);
      expect(new URL(dimensions.currentSrc).origin).toBe("http://127.0.0.1:3000");
      const play = card.getByRole("link", { name: "Play" });
      await expect(play).toBeVisible();
      expect((await play.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
      await play.focus();
      await expect(play).toBeFocused();
    }
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/games");
  await expectNoAxeViolations(page, browserName);

  for (const path of [
    "/media/audio/cosmic-candy-catchers.mp3",
    "/internal-games/number-cross/audio/music/cosmic-candy-catchers.mp3",
    "/internal-games/number-logic/assets/oldskool-cc0-CQNT44Pl.mp3",
    "/internal-games/crosscalc-v2/assets/oldskool-cc0-CQNT44Pl.mp3"
  ]) {
    const response = await page.request.get(path);
    expect(response.status(), path).toBe(200);
    expect(response.headers()["content-type"], path).toContain("audio/mpeg");
    expect(createHash("sha256").update(await response.body()).digest("hex"), path).toBe(audioHash);
  }

  await page.goto(games[0].route);
  await expect(page).toHaveTitle(/Math Word Hunt/i);
  await expect(page.locator('.grade-card[data-grade="6"]')).toBeVisible();
  await expect(page.getByText("Cosmic Candy Catchers", { exact: false })).toBeAttached();
  await page.locator('.grade-card[data-grade="6"]').click();
  const topic = page.locator(".topic-card:not(.incomplete)").first();
  await topic.locator("summary").click();
  await topic.locator(".choose-topic-button").click();
  await page.locator(".lesson-row").first().click();
  await expect(page.locator("#gameScreen")).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __gameSuitePlayAttempts?: number }).__gameSuitePlayAttempts ?? 0)).toBeGreaterThan(0);
  const canonicalMusic = await page.evaluate(() => {
    const music = (window as typeof window & {
      __MATHNEXA_GAME_MUSIC__: { source: string; snapshot: () => { loop: boolean; error: string | null } };
    }).__MATHNEXA_GAME_MUSIC__;
    return { source: music.source, ...music.snapshot() };
  });
  expect(canonicalMusic.source).toBe("/media/audio/cosmic-candy-catchers.mp3");
  expect(canonicalMusic).toMatchObject({ loop: true, error: null });
  await expectNoOverflow(page);
  await expectNoAxeViolations(page, browserName);

  for (const game of games.slice(1)) {
    await page.goto(game.route);
    await expect(page.getByRole("heading", { name: game.heading })).toBeVisible();
    await expect(page.locator("iframe")).toHaveCount(0);
    await expectNoOverflow(page);
    await expectNoAxeViolations(page, browserName);
  }

  await page.goto("/games/number-logic/play");
  await expect(page.getByText("Cosmic Candy Catchers", { exact: false }).first()).toBeAttached();
  await page.goto("/games/crosscalc/play");
  await expect(page.getByText("Cosmic Candy Catchers", { exact: false })).toBeAttached();
  await page.goto("/games/number-cross/play");
  await page.getByRole("button", { name: "Sound and settings" }).click();
  await expect(page.getByText("Cosmic Candy Catchers · looping soundtrack", { exact: true })).toBeVisible();

  expect(remoteRequests).toEqual([]);
  expect(consoleErrors.filter((message) => !message.includes("status of 404"))).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("every game runtime stays reachable and horizontally contained across the release matrix", async ({ page }) => {
  await signIn(page);
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const game of games) {
      const response = await page.goto(game.route);
      expect(response?.status(), `${game.title} at ${viewport.width}×${viewport.height}`).toBeLessThan(400);
      if (game.route === "/game/runtime/index.html") await expect(page).toHaveTitle(/Math Word Hunt/i);
      else await expect(page.getByRole("heading", { name: game.heading }).first()).toBeVisible();
      await expectNoOverflow(page, `${game.title} at ${viewport.width}×${viewport.height}`);
      const visibleControl = page.locator("button:visible, a:visible").first();
      await expect(visibleControl).toBeVisible();
      const box = await visibleControl.boundingBox();
      expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(viewport.width + 1);
    }
  }
});
