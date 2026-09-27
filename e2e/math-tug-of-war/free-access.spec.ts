import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { GAME_ROUTE, keysFor, panel, questionText, solve, tapKeys, waitForUnlocked, type Team } from "./helpers";

// Math Tug of War is FREE for any signed-in MathNexa account (owner decision
// 2026-09-27). Free never means anonymous. Every other game keeps its rule.

const url = process.env.SUPABASE_TEST_URL ?? "";
const secretKey = process.env.SUPABASE_TEST_SECRET_KEY ?? "";
const mailUrl = process.env.MAIL_TEST_URL ?? "http://127.0.0.1:56324";
const origin = process.env.MATH_TUG_OF_WAR_ONLINE_URL ?? "http://127.0.0.1:3000";
const run = `tug-free-${Date.now()}`;
const password = "SyntheticAdult42!";
const emails = {
  free1: `${run}-free1@example.test`,
  free2: `${run}-free2@example.test`,
  usedTrial: `${run}-used-trial@example.test`,
  subscriber: `${run}-subscriber@example.test`,
  signup: `${run}-signup@example.test`
};
const userIds: string[] = [];
const axeSource = readFileSync(resolve("node_modules/axe-core/axe.min.js"), "utf8");
let admin: SupabaseClient;

test.describe.configure({ mode: "serial" });

async function createAccount(email: string, entitlement: "none" | "used-trial" | "subscriber") {
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (!created.data.user || created.error) throw created.error ?? new Error("Synthetic account unavailable.");
  userIds.push(created.data.user.id);
  const now = Date.now();
  if (entitlement === "used-trial") {
    await admin.from("consumer_accounts").update({ trial_redeemed_at: new Date(now - 3 * 86_400_000).toISOString() }).eq("user_id", created.data.user.id);
    await admin.from("consumer_game_entitlements").insert({ user_id: created.data.user.id, entitlement_state: "trial-expired", trial_started_at: new Date(now - 3 * 86_400_000).toISOString(), trial_ends_at: new Date(now - 2 * 86_400_000).toISOString() });
  }
  if (entitlement === "subscriber") {
    await admin.from("consumer_accounts").update({ trial_redeemed_at: new Date(now).toISOString() }).eq("user_id", created.data.user.id);
    const inserted = await admin.from("consumer_game_entitlements").insert({ user_id: created.data.user.id, entitlement_state: "subscription-active", current_period_ends_at: new Date(now + 20 * 86_400_000).toISOString() });
    if (inserted.error) throw inserted.error;
  }
}

test.beforeAll(async () => {
  expect(url).toMatch(/^http:\/\/127\.0\.0\.1:/);
  admin = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
  await createAccount(emails.free1, "none");
  await createAccount(emails.free2, "none");
  await createAccount(emails.usedTrial, "used-trial");
  await createAccount(emails.subscriber, "subscriber");
});

test.afterAll(async () => {
  await admin.from("tug_rooms").delete().in("host_name", ["Fay", "Sam"]);
  const signup = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const signupUser = signup.data?.users.find((user) => user.email === emails.signup);
  if (signupUser) userIds.push(signupUser.id);
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
});

async function freshContext(browser: Browser, viewport = { width: 1366, height: 900 }) {
  const context = await browser.newContext({ baseURL: origin, viewport });
  const page = await context.newPage();
  return { context, page };
}

async function signInOnPage(page: Page, email: string) {
  await page.getByLabel("Email address").fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function signedIn(browser: Browser, email: string, next = "/"): Promise<{ context: BrowserContext; page: Page }> {
  const { context, page } = await freshContext(browser);
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  await signInOnPage(page, email);
  await page.waitForURL((target) => !target.pathname.startsWith("/sign-in"), { timeout: 45_000 });
  return { context, page };
}

async function gameReady(page: Page) {
  await expect(page.getByRole("heading", { level: 1, name: /Math Tug of War/ })).toBeVisible({ timeout: 90_000 });
  expect(new URL(page.url()).pathname).toBe(GAME_ROUTE);
}

async function axe(page: Page) {
  await page.evaluate(axeSource);
  return page.evaluate(async () => {
    const result = await (window as unknown as { axe: { run: (context: Document, options: unknown) => Promise<{ violations: { id: string; impact: string; nodes: unknown[] }[] }> } })
      .axe.run(document, { resultTypes: ["violations"] });
    return result.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical").map((violation) => `${violation.id} (${violation.nodes.length})`);
  });
}

test("anonymous: homepage features the free game; Play for Free Now and the direct route require sign-in, never pricing", async ({ browser }) => {
  const { context, page } = await freshContext(browser);
  await page.goto("/");
  const featured = page.locator(".home-featured-games");
  await expect(featured.getByRole("heading", { name: "Math Tug of War" })).toBeVisible({ timeout: 90_000 });
  const cards = featured.locator("article");
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toHaveAttribute("data-game", "math-vocabulary-hunt");
  await expect(cards.nth(1)).toHaveAttribute("data-game", "math-tug-of-war");
  const [mvh, tug] = [await cards.nth(0).boundingBox(), await cards.nth(1).boundingBox()];
  expect(Math.abs(mvh!.y - tug!.y)).toBeLessThan(2);
  expect(tug!.x).toBeGreaterThan(mvh!.x + mvh!.width - 1);
  await expect(cards.nth(1).getByAltText(/^Math Tug of War gameplay artwork/)).toBeVisible();
  await expect(cards.nth(1)).toContainText("Solve the math. Pull the rope. Beat the other side!");
  await expect(cards.nth(1)).toContainText("Free with a MathNexa account");
  expect(await page.locator("body").innerText()).not.toMatch(/no sign-up required/i);
  expect(await axe(page)).toEqual([]);

  await featured.getByRole("link", { name: "Play for Free Now" }).click();
  await page.waitForURL(/\/access\?next=/);
  expect(new URL(page.url()).searchParams.get("next")).toBe(GAME_ROUTE);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Continue to Math Tug of War");
  await expect(page.getByText("Sign in or create a free MathNexa account to play.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", `/sign-in?next=${GAME_ROUTE}`);
  await expect(page.getByRole("link", { name: "Create account" })).toHaveAttribute("href", `/sign-up?next=${GAME_ROUTE}`);
  expect(page.url()).not.toMatch(/pricing|checkout|subscription|trial/);
  expect(await axe(page)).toEqual([]);

  const direct = await page.request.get(GAME_ROUTE, { maxRedirects: 0 });
  expect([302, 303, 307, 308]).toContain(direct.status());
  expect(direct.headers().location).toContain(`/access?next=${GAME_ROUTE}`);
  expect(await direct.text()).not.toContain("internal-games/math-tug-of-war/src/app.js");
  await page.goto(GAME_ROUTE);
  expect(new URL(page.url()).pathname).toBe("/access");
  const api = await page.request.post("/api/games/math-tug-of-war/online", {
    headers: { "Content-Type": "application/json", "X-MathNexa-Game": "math-tug-of-war", "Sec-Fetch-Site": "same-origin" },
    data: { action: "create", name: "Anon", skill: "addition" }
  });
  expect(api.status()).toBe(401);
  await context.close();
});

test("create account: sign-up from Play for Free Now, confirm the email, land in the game without subscribing", async ({ browser }) => {
  const { context, page } = await freshContext(browser);
  await page.goto(`/access?next=${GAME_ROUTE}`);
  await page.getByRole("link", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Create a free account to play");
  expect(await page.locator("main").innerText()).not.toMatch(/start your free trial|\$5\.99|subscription setup/i);
  await page.getByLabel("Email address").fill(emails.signup);
  const displayName = page.getByLabel("Display name");
  if (await displayName.count()) await displayName.fill("Signup Tester");
  await page.locator('input[name="password"]').fill(password);
  await page.locator('input[name="passwordConfirmation"]').fill(password);
  await page.getByRole("button", { name: /Create/ }).click();
  // The confirmation email (local mail capture) carries the return to the game.
  let link: string | null = null;
  for (let attempt = 0; attempt < 40 && !link; attempt += 1) {
    const list = await fetch(`${mailUrl}/api/v1/search?query=${encodeURIComponent(`to:${emails.signup}`)}`).then((response) => response.ok ? response.json() : null).catch(() => null);
    const id = list?.messages?.[0]?.ID;
    if (id) {
      const message = await fetch(`${mailUrl}/api/v1/message/${id}`).then((response) => response.json());
      link = (String(message.Text ?? message.HTML ?? "").match(/https?:\/\/[^\s"'<>]+verify[^\s"'<>]+/) ?? [null])[0];
    }
    if (!link) await page.waitForTimeout(500);
  }
  expect(link, "confirmation email with a verification link").toBeTruthy();
  const callback = page.waitForResponse((response) => new URL(response.url()).pathname === "/auth/callback");
  await page.goto(link!.replace(/&amp;/g, "&"));
  // The auth callback sends the new account straight back to the game. Local
  // `next dev` names its own host "localhost" while the session cookie lives on
  // 127.0.0.1, so the last hop is replayed on the cookie's host (deployed hosts
  // do not differ).
  const returned = new URL((await callback).headers().location ?? "", origin);
  expect(returned.pathname).toBe(GAME_ROUTE);
  if (new URL(page.url()).host !== new URL(origin).host) await page.goto(GAME_ROUTE);
  await gameReady(page);
  expect(await page.locator("body").getAttribute("data-exit-href")).toBe("/");
  expect(await page.locator("body").innerText()).not.toMatch(/subscribe|payment required|start trial|upgrade/i);
  await context.close();
});

test("sign in: a returning non-subscriber goes from Play for Free Now through Sign in straight to the game and can play", async ({ browser }) => {
  const { context, page } = await freshContext(browser);
  await page.goto("/");
  await page.locator(".home-featured-games").getByRole("link", { name: "Play for Free Now" }).click();
  await page.getByRole("link", { name: "Sign in" }).click();
  await expect(page.getByText("Sign in or create a free MathNexa account to play Math Tug of War. No subscription is needed.")).toBeVisible();
  await expect(page.locator("main .form-switch").getByRole("link", { name: "Create a free account" })).toHaveAttribute("href", `/sign-up?next=${GAME_ROUTE}`);
  expect(await page.locator("main form.account-form").innerText()).not.toMatch(/trial|subscri|\$5\.99/i);
  await signInOnPage(page, emails.free1);
  await gameReady(page);
  // The game's "back" link goes Home for a free player, never to a subscription screen.
  await expect(page.locator(".games-link")).toHaveAttribute("href", "/");
  await expect(page.locator(".games-link")).toContainText("Home");
  await page.locator("button[data-mode=robot]").click();
  await page.getByRole("button", { name: "Start Game" }).click();
  const text = await questionText(page, "turquoise");
  await tapKeys(page, "turquoise", [...keysFor(solve(text)), "submit"]);
  await expect(panel(page, "turquoise").locator(".panel-pulls")).toHaveText("Pulls: 1");
  await context.close();
});

test("access matrix: non-subscriber and used-trial accounts play free; other games and products keep their rules", async ({ browser }) => {
  for (const email of [emails.free2, emails.usedTrial]) {
    const { context, page } = await signedIn(browser, email);
    await page.locator(".home-featured-games").getByRole("link", { name: "Play for Free Now" }).click();
    await gameReady(page);
    // Every other protected destination is exactly as before: a non-subscriber is sent to subscription review.
    for (const path of ["/games", "/games/number-logic/play", "/games/number-cross/play", "/games/crosscalc/play", "/play", "/map-prep", "/homework", "/quizzes", "/worksheets"]) {
      const response = await page.request.get(path, { maxRedirects: 0 });
      expect([302, 303, 307, 308], `${email} ${path}`).toContain(response.status());
      expect(response.headers().location ?? "", `${email} ${path}`).toMatch(/\/subscription\?next=/);
    }
    await context.close();
  }
});

test("subscriber: Play for Free Now opens the game directly; Math Games shows Free to play and keeps other cards", async ({ browser }) => {
  const { context, page } = await signedIn(browser, emails.subscriber);
  await page.locator(".home-featured-games").getByRole("link", { name: "Play for Free Now" }).click();
  await gameReady(page);
  await expect(page.locator(".games-link")).toHaveAttribute("href", "/games");
  await page.goto("/games");
  const tugCard = page.locator("article").filter({ has: page.getByRole("heading", { name: "Math Tug of War", exact: true }) });
  await expect(tugCard.locator(".game-free-badge")).toHaveText("Free to play");
  await expect(tugCard.getByRole("link", { name: "Play for Free Now" })).toHaveAttribute("href", GAME_ROUTE);
  const others = page.locator("article").filter({ hasNot: page.locator(".game-free-badge") });
  expect(await others.count()).toBeGreaterThan(0);
  for (const card of await others.all()) {
    await expect(card.getByRole("link", { name: "Play", exact: true })).toBeVisible();
  }
  await expect(page.locator("body")).not.toContainText(/Subscribe to play/i);
  await context.close();
});

async function answerOnline(page: Page, team: Team, { wrong = false } = {}) {
  await waitForUnlocked(page, team);
  await expect(panel(page, team).locator('.key[data-key="submit"]')).toBeEnabled();
  const value = solve(await questionText(page, team)) + (wrong ? 1 : 0);
  await tapKeys(page, team, keysFor(value));
  const [response] = await Promise.all([
    page.waitForResponse((candidate) => candidate.url().endsWith("/api/games/math-tug-of-war/online") && candidate.request().postDataJSON()?.action === "answer"),
    tapKeys(page, team, ["submit"])
  ]);
  const body = await response.json();
  expect(body.state.result).toBe(wrong ? "incorrect" : "correct");
  return body.state;
}

async function onlinePair(browser: Browser, hostEmail: string, guestEmail: string, hostName: string) {
  const host = await signedIn(browser, hostEmail, GAME_ROUTE);
  const guest = await signedIn(browser, guestEmail, GAME_ROUTE);
  await gameReady(host.page);
  await host.page.locator("button[data-mode=online]").click();
  await host.page.locator("button[data-online=create]").click();
  await host.page.fill("#online-name", hostName);
  await host.page.locator("#skill-integers").check();
  await host.page.getByRole("button", { name: "Create Room" }).click();
  await expect(host.page.getByText("Waiting for opponent…")).toBeVisible();
  const code = (await host.page.locator(".code-letter").allTextContents()).join("");
  await gameReady(guest.page);
  await guest.page.locator("button[data-mode=online]").click();
  await guest.page.locator("button[data-online=join]").click();
  await guest.page.fill("#online-name", "Guest");
  await guest.page.fill("#room-code", code);
  await guest.page.getByRole("button", { name: "Join Game" }).click();
  await expect(panel(host.page, "turquoise")).toBeVisible({ timeout: 20_000 });
  await expect(panel(guest.page, "pink")).toBeVisible({ timeout: 20_000 });
  return { host, guest, code };
}

test("online: two signed-in non-subscribers create, join, answer, replay-safe, win at 7, reconnect and rematch", async ({ browser }) => {
  const { host, guest, code } = await onlinePair(browser, emails.free1, emails.free2, "Fay");
  const position = (page: Page, value: number) => expect(page.locator(".tug-scene-svg")).toHaveAttribute("data-position", String(value), { timeout: 10_000 });
  await answerOnline(host.page, "turquoise");
  await position(guest.page, -1);
  await answerOnline(guest.page, "pink", { wrong: true });
  await answerOnline(guest.page, "pink");
  await position(host.page, 0);
  // Simultaneous correct answers both count.
  await waitForUnlocked(host.page, "turquoise");
  await waitForUnlocked(guest.page, "pink");
  await tapKeys(host.page, "turquoise", keysFor(solve(await questionText(host.page, "turquoise"))));
  await tapKeys(guest.page, "pink", keysFor(solve(await questionText(guest.page, "pink"))));
  await Promise.all([tapKeys(host.page, "turquoise", ["submit"]), tapKeys(guest.page, "pink", ["submit"])]);
  await host.page.waitForTimeout(2_000);
  const row = await admin.from("tug_rooms").select("position,host_pulls,guest_pulls").eq("code", code).eq("status", "playing").single();
  expect(row.data).toMatchObject({ position: 0, host_pulls: 2, guest_pulls: 2 });
  // A replayed answer never scores.
  const replay = await host.page.evaluate(async (roomCode) => {
    const seat = JSON.parse(sessionStorage.getItem("mathnexa:math-tug-of-war:online-seat") ?? "{}");
    const response = await fetch("/api/games/math-tug-of-war/online", { method: "POST", referrerPolicy: "same-origin", headers: { "Content-Type": "application/json", "X-MathNexa-Game": "math-tug-of-war" }, body: JSON.stringify({ action: "answer", code: roomCode, token: seat.token, round: 1, questionIndex: 0, answer: "0" }) });
    return (await response.json()).state?.result;
  }, code);
  expect(replay).toBe("stale");
  // Reconnect.
  await guest.context.setOffline(true);
  await expect(host.page.locator('.opponent-card .connection[data-presence="reconnecting"]')).toBeVisible({ timeout: 25_000 });
  await guest.context.setOffline(false);
  await expect(host.page.locator('.opponent-card .connection[data-presence="connected"]')).toBeVisible({ timeout: 25_000 });
  // Seven net pulls win, on both screens.
  for (let pull = 1; pull <= 7; pull += 1) {
    await answerOnline(host.page, "turquoise");
    await position(host.page, -pull);
  }
  for (const page of [host.page, guest.page]) await expect(page.getByRole("dialog").getByRole("heading", { name: "Fay WINS!" })).toBeVisible({ timeout: 15_000 });
  // Free players' result card goes Home, not to Math Games.
  await expect(host.page.getByRole("dialog").getByRole("button", { name: "Back to Home" })).toBeVisible();
  await host.page.getByRole("dialog").getByRole("button", { name: "Play Again" }).click();
  await expect(guest.page.locator(".rematch-status")).toHaveText("Fay wants a rematch!", { timeout: 15_000 });
  await guest.page.getByRole("dialog").getByRole("button", { name: "Play Again" }).click();
  for (const page of [host.page, guest.page]) await position(page, 0);
  await guest.page.getByRole("button", { name: "Exit to game setup" }).click();
  await host.context.close();
  await guest.context.close();
});

test("online: a subscriber and a non-subscriber play the same match", async ({ browser }) => {
  const { host, guest } = await onlinePair(browser, emails.subscriber, emails.free2, "Sam");
  await answerOnline(guest.page, "pink");
  await expect(host.page.locator(".tug-scene-svg")).toHaveAttribute("data-position", "1", { timeout: 10_000 });
  await answerOnline(host.page, "turquoise");
  await expect(guest.page.locator(".tug-scene-svg")).toHaveAttribute("data-position", "0", { timeout: 10_000 });
  await guest.page.getByRole("button", { name: "Exit to game setup" }).click();
  await expect(host.page.getByRole("dialog").getByText("Guest left the match.")).toBeVisible({ timeout: 15_000 });
  await host.context.close();
  await guest.context.close();
});

test("homepage responsive: the featured cards reflow cleanly at every width and at 200% text", async ({ browser }) => {
  for (const [width, height] of [[304, 640], [320, 568], [375, 667], [390, 844], [430, 932], [768, 1024], [820, 1180], [1024, 768], [1180, 820], [1366, 768], [1920, 1080]] as Array<[number, number]>) {
    const { context, page } = await freshContext(browser, { width, height });
    await page.goto("/");
    const tug = page.locator(".home-featured-games article[data-game='math-tug-of-war']");
    await tug.scrollIntoViewIfNeeded();
    await expect(tug.getByAltText(/^Math Tug of War gameplay artwork/)).toBeVisible();
    await expect(tug.getByRole("heading", { name: "Math Tug of War" })).toBeVisible();
    const button = tug.getByRole("link", { name: "Play for Free Now" });
    await expect(button).toBeVisible();
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${width}`).toBeLessThanOrEqual(0);
    if (width <= 700) {
      const boxes = await page.locator(".home-featured-games article").evaluateAll((cards) => cards.map((card) => card.getBoundingClientRect().top));
      expect(boxes[1], `${width} stacks`).toBeGreaterThan(boxes[0]);
    }
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    // At 200% text every part of the featured cards stays inside the viewport and
    // inside its card. (The existing site footer and hero are outside this change.)
    const escaped = await page.locator(".home-featured-games").evaluate((section) => {
      const viewport = document.documentElement.clientWidth;
      return [...section.querySelectorAll("*")].filter((node) => {
        const box = node.getBoundingClientRect();
        const card = node.closest("article")?.getBoundingClientRect();
        return box.width > 0 && (box.right > viewport + 1 || box.left < -1 || (card !== undefined && box.right > card.right + 1));
      }).map((node) => `${node.tagName}.${node.className}`);
    });
    expect(escaped, `${width} @200%`).toEqual([]);
    await button.scrollIntoViewIfNeeded();
    await expect(button).toBeVisible();
    await context.close();
  }
});
