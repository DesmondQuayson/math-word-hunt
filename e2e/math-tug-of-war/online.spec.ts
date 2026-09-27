import { expect, test, webkit, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { GAME_ROUTE, MINUS, keysFor, panel, questionText, ropePosition, solve, tapKeys, waitForUnlocked, type Team } from "./helpers";

const url = process.env.SUPABASE_TEST_URL ?? "";
const secretKey = process.env.SUPABASE_TEST_SECRET_KEY ?? "";
const run = `tug-online-${Date.now()}`;
const password = "SyntheticAdult42!";
const emails = { a: `${run}-a@example.test`, b: `${run}-b@example.test`, c: `${run}-c@example.test` };
const userIds: string[] = [];
let admin: SupabaseClient;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  expect(url).toMatch(/^http:\/\/127\.0\.0\.1:/);
  admin = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
  for (const email of Object.values(emails)) {
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (!created.data.user || created.error) throw created.error ?? new Error("Synthetic subscriber unavailable.");
    userIds.push(created.data.user.id);
    const startsAt = new Date();
    const account = await admin.from("consumer_accounts").update({ trial_redeemed_at: startsAt.toISOString() }).eq("user_id", created.data.user.id);
    if (account.error) throw account.error;
    const entitlement = await admin.from("consumer_game_entitlements").insert({
      user_id: created.data.user.id,
      entitlement_state: "trial-active",
      trial_started_at: startsAt.toISOString(),
      trial_ends_at: new Date(startsAt.getTime() + 86_400_000).toISOString()
    });
    if (entitlement.error) throw entitlement.error;
  }
});

test.afterAll(async () => {
  // Ephemeral by design: remove the synthetic people and their rooms.
  await admin.from("tug_rooms").delete().in("host_name", ["Ava", "Aria", "Ana"]);
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
});

async function signedIn(browser: Browser, email: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ baseURL: process.env.MATH_TUG_OF_WAR_ONLINE_URL ?? "http://127.0.0.1:3000" });
  const page = await context.newPage();
  if (process.env.TUG_DEBUG) {
    page.on("console", message => console.log("[console]", message.type(), message.text()));
    page.on("response", response => { if (response.status() >= 400) console.log("[http]", response.status(), response.url()); });
  }
  await page.goto(`/sign-in?next=${encodeURIComponent(GAME_ROUTE)}`);
  await page.getByLabel("Email address").fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(url => !url.pathname.startsWith("/sign-in"), { timeout: 30_000 });
  await page.goto(GAME_ROUTE);
  // The first request compiles the route under next dev.
  await expect(page.getByRole("heading", { level: 1, name: /Math Tug of War/ })).toBeVisible({ timeout: 90_000 });
  return { context, page };
}

async function createRoom(page: Page, name: string, skill: string) {
  await page.locator("button[data-mode=online]").click();
  await page.locator("button[data-online=create]").click();
  await page.fill("#online-name", name);
  await page.locator(`#skill-${skill}`).check();
  await page.getByRole("button", { name: "Create Room" }).click();
  await expect(page.getByText("Waiting for opponent…")).toBeVisible();
  const code = (await page.locator(".code-letter").allTextContents()).join("");
  expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/);
  return code;
}

async function joinRoom(page: Page, name: string, code: string) {
  await page.locator("button[data-mode=online]").click();
  await page.locator("button[data-online=join]").click();
  await page.fill("#online-name", name);
  await page.fill("#room-code", code.toLowerCase());
  await page.getByRole("button", { name: "Join Game" }).click();
}

async function inGame(page: Page, team: Team) {
  await expect(panel(page, team)).toBeVisible({ timeout: 20_000 });
  await expect(panel(page, team).locator(".question-text")).not.toHaveText("");
}

async function answerOnline(page: Page, team: Team, { wrong = false } = {}) {
  await waitForUnlocked(page, team);
  await expect(panel(page, team).locator('.key[data-key="submit"]')).toBeEnabled();
  const text = await questionText(page, team);
  const value = solve(text) + (wrong ? 1 : 0);
  await tapKeys(page, team, keysFor(value));
  const [response] = await Promise.all([
    page.waitForResponse(candidate => candidate.url().endsWith("/api/games/math-tug-of-war/online") && candidate.request().postDataJSON()?.action === "answer"),
    tapKeys(page, team, ["submit"])
  ]);
  // The authoritative verdict comes from the server, not the page.
  expect((await response.json()).state.result).toBe(wrong ? "incorrect" : "correct");
}

async function position(page: Page, expected: number) {
  await expect(page.locator(".tug-scene-svg")).toHaveAttribute("data-position", String(expected), { timeout: 10_000 });
}

test("two clients: create, join, synchronized pulls, simultaneous answers, win, rematch, disconnect, leave", async ({ browser }) => {
  const a = await signedIn(browser, emails.a);
  const b = await signedIn(browser, emails.b);
  const code = await createRoom(a.page, "Ava", "integers");
  await joinRoom(b.page, "<b>Bo</b>", code);

  // Ready card on both, then the synchronized match.
  await expect(b.page.getByRole("heading", { name: "Both players ready" })).toBeVisible();
  await expect(a.page.getByRole("heading", { name: "Both players ready" })).toBeVisible({ timeout: 10_000 });
  await inGame(a.page, "turquoise");
  await inGame(b.page, "pink");
  await expect(a.page.locator(".team-panel.team-pink")).toHaveCount(0);
  await expect(b.page.locator(".team-panel.team-turquoise")).toHaveCount(0);
  for (const page of [a.page, b.page]) {
    await expect(page.locator(".skill-chip .skill-full")).toHaveText("Addition & Subtraction of Integers");
    await expect(page.locator(".vs-t")).toHaveText("Ava");
    await expect(page.locator(".vs-p")).toHaveText("bBo/b");
    await expect(page.locator(".vs-p b")).toHaveCount(0);
  }
  await expect(a.page.locator(".opponent-card .connection")).toHaveAttribute("data-presence", "connected");

  // A pulls: both screens show it.
  await answerOnline(a.page, "turquoise");
  await position(a.page, -1);
  await position(b.page, -1);
  // B pulls back.
  await answerOnline(b.page, "pink");
  await position(b.page, 0);
  await position(a.page, 0);
  // Wrong answers never pull.
  await answerOnline(b.page, "pink", { wrong: true });
  await expect(b.page.locator(".team-panel.team-pink .panel-feedback")).toContainText("Answer:");
  await b.page.waitForTimeout(1_500);
  expect(await ropePosition(a.page)).toBe(0);
  expect(await ropePosition(b.page)).toBe(0);

  // Near-simultaneous correct answers: both count, rope nets to zero.
  await waitForUnlocked(a.page, "turquoise");
  await waitForUnlocked(b.page, "pink");
  const valueA = solve(await questionText(a.page, "turquoise"));
  const valueB = solve(await questionText(b.page, "pink"));
  await tapKeys(a.page, "turquoise", keysFor(valueA));
  await tapKeys(b.page, "pink", keysFor(valueB));
  await Promise.all([
    a.page.locator('.team-panel.team-turquoise .key[data-key="submit"]').click(),
    b.page.locator('.team-panel.team-pink .key[data-key="submit"]').click()
  ]);
  for (const page of [a.page, b.page]) {
    await expect(page.locator(".team-panel .panel-pulls, .opponent-card .opponent-pulls").filter({ hasText: "Pulls: 2" })).toHaveCount(2, { timeout: 10_000 });
    await position(page, 0);
  }
  const record = await admin.from("tug_rooms").select("position,host_pulls,guest_pulls,host_question_index,guest_question_index").eq("code", code).eq("status", "playing").single();
  expect(record.data).toMatchObject({ position: 0, host_pulls: 2, guest_pulls: 2, host_question_index: 2, guest_question_index: 3 });

  // Win: Ava needs 7 net pulls from the centre.
  for (let pull = 1; pull <= 7; pull += 1) {
    await answerOnline(a.page, "turquoise");
    await position(a.page, -pull);
  }
  for (const page of [a.page, b.page]) {
    await expect(page.getByRole("dialog").getByRole("heading", { name: "Ava WINS!" })).toBeVisible({ timeout: 10_000 });
  }

  // Rematch needs both players.
  await a.page.getByRole("dialog").getByRole("button", { name: "Play Again" }).click();
  await expect(a.page.locator(".rematch-status")).toHaveText("Waiting for bBo/b to play again…");
  await expect(b.page.locator(".rematch-status")).toHaveText("Ava wants a rematch!", { timeout: 10_000 });
  await b.page.getByRole("dialog").getByRole("button", { name: "Play Again" }).click();
  for (const page of [a.page, b.page]) {
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 10_000 });
    await position(page, 0);
  }
  await answerOnline(b.page, "pink");
  await position(a.page, 1);

  // Temporary disconnect: B drops off the network.
  await b.context.setOffline(true);
  await expect(b.page.locator(".game-banner")).toHaveText("Reconnecting…", { timeout: 15_000 });
  await expect(a.page.locator(".opponent-card .connection")).toHaveAttribute("data-presence", "reconnecting", { timeout: 20_000 });
  await expect(a.page.locator(".team-panel.team-turquoise .key").first()).toBeDisabled();
  // A long disconnect shows the choice; no victory is awarded.
  const away = a.page.getByRole("dialog");
  await expect(away.getByRole("heading", { name: "Opponent disconnected" })).toBeVisible({ timeout: 45_000 });
  await expect(away.getByRole("button", { name: "Wait" })).toBeVisible();
  await expect(away.getByRole("button", { name: "Return to Math Games" })).toBeVisible();
  expect(await ropePosition(a.page)).toBe(1);
  await away.getByRole("button", { name: "Wait" }).click();
  // Reconnect: same seat, same match.
  await b.context.setOffline(false);
  await expect(a.page.locator(".opponent-card .connection")).toHaveAttribute("data-presence", "connected", { timeout: 20_000 });
  await expect(b.page.locator(".game-banner")).not.toHaveText("Reconnecting…", { timeout: 15_000 });
  await answerOnline(a.page, "turquoise");
  await position(b.page, 0);

  // Reload reconnect: the seat survives a page reload in the same tab.
  await b.page.reload();
  await b.page.locator("button[data-mode=online]").click();
  await b.page.getByRole("button", { name: `Return to room ${code}` }).click();
  await inGame(b.page, "pink");
  await position(b.page, 0);

  // Leaving ends the match for both, without a fake win.
  await b.page.getByRole("button", { name: "Exit to game setup" }).click();
  await expect(a.page.getByRole("dialog").getByText("bBo/b left the match.")).toBeVisible({ timeout: 10_000 });
  await expect(a.page.getByRole("dialog").getByRole("heading", { name: /WINS/ })).toHaveCount(0);

  await a.context.close();
  await b.context.close();
});

test("failure cases: unknown, full, duplicate and expired rooms", async ({ browser }) => {
  const a = await signedIn(browser, emails.a);
  const b = await signedIn(browser, emails.b);
  const c = await signedIn(browser, emails.c);

  await joinRoom(c.page, "Cy", "ZZZZ9");
  await expect(c.page.getByRole("alert")).toHaveText("No game was found with that room code.");
  await c.page.getByRole("button", { name: "Back" }).click();
  await c.page.getByRole("button", { name: "Back" }).click();

  const code = await createRoom(a.page, "Aria", "absolute");
  await joinRoom(b.page, "Ben", code);
  await inGame(b.page, "pink");
  await joinRoom(c.page, "Cy", code);
  await expect(c.page.getByRole("alert")).toHaveText("That room already has two players.");

  // A second join from a player already seated in the room is also refused.
  const second = await b.context.newPage();
  await second.goto(GAME_ROUTE);
  await joinRoom(second, "Ben", code);
  await expect(second.getByRole("alert")).toHaveText("That room already has two players.");

  await c.page.goto(GAME_ROUTE);
  const stale = await createRoom(c.page, "Ana", "addition");
  await admin.from("tug_rooms").update({ expires_at: new Date(Date.now() - 1_000).toISOString() }).eq("code", stale).eq("status", "waiting");
  const d = await b.context.newPage();
  await d.goto(GAME_ROUTE);
  await joinRoom(d, "Ben", stale);
  await expect(d.getByRole("alert")).toHaveText("That room has expired. Ask for a new room code.");
  await expect(c.page.getByRole("alert")).toContainText(/expired/, { timeout: 10_000 });

  await a.context.close();
  await b.context.close();
  await c.context.close();
});

test("security: the API cannot be driven to a win, replayed, impersonated or used without access", async ({ browser, playwright }) => {
  const a = await signedIn(browser, emails.a);
  const api = async (page: Page, body: unknown, headers: Record<string, string> = {}) => page.evaluate(async ({ body, headers }) => {
    const response = await fetch("/api/games/math-tug-of-war/online", {
      method: "POST",
      referrerPolicy: "same-origin",
      headers: { "Content-Type": "application/json", "X-MathNexa-Game": "math-tug-of-war", ...headers },
      body: JSON.stringify(body)
    });
    return { status: response.status, body: await response.json().catch(() => null) as Record<string, unknown> | null };
  }, { body, headers });

  const created = await api(a.page, { action: "create", name: "Ava", skill: "multiplication" });
  expect(created.status).toBe(200);
  const code = (created.body!.state as { code: string }).code;
  const hostToken = created.body!.token as string;
  expect(JSON.stringify(created.body)).not.toMatch(/seed|hash/i);

  const b = await signedIn(browser, emails.b);
  const joined = await api(b.page, { action: "join", name: "Bo", code });
  expect(joined.status).toBe(200);
  const guestToken = joined.body!.token as string;
  const state = joined.body!.state as { question: { index: number; text: string }; round: number };
  expect(state.question.text).toMatch(/×/);
  expect(JSON.stringify(joined.body)).not.toMatch(/"answer"|seed/i);

  // A wrong answer with a forged "correct"/"position" never pulls.
  const forged = await api(b.page, { action: "answer", code, token: guestToken, round: 1, questionIndex: 0, answer: String(solve(state.question.text) + 1), correct: true, position: 5, winner: "pink" });
  expect((forged.body!.state as { position: number; result: string }).position).toBe(0);
  expect((forged.body!.state as { result: string }).result).toBe("incorrect");
  // Replaying an answered question is stale and cannot score.
  const replay = await api(b.page, { action: "answer", code, token: guestToken, round: 1, questionIndex: 0, answer: String(solve(state.question.text)) });
  expect((replay.body!.state as { result: string }).result).toBe("stale");
  expect((replay.body!.state as { pulls: { pink: number } }).pulls.pink).toBe(0);
  // Guessing a token does not give a seat; a guest token is always Pink.
  expect((await api(b.page, { action: "state", code, token: "A".repeat(43) })).status).toBe(404);
  expect(((await api(b.page, { action: "state", code, token: guestToken })).body!.state as { team: string }).team).toBe("pink");
  expect(((await api(a.page, { action: "state", code, token: hostToken })).body!.state as { team: string }).team).toBe("turquoise");
  // Room guessing reveals nothing.
  expect(await api(b.page, { action: "join", name: "X", code: "ZZZZ8" })).toEqual({ status: 404, body: { error: "room-not-found" } });
  // CSRF-style requests and unauthenticated callers are refused.
  expect((await api(a.page, { action: "state", code, token: hostToken }, { "X-MathNexa-Game": "" })).status).toBe(403);
  const anonymous = await playwright.request.newContext({ baseURL: process.env.MATH_TUG_OF_WAR_ONLINE_URL ?? "http://127.0.0.1:3000" });
  const unauth = await anonymous.post("/api/games/math-tug-of-war/online", {
    headers: { "Content-Type": "application/json", "X-MathNexa-Game": "math-tug-of-war", "Sec-Fetch-Site": "same-origin" },
    data: { action: "create", name: "Eve", skill: "addition" }
  });
  expect(unauth.status()).toBe(401);
  const crossSite = await anonymous.post("/api/games/math-tug-of-war/online", {
    headers: { "Content-Type": "application/json", "X-MathNexa-Game": "math-tug-of-war", Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site" },
    data: { action: "create", name: "Eve", skill: "addition" }
  });
  expect(crossSite.status()).toBe(403);
  await anonymous.dispose();
  // Service credentials never reach the browser.
  const documentText = await a.page.evaluate(async () => (await fetch(location.href)).text());
  expect(documentText).not.toMatch(/service_role|SUPABASE_SECRET|sb_secret/);
  const scripts = await a.page.evaluate(async () => {
    const sources = ["app.js", "online.js", "questions.js", "tug.js"];
    const bodies = await Promise.all(sources.map(file => fetch(`/internal-games/math-tug-of-war/src/${file}`).then(response => response.text())));
    return bodies.join("\n");
  });
  expect(scripts).not.toMatch(/service_role|SUPABASE_SECRET|sb_secret|supabase\.co/);

  await api(a.page, { action: "leave", code, token: hostToken });
  await a.context.close();
  await b.context.close();
});

test("WebKit interoperability: a Chromium host and a WebKit guest share one match", async ({ browser }) => {
  const a = await signedIn(browser, emails.a);
  const safari = await webkit.launch();
  try {
    const b = await signedIn(safari, emails.b);
    const code = await createRoom(a.page, "Ava", "opposite");
    await joinRoom(b.page, "Bo", code);
    await inGame(a.page, "turquoise");
    await inGame(b.page, "pink");
    await expect(b.page.locator(".team-panel.team-pink .key-sign")).toHaveCount(2);
    await answerOnline(b.page, "pink");
    await position(a.page, 1);
    await answerOnline(a.page, "turquoise");
    await position(b.page, 0);
    expect(await b.page.locator(".team-panel.team-pink .question-text").textContent()).toMatch(new RegExp(`opposite of ${MINUS}?\\d`));
    await b.page.getByRole("button", { name: "Exit to game setup" }).click();
    await b.context.close();
  } finally {
    await safari.close();
  }
  await a.context.close();
});

// Owner review pack only (TUG_REVIEW_PACK_DIR=...): the Math Games card and the
// Online Match screens as two phones see them.
test("review pack: Math Games card, lobby, ready and phone Online Match", async ({ browser }) => {
  const dir = process.env.TUG_REVIEW_PACK_DIR;
  test.skip(!dir, "set TUG_REVIEW_PACK_DIR to capture the owner review pack");
  const shot = (page: Page, name: string) => page.screenshot({ path: `${dir}/${name}.png` });
  const a = await signedIn(browser, emails.a);
  await a.page.setViewportSize({ width: 1366, height: 900 });
  await a.page.goto("/games");
  const card = a.page.locator("article").filter({ has: a.page.getByRole("heading", { name: "Math Tug of War", exact: true }) });
  await card.scrollIntoViewIfNeeded();
  await expect(card.getByAltText("Math Tug of War gameplay artwork")).toBeVisible();
  // Hide the local next dev indicator; it is not part of the product.
  await a.page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await a.page.waitForTimeout(600);
  await shot(a.page, "01-math-games-card");
  await card.getByRole("link", { name: "Play" }).click();
  await expect(a.page.getByRole("heading", { level: 1, name: /Math Tug of War/ })).toBeVisible({ timeout: 60_000 });
  await a.page.setViewportSize({ width: 390, height: 844 });
  const code = await createRoom(a.page, "Ava", "integers");
  await shot(a.page, "05-online-create-game-room-code");
  const b = await signedIn(browser, emails.b);
  await b.page.setViewportSize({ width: 390, height: 844 });
  await joinRoom(b.page, "Bo", code);
  await expect(b.page.getByRole("heading", { name: "Both players ready" })).toBeVisible();
  await shot(b.page, "06-online-join-game-ready");
  await inGame(a.page, "turquoise");
  await inGame(b.page, "pink");
  await answerOnline(a.page, "turquoise");
  await position(b.page, -1);
  await b.page.waitForTimeout(900);
  await shot(b.page, "23-phone-online-match-pink");
  await shot(a.page, "23b-phone-online-match-turquoise");
  await b.page.getByRole("button", { name: "Exit to game setup" }).click();
  await a.context.close();
  await b.context.close();
});
