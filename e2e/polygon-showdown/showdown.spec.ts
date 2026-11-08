import { expect, test } from "@playwright/test";

import { adminClient, clickCell, createShowdown, CREATOR, endRoomIn, gameIdle, gameState, joinAsGuest, JOINER, newPage, OWNER, PAGE_ERRORS, playMoves, PLAY_ROUTE, resetAccount, saved, signIn, waitForBoardLive, waitForResults, waitForScreen } from "./helpers";

test.describe("Player-Host Showdown", () => {
  test("the creator plays from the same tab, on the same footing as everyone", async ({ browser }) => {
    const admin = adminClient();
    const creatorId = await resetAccount(admin, CREATOR.email);

    const host = await newPage(browser);
    await signIn(host.page, CREATOR);
    const code = await createShowdown(host.page, "Desmond");
    expect(code).toMatch(/^[1-9]\d{5}$/);

    // The lobby shows the way in and the creator as player one.
    await expect(host.page.locator(".qr-code")).toBeVisible();
    await expect(host.page.locator(".join-url")).toContainText("/join");
    const creatorRow = host.page.locator("#roster .roster-row").first();
    await expect(creatorRow).toContainText("Desmond");
    await expect(creatorRow).toContainText("Creator");

    const ava = await joinAsGuest(browser, code, "Ava", "Rocket");
    const zion = await joinAsGuest(browser, code, "Zion", "Panda");
    await expect(host.page.locator("#roster .roster-row")).toHaveCount(3, { timeout: 15_000 });
    await expect(ava.page.locator("#lobby-wait")).toBeVisible();

    // START: the very same tab becomes the creator's board.
    const pagesBefore = host.context.pages().length;
    const urlBefore = host.page.url();
    await host.page.locator("#start-showdown").click();
    await waitForScreen(host.page, "showdown");
    expect(host.context.pages().length).toBe(pagesBefore);
    expect(host.page.url()).toBe(urlBefore);
    await expect(host.page.locator("#countdown")).toBeVisible();

    await Promise.all([waitForBoardLive(host.page), waitForBoardLive(ava.page), waitForBoardLive(zion.page)]);

    // Everyone starts from the identical board with nothing on the scoreboard.
    const [creatorState, avaState, zionState] = await Promise.all([gameState(host.page, "showdown"), gameState(ava.page, "showdown"), gameState(zion.page, "showdown")]);
    expect(avaState.board).toBe(creatorState.board);
    expect(zionState.board).toBe(creatorState.board);
    for (const state of [creatorState, avaState, zionState]) {
      expect(state.coins).toBe(0);
      expect(state.moves).toBe(0);
    }

    // Identical swaps from identical boards give identical results: nobody's
    // random numbers are easier, the creator's included.
    const hostAfter = await playMoves(host.page, "showdown", 3);
    const avaAfter = await playMoves(ava.page, "showdown", 3);
    expect(avaAfter.board).toBe(hostAfter.board);
    expect(avaAfter.coins).toBe(hostAfter.coins);

    // Different decisions lead to different boards, and that is the game.
    const zionAfter = await playMoves(zion.page, "showdown", 1);
    expect(zionAfter.moves).toBe(1);

    // The creator is on the scoreboard, and the board stays the dominant thing.
    await saved(host.page, "showdown");
    await expect(host.page.locator("#standings")).toContainText("Desmond", { timeout: 10_000 });
    const boardBox = (await host.page.locator(".board").boundingBox())!;
    const panelBox = (await host.page.locator(".standings-panel").boundingBox())!;
    expect(boardBox.width).toBeGreaterThan(panelBox.width * 1.5);

    // Compact controls, not a dashboard.
    await host.page.locator("#showdown-controls").click();
    await expect(host.page.getByRole("heading", { name: "Showdown Controls" })).toBeVisible();
    await expect(host.page.locator("#control-players li").first()).toBeVisible();
    await host.page.locator("#control-lock").click();
    await expect(host.page.getByText("JOINING LOCKED")).toBeVisible();
    await host.page.keyboard.press("Escape");

    // A locked room refuses a late arrival.
    const blocked = await newPage(browser);
    await blocked.page.goto(`/join?code=${code}`);
    await blocked.page.locator("#name").fill("Late");
    await blocked.page.locator("#join-game").click();
    await expect(blocked.page.getByText("Joining is locked for this Showdown.")).toBeVisible();
    await blocked.context.close();

    // Reconnecting mid-game restores the same player, board and score.
    await saved(ava.page, "showdown");
    const beforeRefresh = await gameState(ava.page, "showdown");
    await ava.page.reload();
    await waitForBoardLive(ava.page);
    const afterRefresh = await gameState(ava.page, "showdown");
    expect(afterRefresh.board).toBe(beforeRefresh.board);
    expect(afterRefresh.coins).toBe(beforeRefresh.coins);
    await expect(ava.page.locator("#standings")).toContainText("Ava");

    // And the creator, including creator authority.
    await saved(host.page, "showdown");
    const hostBefore = await gameState(host.page, "showdown");
    await host.page.reload();
    await waitForBoardLive(host.page);
    const hostRestored = await gameState(host.page, "showdown");
    expect(hostRestored.coins).toBe(hostBefore.coins);
    await host.page.locator("#showdown-controls").click();
    await expect(host.page.locator("#control-end")).toBeVisible();
    await host.page.keyboard.press("Escape");

    // Ava pulls ahead; the room reaches its buzzer on the server's clock.
    await playMoves(ava.page, "showdown", 3);
    await saved(ava.page, "showdown");
    await endRoomIn(admin, code, 3);
    await Promise.all([waitForResults(host.page), waitForResults(ava.page), waitForResults(zion.page)]);

    await expect(host.page.locator("#results-title")).toHaveText("POLYGON SHOWDOWN COMPLETE");
    const first = host.page.locator("#results .result-row").first();
    await expect(first).toContainText("Ava");
    await expect(host.page.locator("#results")).toContainText("Desmond");
    await expect(host.page.locator("#results .result-row")).toHaveCount(3);

    // The signed-in creator's reward, once; the guests'  score ends with the room.
    await expect(host.page.locator("#showdown-reward")).toBeVisible();
    await expect(ava.page.locator("#guest-note")).toContainText("Sign in");
    const ledger = await admin.from("polygon_ledger").select("amount,event,idempotency_key").eq("user_id", creatorId);
    expect(ledger.data).toHaveLength(1);
    expect(ledger.data?.[0].event).toBe("EARN_SHOWDOWN");
    expect(ledger.data?.[0].amount).toBe(Math.floor(hostRestored.coins / 2));

    // A guest was never given anything permanent.
    const room = await admin.from("polygon_rooms").select("id").eq("code", code).single();
    const seats = await admin.from("polygon_participants").select("user_id,display_name").eq("room_id", room.data!.id);
    const guests = seats.data!.filter((seat) => seat.display_name !== "Desmond");
    expect(guests.every((seat) => seat.user_id === null)).toBe(true);

    // When the room is gone, so is every trace of the guests.
    await admin.from("polygon_rooms").delete().eq("id", room.data!.id);
    const after = await admin.from("polygon_participants").select("id").eq("room_id", room.data!.id);
    expect(after.data).toHaveLength(0);

    await Promise.all([host.context.close(), ava.context.close(), zion.context.close()]);
    expect(PAGE_ERRORS).toEqual([]);
  });

  test("a guest can win; the creator can win; late joiners get the board and the time left", async ({ browser }) => {
    const admin = adminClient();
    await resetAccount(admin, CREATOR.email);
    const host = await newPage(browser);
    await signIn(host.page, CREATOR);
    const code = await createShowdown(host.page, "Desmond");
    const ava = await joinAsGuest(browser, code, "Ava", null);
    await host.page.locator("#start-showdown").click();
    await Promise.all([waitForBoardLive(host.page), waitForBoardLive(ava.page)]);
    const opening = await gameState(host.page, "showdown");

    await playMoves(host.page, "showdown", 3);

    // Someone arriving late starts at zero, from the same board, with the time left.
    const omar = await joinAsGuest(browser, code, "Omar", "Star");
    await waitForBoardLive(omar.page);
    const late = await gameState(omar.page, "showdown");
    expect(late.board).toBe(opening.board);
    expect(late.coins).toBe(0);
    const clock = await omar.page.locator("#showdown-timer").textContent();
    expect(clock).toMatch(/^[0-4]:\d{2}$/);

    await saved(host.page, "showdown");
    await endRoomIn(admin, code, 2);
    await Promise.all([waitForResults(host.page), waitForResults(ava.page), waitForResults(omar.page)]);
    await expect(host.page.locator("#results .result-row").first()).toContainText("Desmond");
    await expect(host.page.locator("#results .result-row.winner")).toContainText("Creator");

    await Promise.all([host.context.close(), ava.context.close(), omar.context.close()]);
  });

  test("a signed-in joiner earns the validated reward under the same rules", async ({ browser }) => {
    const admin = adminClient();
    await resetAccount(admin, CREATOR.email);
    const joinerId = await resetAccount(admin, JOINER.email);
    const host = await newPage(browser);
    await signIn(host.page, CREATOR);
    const code = await createShowdown(host.page, "Desmond");

    const member = await newPage(browser);
    await signIn(member.page, JOINER);
    await member.page.goto(`/join?code=${code}`);
    await member.page.locator("#name").fill("Riley");
    await member.page.locator("#join-game").click();
    await waitForScreen(member.page, "lobby");

    await host.page.locator("#start-showdown").click();
    await Promise.all([waitForBoardLive(host.page), waitForBoardLive(member.page)]);
    const state = await playMoves(member.page, "showdown", 3);
    await saved(member.page, "showdown");
    await endRoomIn(admin, code, 2);
    await waitForResults(member.page);
    await expect(member.page.locator("#showdown-reward")).toBeVisible();
    const wallet = await admin.from("polygon_wallets").select("balance").eq("user_id", joinerId).single();
    expect(wallet.data?.balance).toBe(Math.floor(state.coins / 2));
    await Promise.all([host.context.close(), member.context.close()]);
  });

  test("creator authority needs the creator's session, not the room code", async ({ browser }) => {
    const admin = adminClient();
    await resetAccount(admin, CREATOR.email);
    const host = await newPage(browser);
    await signIn(host.page, CREATOR);
    const code = await createShowdown(host.page, "Desmond");
    const seat = await host.page.evaluate(() => JSON.parse(sessionStorage.getItem("mathnexa:polygon-showdown:seat")!));

    // Another signed-in account holding the room's own host token gets nowhere.
    const other = await newPage(browser);
    await signIn(other.page, OWNER);
    const attempt = await other.page.evaluate(async (hostToken) => {
      const response = await fetch("/api/games/polygon-showdown/account", {
        method: "POST", credentials: "same-origin", referrerPolicy: "same-origin",
        headers: { "Content-Type": "application/json", "X-MathNexa-Game": "polygon-showdown" },
        body: JSON.stringify({ action: "host", hostToken, command: "start" })
      });
      return response.status;
    }, seat.hostToken);
    expect(attempt).toBe(404);

    // A guest with the code cannot start or end anything: there is no such control.
    const guest = await joinAsGuest(browser, code, "Ava", null);
    await expect(guest.page.locator("#start-showdown")).toHaveCount(0);

    // A new window signed in to the creator's account can take over.
    const second = await host.context.newPage();
    await second.goto(`${PLAY_ROUTE}#showdown`);
    await waitForScreen(second, "lobby");
    await expect(second.locator("#start-showdown")).toBeVisible();
    await expect(second.locator("#roster")).toContainText("Desmond");

    await Promise.all([host.context.close(), other.context.close(), guest.context.close()]);
  });

  test("moves are checked: nothing counts before the start, or from a stale seat", async ({ browser }) => {
    const admin = adminClient();
    await resetAccount(admin, CREATOR.email);
    const host = await newPage(browser);
    await signIn(host.page, CREATOR);
    const code = await createShowdown(host.page, "Desmond");
    const guest = await joinAsGuest(browser, code, "Ava", null);

    const early = await guest.page.evaluate(async () => {
      const seat = JSON.parse(sessionStorage.getItem("mathnexa:polygon-showdown:seat")!);
      const response = await fetch("/api/games/polygon-showdown/play", {
        method: "POST", credentials: "same-origin", referrerPolicy: "same-origin",
        headers: { "Content-Type": "application/json", "X-MathNexa-Game": "polygon-showdown" },
        body: JSON.stringify({ action: "state", token: seat.token, from: 0, moves: [[0, 1, 100]] })
      });
      return response.json();
    });
    expect(early.rejected).toBe("not-running");
    expect(early.room.me.state.coins).toBe(0);

    const forged = await guest.page.evaluate(async () => {
      const response = await fetch("/api/games/polygon-showdown/play", {
        method: "POST", credentials: "same-origin", referrerPolicy: "same-origin",
        headers: { "Content-Type": "application/json", "X-MathNexa-Game": "polygon-showdown" },
        body: JSON.stringify({ action: "state", token: "x".repeat(43), from: 0, moves: [] })
      });
      return response.status;
    });
    expect(forged).toBe(404);

    await host.page.locator("#start-showdown").click();
    await Promise.all([waitForBoardLive(host.page), waitForBoardLive(guest.page)]);
    await gameIdle(guest.page, "showdown");
    await clickCell(guest.page, 0);
    await Promise.all([host.context.close(), guest.context.close()]);
  });
});

test.describe("one join page for every live game", () => {
  test("a Showdown code at /join reaches the Showdown; a Bingo code reaches Bingo", async ({ browser }) => {
    const admin = adminClient();
    await resetAccount(admin, CREATOR.email);
    const host = await newPage(browser);
    await signIn(host.page, CREATOR);
    const code = await createShowdown(host.page, "Desmond");

    // Scanned: the code in the link opens the Showdown screen directly.
    const scanned = await newPage(browser);
    await scanned.page.goto(`/join?code=${code}`);
    await expect(scanned.page.locator("body")).toHaveAttribute("class", "polygon");
    await expect(scanned.page.locator("#join-game")).toHaveText("JOIN SHOWDOWN");
    await scanned.context.close();

    // Typed on the page everyone already knows: it finds the right game,
    // keeps what was typed, and joins.
    const typed = await newPage(browser);
    await typed.page.goto("/join");
    await expect(typed.page.locator("body")).toHaveClass(/bingo/);
    await typed.page.locator("#code").fill(code);
    await typed.page.locator("form").first().evaluate((form: HTMLFormElement) => form.requestSubmit());
    await typed.page.locator("#name").fill("Typed");
    await typed.page.locator("form").first().evaluate((form: HTMLFormElement) => form.requestSubmit());
    await waitForScreen(typed.page, "lobby");
    await expect(typed.page.locator("body")).toHaveClass(/polygon/);
    await expect(host.page.locator("#roster")).toContainText("Typed", { timeout: 15_000 });
    await typed.context.close();

    // A code that belongs to nothing still gets Bingo's friendly refusal.
    const unknown = await newPage(browser);
    await unknown.page.goto("/join?code=111111");
    await expect(unknown.page.locator("body")).toHaveClass(/bingo/);
    await unknown.context.close();
    await host.context.close();
  });
});
