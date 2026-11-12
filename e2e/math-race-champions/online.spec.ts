import { expect, test, type Page } from "@playwright/test";

import { encodeQr, qrPath } from "../../apps/platform-web/public/internal-games/math-bingo-live/src/engine/qr.js";
import { HttpRacer } from "../../scripts/math-race-champions-racer.mjs";
import { BASE_URL, CREATOR, PAGE_ERRORS, adminClient, evidence, newPage, raceAnswer, raceFinished, signIn, waitForScreen } from "./helpers";

test.afterEach(() => {
  expect(PAGE_ERRORS).toEqual([]);
});

type Hook = { race: { driver: { raceMs(): number; car: { name: string; topSpeed: number; boost: number; decay: number }; lengthKm: number; state(): { correct: number; finishMs: number | null; x: number }; playerName: string } } };

const raceClock = (page: Page) => page.evaluate(() => (window as unknown as { __MATH_RACE__: Hook }).__MATH_RACE__.race.driver.raceMs());
const raceCar = (page: Page) => page.evaluate(() => {
  const driver = (window as unknown as { __MATH_RACE__: Hook }).__MATH_RACE__.race.driver;
  return { ...driver.car, lengthKm: driver.lengthKm };
});
const myState = (page: Page) => page.evaluate(() => (window as unknown as { __MATH_RACE__: Hook }).__MATH_RACE__.race.driver.state());

const LIGHT_GRAPHICS = () => {
  try {
    localStorage.setItem("mathnexa:math-race-champions:preferences", JSON.stringify({ sound: true, music: true, graphics: "low" }));
  } catch {
    /* storage refused: the default picture is used */
  }
};

async function waitForCountdown(page: Page): Promise<void> {
  await waitForScreen(page, "race", 30_000);
  await page.waitForFunction(() => Boolean((window as unknown as { __MATH_RACE__?: { race?: unknown } }).__MATH_RACE__?.race), null, { timeout: 30_000, polling: 50 });
}

test.describe("Online Race", () => {
  test("create a room, join by link and by code, one car for all, one start, finish order by the server", async ({ browser }) => {
    test.setTimeout(900_000);
    const admin = adminClient();

    // ---- The creator (a signed-in account; any eligible player can create) ----
    const creator = await newPage(browser, { viewport: { width: 1366, height: 768 } });
    await signIn(creator.page, CREATOR);
    await waitForScreen(creator.page, "hub");
    await creator.page.getByRole("button", { name: /Online Race/ }).click();
    await waitForScreen(creator.page, "online");
    await expect(creator.page.locator(".field-hint").first()).toContainText("Garage cars are not used online");
    await creator.page.locator("#creator-name").fill("Casey");
    await creator.page.locator('.pick-colour[data-colour="gold"]').click();
    await creator.page.getByRole("button", { name: "Create room" }).click();
    await waitForScreen(creator.page, "online-lobby");
    const code = (await creator.page.locator("#join-code").textContent())!.trim();
    expect(code).toMatch(/^[1-9]\d{5}$/);
    const link = `${BASE_URL}/join?code=${code}`;
    await expect(creator.page.locator("#join-link")).toHaveValue(link);
    // The QR code on the screen is that link, drawn locally (no QR service).
    expect(await creator.page.locator(".qr-code .qr-dark").getAttribute("d")).toBe(qrPath(encodeQr(link), 4));
    await evidence(creator.page, "online-lobby-creator-1366x768");

    // The code belongs to this game, in the one code space all live games share.
    expect((await admin.rpc("live_room_game_for_code", { p_code: code })).data).toBe("math_race_champions");

    // ---- A guest by the QR link: a phone, no account, no sign-in ----
    const ava = await newPage(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    // Three software-rendered 3D scenes at once is heavy for one test machine: the guests use the light picture.
    await ava.context.addInitScript(LIGHT_GRAPHICS);
    await ava.page.goto(`/join?code=${code}`);
    await waitForScreen(ava.page, "join");
    await expect(ava.page).toHaveTitle(/Join Math Race Champions/);
    await expect(ava.page.locator("#code")).toHaveValue(code);
    await ava.page.locator("#name").fill("Ava");
    await ava.page.locator('.pick-colour[data-colour="pink"]').click();
    await evidence(ava.page, "online-join-390x844");
    await ava.page.locator("#join-game").click();
    await waitForScreen(ava.page, "online-lobby");
    await expect(ava.page.getByRole("heading", { level: 1 })).toHaveText("You are in!");
    // No account was created and no session cookie set for the guest.
    expect((await ava.context.cookies()).filter((cookie) => cookie.name.startsWith("sb-"))).toEqual([]);

    // ---- A guest who types the code at /join (the Math Bingo Live screen) is handed over ----
    const ben = await newPage(browser, { viewport: { width: 1024, height: 768 } });
    await ben.context.addInitScript(LIGHT_GRAPHICS);
    await ben.page.goto("/join");
    await expect(ben.page).toHaveTitle(/Bingo/i);
    // Bingo's screen asks for the code, then the name; the hand-over happens when Ben joins.
    await ben.page.locator("#code").fill(code);
    await ben.page.locator("#code").press("Enter");
    await ben.page.locator("#name").fill("Ben");
    await ben.page.locator("#name").press("Enter");
    await ben.page.waitForURL((url) => url.pathname === "/join" && url.searchParams.get("code") === code, { timeout: 30_000 });
    await waitForScreen(ben.page, "online-lobby", 60_000);

    // ---- Two more racers over plain HTTP (they play exactly the same API) ----
    const cleo = new HttpRacer(BASE_URL, { name: "Cleo", colour: "green", thinkMs: 420, accuracy: 1 });
    const dev = new HttpRacer(BASE_URL, { name: "Dev", colour: "purple", thinkMs: 800, accuracy: 0.9 });
    expect((await cleo.join(code)).status).toBe(200);
    expect((await dev.join(code)).status).toBe(200);
    // A second "Ava" gets a distinct name, never the first one's seat.
    const twin = new HttpRacer(BASE_URL, { name: "Ava", colour: "red" });
    await twin.join(code);
    expect(twin.room.me.name).toBe("Ava 2");

    await expect(creator.page.locator(".player")).toHaveCount(6, { timeout: 20_000 });
    await expect(creator.page.locator(".player .tag", { hasText: "Creator" })).toHaveCount(1);

    // ---- Creator controls: remove, lock, unlock ----
    await creator.page.getByRole("button", { name: "Remove Ava 2" }).click();
    await expect(creator.page.locator(".player")).toHaveCount(5, { timeout: 20_000 });
    expect((await twin.poll()).status).toBe(410);
    await creator.page.getByRole("button", { name: "Lock joining" }).click();
    await expect(creator.page.getByRole("button", { name: "Unlock joining" })).toBeVisible({ timeout: 20_000 });
    const late = new HttpRacer(BASE_URL, { name: "Late" });
    expect((await late.join(code)).status).toBe(423);
    // A guest cannot command the room: a seat token is not a host token, and a host command needs the creator's session.
    const hijack = await ava.page.evaluate(async () => {
      const seat = JSON.parse(sessionStorage.getItem("mathnexa:math-race-champions:seat")!);
      const response = await fetch("/api/games/math-race-champions/account", {
        method: "POST",
        credentials: "same-origin",
        referrerPolicy: "same-origin",
        headers: { "Content-Type": "application/json", "X-MathNexa-Game": "math-race-champions" },
        body: JSON.stringify({ action: "host", hostToken: seat.token, command: "start" })
      });
      return response.status;
    });
    expect(hijack).toBe(401);

    // ---- Start: everyone on the same lights ----
    await creator.page.getByRole("button", { name: "Start race" }).click();
    // An answer sent before the lights go out is refused by the server.
    for (let attempt = 0; attempt < 20 && cleo.room.phase !== "COUNTDOWN"; attempt += 1) {
      await new Promise((done) => setTimeout(done, 150));
      await cleo.poll();
    }
    expect(cleo.room.phase).toBe("COUNTDOWN");
    expect((await cleo.answer(true))!.body.result).toBe("not-started");
    expect(cleo.me.correct).toBe(0);
    await Promise.all([waitForCountdown(creator.page), waitForCountdown(ava.page), waitForCountdown(ben.page)]);
    // On every screen the answer buttons stay off until that screen's clock passes the start.
    for (const page of [creator.page, ava.page, ben.page]) {
      const seen = await page.evaluate(() => ({
        at: (window as unknown as { __MATH_RACE__: { race: { driver: { raceMs(): number } } } }).__MATH_RACE__.race.driver.raceMs(),
        disabled: [...document.querySelectorAll<HTMLButtonElement>(".race-choice")].map((button) => button.disabled)
      }));
      if (seen.at < 0) expect(seen.disabled).toEqual([true, true]);
    }
    // One start for everyone: every screen, and the HTTP racers, were given the same instant on the server's clock.
    const starts = await Promise.all([creator.page, ava.page, ben.page].map((page) => page.evaluate(() => (window as unknown as { __MATH_RACE__: { race: { driver: { startsAtMs(): number } } } }).__MATH_RACE__.race.driver.startsAtMs())));
    expect(new Set([...starts, cleo.room.startsAtMs]).size).toBe(1);
    // And each screen's own race clock is close to the others' (they are read one after another on a busy machine).
    const clocks = await Promise.all([raceClock(creator.page), raceClock(ava.page), raceClock(ben.page)]);
    expect(Math.max(...clocks) - Math.min(...clocks)).toBeLessThan(4000);
    // One car for everyone: the same numbers on every screen, and not a garage car.
    const cars = await Promise.all([raceCar(creator.page), raceCar(ava.page), raceCar(ben.page)]);
    expect(cars[1]).toEqual(cars[0]);
    expect(cars[2]).toEqual(cars[0]);
    expect(cars[0]).toMatchObject({ name: "Circuit Standard", topSpeed: 180, boost: 30, lengthKm: 8 });
    // Joining after the start is closed.
    expect((await late.join(code)).status).toBe(409);


    const racing = [cleo.race(), dev.race()];

    // ---- The race, on the creator's screen ----
    await creator.page.waitForFunction(() => document.querySelector("main.race")?.getAttribute("data-phase") === "racing", null, { timeout: 60_000, polling: 100 });
    for (let index = 0; index < 6; index += 1) await raceAnswer(creator.page, true);
    for (let index = 0; index < 3; index += 1) await raceAnswer(ava.page, true);
    await raceAnswer(ben.page, true);

    // Every other racer is on the creator's minimap, and the leaderboard is live.
    await expect(creator.page.locator(".minimap-rival")).toHaveCount(4, { timeout: 20_000 });
    await expect(creator.page.locator(".hud-board li")).toHaveCount(5);
    await expect(creator.page.locator(".hud-board li.is-me")).toHaveCount(1);
    await evidence(creator.page, "online-race-creator-1366x768");
    await evidence(ava.page, "online-race-guest-390x844");

    // ---- Reconnect: a refresh comes back to the same seat with the same progress ----
    const avaBefore = await myState(ava.page);
    await ava.page.reload();
    await waitForCountdown(ava.page);
    const avaAfter = await myState(ava.page);
    expect(avaAfter.correct).toBe(avaBefore.correct);
    expect(avaAfter.x).toBeGreaterThanOrEqual(avaBefore.x);
    // The creator, too: back through the game menu into the same room and the same car.
    const creatorBefore = await myState(creator.page);
    await creator.page.reload();
    await waitForScreen(creator.page, "hub");
    await creator.page.getByRole("button", { name: /Online Race/ }).click();
    await creator.page.getByRole("button", { name: "Go back in" }).click({ timeout: 30_000 });
    await waitForCountdown(creator.page);
    expect((await myState(creator.page)).correct).toBe(creatorBefore.correct);
    // No seat was duplicated by either refresh.
    const seats = await admin.from("race_participants").select("id,status", { count: "exact" }).eq("status", "active").in("display_name", ["Casey", "Ava", "Ben", "Cleo", "Dev"]);
    expect(seats.count).toBe(5);

    // The creator keeps racing (and is a racer like any other) while the two fast racers run to the flag.
    let rounds = 0;
    while (!(cleo.finished && dev.finished) && rounds < 400) {
      if (!(await raceFinished(creator.page))) await raceAnswer(creator.page, true);
      rounds += 1;
    }
    expect(cleo.finished).toBe(true);
    expect(dev.finished).toBe(true);
    // Nobody crosses the line with fewer than 30 correct answers.
    expect(cleo.me.correct).toBeGreaterThanOrEqual(30);
    expect(dev.me.correct).toBeGreaterThanOrEqual(30);
    // An answer after the finish changes nothing.
    const done = cleo.me.correct;
    await cleo.answer(true);
    expect(cleo.me.correct).toBe(done);

    // ---- The creator ends the race for everyone still on the road ----
    if (!(await raceFinished(creator.page))) {
      await creator.page.getByRole("button", { name: "Leave the race" }).click();
      await creator.page.getByRole("button", { name: "End the race for everyone" }).click();
    }
    await Promise.all(racing);
    for (const page of [creator.page, ava.page, ben.page]) await expect(page.locator("#result-title")).toBeVisible({ timeout: 60_000 });

    // Finish order is the server's: by the moment each racer crossed the line.
    const standings = cleo.room.standings as { name: string; f: number | null; rank: number; d: number; correct: number }[];
    const finishers = standings.filter((row) => row.f !== null);
    expect(finishers.map((row) => row.name).slice(0, 2)).toEqual(["Cleo", "Dev"]);
    expect(finishers[0].f!).toBeLessThan(finishers[1].f!);
    for (let index = 1; index < finishers.length; index += 1) expect(finishers[index].f!).toBeGreaterThanOrEqual(finishers[index - 1].f!);
    expect(finishers.every((row) => row.correct >= 30)).toBe(true);
    // Racers still on the road follow, by distance.
    const unfinished = standings.filter((row) => row.f === null);
    for (let index = 1; index < unfinished.length; index += 1) expect(unfinished[index].d).toBeLessThanOrEqual(unfinished[index - 1].d);
    // The same ranking on every screen.
    const shown = await creator.page.locator(".result-ranking .name").allTextContents();
    expect(shown.map((text) => text.trim())).toEqual(standings.map((row) => row.name));
    expect((await ava.page.locator(".result-ranking .name").allTextContents()).map((text) => text.trim())).toEqual(standings.map((row) => row.name));
    await expect(ava.page.locator(".result-note")).toContainText("Everyone drove the same car");
    await evidence(creator.page, "online-results-1366x768");

    // Online racing pays nothing and touches no wallet.
    const wallets = await admin.from("race_ledger").select("id", { count: "exact", head: true }).gte("created_at", new Date(Date.now() - 20 * 60 * 1000).toISOString()).like("idempotency_key", "online%");
    expect(wallets.count ?? 0).toBe(0);

    for (const item of [creator, ava, ben]) await item.context.close();
  });

  test("/join still opens the other live games' screens, and a made-up code is nobody's", async ({ browser }) => {
    const { context, page } = await newPage(browser);
    await page.goto("/join");
    await expect(page).toHaveTitle(/Bingo/i);
    await page.goto("/join?code=999999");
    await expect(page).toHaveTitle(/Bingo/i);
    expect((await adminClient().rpc("live_room_game_for_code", { p_code: "999999" })).data).toBeNull();
    // Typing an unknown code on the race's own join API is an ordinary "not found".
    const racer = new HttpRacer(BASE_URL, { name: "Nobody" });
    expect((await racer.join("999999")).status).toBe(404);
    expect((await racer.join("12")).status).toBe(400);
    await context.close();
  });
});
