import { expect, test, type APIRequestContext } from "@playwright/test";

import { BASE_URL, PAGE_ERRORS, closeRoom, createGame, hostNext, joinPlayer, signInTeacher, state, waitFor, startGame } from "./helpers";

test.describe.configure({ mode: "serial" });

test.afterEach(() => {
  expect(PAGE_ERRORS, PAGE_ERRORS.join("\n")).toEqual([]);
});

const PLAY = "/api/games/math-bingo-live/play";
const HOST = "/api/games/math-bingo-live/host";
const SAME_ORIGIN = { "Content-Type": "application/json", "X-MathNexa-Game": "math-bingo-live", "Sec-Fetch-Site": "same-origin", Origin: BASE_URL };

async function post(request: APIRequestContext, path: string, body: unknown, headers: Record<string, string> = SAME_ORIGIN) {
  const response = await request.post(path, { headers, data: JSON.stringify(body), failOnStatusCode: false, maxRedirects: 0 });
  let json: Record<string, unknown> = {};
  try {
    json = await response.json();
  } catch {
    json = {};
  }
  return { status: response.status(), json, headers: response.headers() };
}

test("API boundaries: same-origin JSON only, anonymous cannot host, malformed input refused", async ({ request }) => {
  expect((await post(request, PLAY, { action: "state" }, { "Content-Type": "application/json" })).status).toBe(403);
  expect((await post(request, PLAY, { action: "state" }, { ...SAME_ORIGIN, "Sec-Fetch-Site": "cross-site" })).status).toBe(403);
  expect((await post(request, PLAY, { action: "state" }, { ...SAME_ORIGIN, "Content-Type": "text/plain" })).status).toBe(415);
  expect((await post(request, PLAY, "x".repeat(5000))).status).toBe(413);
  expect((await request.get(PLAY, { failOnStatusCode: false })).status()).toBe(405);
  expect((await post(request, HOST, { action: "create", settings: {} })).status).toBe(401);
  expect((await post(request, HOST, { action: "resume" })).status).toBe(401);
  const join = await post(request, PLAY, { action: "join", code: "12345", name: "Ava" });
  expect([join.status, join.json.error]).toEqual([400, "invalid-code"]);
  const missing = await post(request, PLAY, { action: "state", token: "not-a-token" });
  expect([missing.status, missing.json.error]).toEqual([404, "seat-not-found"]);
  const reply = await post(request, PLAY, { action: "state", token: "A".repeat(43) });
  expect(reply.status).toBe(404);
  expect(reply.headers["cache-control"]).toContain("no-store");
});

test("names are escaped text, hidden answers stay hidden, rooms are isolated, code guessing is limited", async ({ browser, request }) => {
  const host = await signInTeacher(browser);
  const room = await createGame(host.page, { questionSeconds: 0, revealSeconds: 0 });

  // Markup in a name is refused outright; punctuation names are shown as text.
  for (const name of ["<img src=x onerror=alert(1)>", "<b>Ava</b>", "\"><script>", "A", "x".repeat(21), "   "]) {
    const result = await post(request, PLAY, { action: "join", code: room.code, name });
    expect(result.status, name).toBe(400);
  }
  const player = await joinPlayer(browser, room.code, "O'Brien-Lee");
  await expect(host.page.locator(".roster-name").first()).toHaveText("O'Brien-Lee");
  expect(await host.page.locator(".roster img, .roster script").count()).toBe(0);
  // Duplicate names stay distinguishable.
  const duplicate = await post(request, PLAY, { action: "join", code: room.code, name: "o'brien-lee" });
  expect(duplicate.status).toBe(200);
  expect((duplicate.json.state as { me: { name: string } }).me.name).toBe("o'brien-lee 2");
  const extraToken = duplicate.json.token as string;

  await startGame(host.page);
  await waitFor(player.page, current => Boolean(current.me?.board) && current.phase === "QUESTION_ACTIVE", "question");

  // During a question, no payload carries its answer, the seed, the pool or the deck.
  const live = await post(request, PLAY, { action: "state", token: extraToken });
  const text = JSON.stringify(live.json);
  const question = (live.json.state as { question: { reveal: unknown; number: number } }).question;
  expect(question.reveal).toBeNull();
  expect(text).not.toMatch(/"(seed|pool|deck|tokenHash|token_hash|ownerHash)"/);
  expect((live.json.state as { called: unknown[] }).called).toHaveLength(question.number);
  const hostText = JSON.stringify(await state(host.page));
  expect(hostText).not.toMatch(/"(seed|pool|deck)"/);
  expect((await state(host.page)).question!.reveal).toBeNull();

  // A player cannot mark someone else's card, change settings, or declare a winner.
  const forged = await post(request, PLAY, { action: "mark", token: extraToken, game: 1, question: question.number, cell: 99 });
  expect(forged.status).toBe(400);
  for (const action of ["bingo", "settings", "win", "next", "remove"]) {
    expect((await post(request, PLAY, { action, token: extraToken })).status, action).toBe(400);
  }

  // Code guessing: failed joins from one address are limited (pgTAP proves the exact threshold).
  const guesser = { ...SAME_ORIGIN, "x-vercel-forwarded-for": `198.51.100.${Date.now() % 200}` };
  let limited = false;
  for (let attempt = 0; attempt < 45 && !limited; attempt += 1) {
    const result = await post(request, PLAY, { action: "join", code: String(100000 + ((Date.now() + attempt * 7919) % 899999)), name: "Guess" }, guesser);
    if (result.status === 429) limited = true;
    else expect([404, 410, 423, 200]).toContain(result.status);
  }
  expect(limited).toBe(true);
  // ...without locking out the classroom's own address.
  expect((await post(request, PLAY, { action: "state", token: extraToken })).status).toBe(200);

  await closeRoom(host.page);
  await host.context.close();
  await player.context.close();
});

test("free access: a free teacher hosts Bingo but still cannot open protected games; students need no account", async ({ browser, request }) => {
  // Anonymous: /join works, the host screen asks for sign-in, paid games stay closed.
  const anonymous = await request.get("/join", { failOnStatusCode: false, maxRedirects: 0 });
  expect(anonymous.status()).toBe(200);
  expect(anonymous.headers()["set-cookie"] ?? "").not.toMatch(/sb-|session/i);
  expect(anonymous.headers()["content-security-policy"]).toContain("connect-src 'self'");
  const hostAnonymous = await request.get("/games/math-bingo-live/host", { failOnStatusCode: false, maxRedirects: 0 });
  expect(hostAnonymous.status()).toBe(307);
  expect(hostAnonymous.headers().location).toContain("/access?next=/games/math-bingo-live/host");
  for (const path of ["/games/number-logic/play", "/games/number-cross/play", "/games/crosscalc/play", "/play"]) {
    const response = await request.get(path, { failOnStatusCode: false, maxRedirects: 0 });
    expect([303, 307, 308, 404], path).toContain(response.status());
  }

  // The free teacher: hosts Bingo, but the entitled games still redirect.
  const host = await signInTeacher(browser);
  for (const path of ["/games/number-logic/play", "/games/number-cross/play", "/games/crosscalc/play"]) {
    const response = await host.page.request.get(path, { failOnStatusCode: false, maxRedirects: 0 });
    expect(response.status(), path).not.toBe(200);
  }
  const games = await host.page.request.get("/games", { failOnStatusCode: false, maxRedirects: 0 });
  expect(games.status()).not.toBe(200);
  // The draft is not in any catalog.
  const catalog = await host.page.request.get("/math-games", { failOnStatusCode: false });
  expect(await catalog.text()).not.toContain("Math Bingo Live");
  await host.context.close();
});
