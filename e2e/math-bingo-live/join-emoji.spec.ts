import { expect, test } from "@playwright/test";

import { encodeQr, qrPath } from "../../apps/platform-web/public/internal-games/math-bingo-live/src/engine/qr.js";
import {
  BASE_URL,
  JOIN_ROUTE,
  PAGE_ERRORS,
  createGame,
  front,
  joinPlayer,
  markBest,
  newContext,
  signInTeacher,
  startGame,
  state,
  useFreeSpace,
  waitFor,
  watchErrors
} from "./helpers";

test.describe.configure({ mode: "serial" });

test.afterEach(() => {
  expect(PAGE_ERRORS, PAGE_ERRORS.join("\n")).toEqual([]);
});

/**
 * QR joining and emoji identity, end to end:
 *   * the lobby QR encodes this environment's own /join?code=… link (checked
 *     against the encoder, which the unit tests decode independently);
 *   * the link opens the name screen with the room already identified;
 *   * the numeric code still works by hand; Lock Join shows JOINING LOCKED and
 *     refuses late joiners until unlocked; a late joiner gets a card;
 *   * emoji: chosen, Random, none, shared; kept on reload; shown in the
 *     lobby, standings, Free Space and Bingo announcements, winners, podium.
 */
test("QR join, numeric code, Lock Join, late join, and emoji everywhere", async ({ browser }) => {
  test.setTimeout(900_000);
  const host = await signInTeacher(browser);
  const created = await createGame(host.page, { mode: "addition", level: "facts-20", questionSeconds: 0, revealSeconds: 0, winners: 1 });
  const code = created.code;
  const link = `${new URL(BASE_URL).origin}${JOIN_ROUTE}?code=${code}`;

  // Lobby: JOIN MATH BINGO LIVE, a large QR for this room, OR, the address, the code.
  await expect(host.page.locator(".join-heading")).toHaveText("JOIN MATH BINGO LIVE");
  const qr = host.page.locator(".join-qr svg.qr-code");
  await expect(qr).toBeVisible();
  await expect(qr).toHaveAttribute("aria-label", new RegExp(`game code ${code.split("").join(" ")}$`));
  expect(await qr.locator("path.qr-dark").getAttribute("d")).toBe(qrPath(encodeQr(link), 4));
  const box = await qr.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(180);
  await expect(host.page.locator(".join-or")).toHaveText("OR");
  await expect(host.page.locator(".join-url")).toHaveText(`${new URL(BASE_URL).host}/join`);
  await expect(host.page.locator(".join-code .code-display")).toHaveAttribute("aria-label", `Code ${code.split("").join(" ")}`);

  // Ava scans the QR: the room is already identified; name + Lion; JOIN GAME.
  const ava = await joinPlayer(browser, code, "Ava", {}, "Lion");
  await expect(ava.page.locator(".youre-in-name")).toHaveText("\u{1F981} Ava");

  // Zion types the numeric code by hand and lets Random choose.
  const zionContext = await newContext(browser, { viewport: { width: 360, height: 740 }, hasTouch: true });
  const zion = await zionContext.newPage();
  watchErrors(zion);
  await zion.goto(JOIN_ROUTE);
  await front(zion);
  await zion.getByLabel("GAME CODE").fill(`${code.slice(0, 3)} ${code.slice(3)}`);
  await zion.getByRole("button", { name: "Next" }).click();
  await zion.getByLabel("YOUR NAME").fill("Zion");
  await zion.getByRole("button", { name: "Random" }).click();
  const firstPick = await zion.locator("input.emoji-radio:checked").getAttribute("value");
  await zion.getByRole("button", { name: "Random" }).click();
  const secondPick = await zion.locator("input.emoji-radio:checked").getAttribute("value");
  expect(firstPick).toBeTruthy();
  expect(secondPick).toBeTruthy();
  expect(secondPick).not.toBe(firstPick);
  await expect(zion.locator(".join-preview")).toHaveText(`You'll appear as ${secondPick} Zion`);
  await zion.getByRole("button", { name: "JOIN GAME" }).click();
  await expect(zion.getByText("You're in!")).toBeVisible();
  await expect(zion.locator(".youre-in-name")).toHaveText(`${secondPick} Zion`);

  // Omar: no emoji. Mia: the same Lion as Ava (allowed).
  const omar = await joinPlayer(browser, code, "Omar");
  await expect(omar.page.locator(".youre-in-name")).toHaveText("Omar");
  const mia = await joinPlayer(browser, code, "Mia", {}, "Lion");
  await expect(mia.page.locator(".youre-in-name")).toHaveText("\u{1F981} Mia");
  for (const label of ["\u{1F981} Ava", `${secondPick} Zion`, "Omar", "\u{1F981} Mia"]) await expect(host.page.locator(".roster")).toContainText(label);
  await expect(host.page.getByRole("button", { name: "Remove Ava (lion)" })).toBeVisible();

  // A reload keeps the seat and the emoji (never asks again).
  await ava.page.reload();
  await expect(ava.page.locator(".youre-in-name")).toHaveText("\u{1F981} Ava");

  // Lock Join: JOINING LOCKED, no QR or code; a late student is refused.
  await front(host.page);
  await host.page.locator(".lobby-buttons").getByRole("button", { name: "Lock joining" }).click();
  await expect(host.page.locator(".join-locked-title")).toHaveText("JOINING LOCKED");
  await expect(host.page.locator(".join-qr svg")).toBeHidden();
  await expect(host.page.locator(".join-code")).toBeHidden();
  const lateContext = await newContext(browser);
  const late = await lateContext.newPage();
  watchErrors(late);
  await late.goto(`${JOIN_ROUTE}?code=${code}`);
  await late.getByLabel("YOUR NAME").fill("Late");
  await late.getByRole("button", { name: "JOIN GAME" }).click();
  await expect(late.locator(".form-error")).toHaveText("Joining is locked for this game. Ask your teacher.");

  // Start; then the live board's compact QR (opens large) and the lock state.
  await host.page.locator(".lobby-buttons").getByRole("button", { name: "Joining locked" }).click();
  await expect(host.page.locator(".join-qr svg")).toBeVisible();
  await startGame(host.page);
  const headQr = host.page.locator(".head-join .head-qr svg.qr-code");
  await expect(headQr).toBeVisible();
  expect(await headQr.locator("path.qr-dark").getAttribute("d")).toBe(qrPath(encodeQr(link), 4));
  const headBox = await headQr.boundingBox();
  expect(headBox!.height).toBeLessThan(80);
  await host.page.getByRole("button", { name: "Show the join QR code large" }).click();
  const dialog = host.page.locator("dialog.qr-dialog");
  await expect(dialog).toBeVisible();
  expect((await dialog.locator("svg.qr-code").boundingBox())!.width).toBeGreaterThan(300);
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toHaveCount(0);
  // Winning Ways stays visible with the QR in the header.
  await expect(host.page.locator(".ways-strip .rules")).toBeVisible();

  // A late joiner while joining is open gets a card in the running game.
  await late.goto(`${JOIN_ROUTE}?code=${code}`);
  await late.getByLabel("YOUR NAME").fill("Late");
  await late.getByLabel("Rocket", { exact: true }).check({ force: true });
  await late.getByRole("button", { name: "JOIN GAME" }).click();
  await waitFor(late, current => Boolean(current.me?.board) && current.gameNumber === 1, "late joiner's card");
  await expect(late.locator(".strip-name")).toHaveText("\u{1F680} Late");

  await front(host.page);
  await host.page.locator(".controls").getByRole("button", { name: "Lock join" }).click();
  await expect(host.page.locator(".head-locked")).toHaveText("JOINING LOCKED");
  await expect(host.page.locator(".head-qr")).toHaveCount(0);

  // Free Space announcement with Omar's (no emoji) and Mia's (Lion) names.
  expect(await useFreeSpace(mia.page)).toBe("free-space");
  await expect(host.page.locator(".board-left > .banner")).toContainText("\u{1F981} MIA USED FREE SPACE!");
  await expect(ava.page.locator(".banner:not([hidden])")).toContainText("\u{1F981} MIA USED FREE SPACE!");

  // Ava plays to Bingo; the others hold so she wins first (winners: 1).
  for (let guard = 0; guard < 40; guard += 1) {
    const current = await waitFor(host.page, now => now.phase === "QUESTION_ACTIVE" || now.phase === "WINNER_REVEAL" || now.phase === "GAME_COMPLETE", "question or end");
    if (current.phase !== "QUESTION_ACTIVE") break;
    await waitFor(ava.page, now => now.questionNumber === current.questionNumber && now.phase === "QUESTION_ACTIVE", "Ava sees the question");
    await markBest(ava.page);
    await waitFor(zion, now => now.questionNumber === current.questionNumber, "Zion sees the question");
    await markBest(zion, { hold: true });
    const after = await state(host.page);
    if (after.phase !== "QUESTION_ACTIVE") break;
    await host.page.locator(".controls .button-primary").click();
    await waitFor(host.page, now => now.phase !== "QUESTION_ACTIVE" || now.questionNumber !== current.questionNumber, "reveal");
    const revealed = await state(host.page);
    if (revealed.phase === "ANSWER_REVEAL") await host.page.locator(".controls .button-primary").click();
  }
  const won = await waitFor(host.page, now => now.winnerCount === 1, "Ava's Bingo");
  expect(won.winners[0].name).toBe("Ava");
  await expect(host.page.locator(".winners-list")).toContainText("\u{1F981} Ava");
  await expect(host.page.locator(".standings-list")).toContainText("\u{1F981} Ava");
  await expect(host.page.locator(".board-left > .banner")).toContainText("\u{1F981} AVA — BINGO!");

  // Final podium (host and student) keeps the emoji.
  await waitFor(host.page, now => now.phase === "GAME_COMPLETE", "game complete", 60_000);
  await expect(host.page.locator(".podium")).toContainText("\u{1F981} Ava");
  await waitFor(omar.page, now => now.phase === "GAME_COMPLETE", "Omar sees the end", 60_000);
  await expect(omar.page.locator(".podium")).toContainText("\u{1F981} Ava");

  for (const context of [ava.context, zionContext, omar.context, mia.context, lateContext, host.context]) await context.close();
});
