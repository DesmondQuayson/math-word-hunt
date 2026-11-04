import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { PAGE_ERRORS, closeRoom, createGame, hostNext, joinPlayer, markBest, signInTeacher, state, waitFor, startGame } from "./helpers";

test.describe.configure({ mode: "serial" });

test.afterEach(() => {
  expect(PAGE_ERRORS, PAGE_ERRORS.join("\n")).toEqual([]);
});

const shots = resolve("qa-artifacts/math-bingo-live");
mkdirSync(shots, { recursive: true });

const PLAYER_VIEWPORTS = [
  { name: "phone-320x568", width: 320, height: 568, touch: true, minCell: 40 },
  { name: "phone-360x740", width: 360, height: 740, touch: true, minCell: 44 },
  { name: "iphone-390x844", width: 390, height: 844, touch: true, minCell: 44 },
  { name: "ipad-portrait-768x1024", width: 768, height: 1024, touch: true, minCell: 44 },
  { name: "ipad-landscape-1024x768", width: 1024, height: 768, touch: true, minCell: 44 },
  { name: "desktop-1366x768", width: 1366, height: 768, touch: false, minCell: 44 }
] as const;

const HOST_VIEWPORTS = [
  { name: "smart-board-1920x1080", width: 1920, height: 1080 },
  { name: "laptop-1366x768", width: 1366, height: 768 }
] as const;

async function noHorizontalScroll(page: Page, label: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `${label}: horizontal overflow`).toBeLessThanOrEqual(1);
}

test("every target screen: the card dominates and fits, cells are touch-sized, nothing scrolls sideways", async ({ browser }, testInfo) => {
  test.setTimeout(600_000);
  const engine = testInfo.project.name.includes("webkit") ? "webkit" : "chromium";
  const host = await signInTeacher(browser, { viewport: { width: 1920, height: 1080 } });
  const room = await createGame(host.page, { mode: "fractions", level: "to-sixths", questionSeconds: 0, revealSeconds: 0, winners: 0 });
  const players = [];
  for (const viewport of PLAYER_VIEWPORTS) {
    const joined = await joinPlayer(browser, room.code, viewport.name.split("-")[0].slice(0, 12) + viewport.width, {
      viewport: { width: viewport.width, height: viewport.height }, hasTouch: viewport.touch, isMobile: viewport.touch && viewport.width < 800 && engine === "chromium"
    });
    players.push({ ...viewport, ...joined });
  }
  for (const player of players) {
    await noHorizontalScroll(player.page, `${player.name} lobby`);
    await player.page.screenshot({ path: resolve(shots, `${engine}-${player.name}-lobby.png`) });
  }
  await host.page.screenshot({ path: resolve(shots, `${engine}-host-lobby-1920x1080.png`) });

  await startGame(host.page);
  for (const player of players) await waitFor(player.page, current => Boolean(current.me?.board), `${player.name} card`);
  for (const player of players) await waitFor(player.page, current => current.phase === "QUESTION_ACTIVE", `${player.name} question`);

  for (const player of players) {
    const page = player.page;
    const card = await page.locator(".card").boundingBox();
    expect(card, player.name).not.toBeNull();
    // The whole card is on screen without scrolling.
    expect(card!.x).toBeGreaterThanOrEqual(0);
    expect(card!.y).toBeGreaterThanOrEqual(0);
    expect(card!.x + card!.width, `${player.name} card right edge`).toBeLessThanOrEqual(player.width + 1);
    expect(card!.y + card!.height, `${player.name} card bottom edge`).toBeLessThanOrEqual(player.height + 1);
    // ...and it is the largest thing on the screen.
    expect(card!.width * card!.height, `${player.name} card area`).toBeGreaterThan(player.width * player.height * 0.28);
    const cell = await page.locator('[data-cell="0"]').boundingBox();
    expect(Math.min(cell!.width, cell!.height), `${player.name} cell size`).toBeGreaterThanOrEqual(player.minCell);
    await expect(page.locator(".question-face")).toBeVisible();
    await noHorizontalScroll(page, `${player.name} game`);
    // Touch where the device has touch, a click elsewhere: the mark lands either way.
    const current = await state(page);
    if (player.touch) {
      const answer = current.question!.text.split("/").map(Number);
      const index = current.me!.board!.findIndex(item => !item.free && item.n === answer[0] && item.d === answer[1]);
      const reply = page.waitForResponse(response => response.url().endsWith("/api/games/math-bingo-live/play") && (response.request().postData() ?? "").includes("\"mark\""));
      await page.bringToFront();
      await page.locator(`[data-cell="${index}"]`).tap();
      expect((await (await reply).json()).result, `${player.name} tap`).toBe("correct");
    } else {
      expect((await markBest(page))?.result).toBe("correct");
    }
    await page.screenshot({ path: resolve(shots, `${engine}-${player.name}-question.png`) });
  }

  for (const viewport of HOST_VIEWPORTS) {
    await host.page.setViewportSize({ width: viewport.width, height: viewport.height });
    await host.page.waitForTimeout(300);
    await noHorizontalScroll(host.page, viewport.name);
    // Readable from the back of the room: the question is huge, the timer and leaderboard are on screen.
    const fontSize = await host.page.locator(".stage .frac").evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize));
    expect(fontSize, `${viewport.name} question size`).toBeGreaterThanOrEqual(viewport.width >= 1900 ? 180 : 120);
    for (const selector of [".timer-giant", ".side-leaderboard", ".side-rules", ".controls", ".join-chip"]) {
      const box = await host.page.locator(selector).boundingBox();
      expect(box, `${viewport.name} ${selector}`).not.toBeNull();
      expect(box!.y + box!.height, `${viewport.name} ${selector} on screen`).toBeLessThanOrEqual(viewport.height + 1);
    }
    await host.page.screenshot({ path: resolve(shots, `${engine}-host-${viewport.name}-question.png`) });
  }
  await hostNext(host.page);
  await waitFor(host.page, current => current.phase === "ANSWER_REVEAL", "reveal");
  await host.page.waitForTimeout(300);
  await host.page.screenshot({ path: resolve(shots, `${engine}-host-laptop-1366x768-reveal.png`) });
  await host.page.setViewportSize({ width: 1920, height: 1080 });
  await host.page.waitForTimeout(300);
  await host.page.screenshot({ path: resolve(shots, `${engine}-host-smart-board-1920x1080-reveal.png`) });
  for (const player of players) await player.page.screenshot({ path: resolve(shots, `${engine}-${player.name}-reveal.png`) });

  await closeRoom(host.page);
  for (const player of players) await player.context.close();
  await host.context.close();
});

test("keyboard, screen reader labels, reduced motion and forced colours", async ({ browser }, testInfo) => {
  test.setTimeout(300_000);
  const engine = testInfo.project.name.includes("webkit") ? "webkit" : "chromium";
  const host = await signInTeacher(browser);
  const room = await createGame(host.page, { mode: "addition", level: "facts-20", questionSeconds: 0, revealSeconds: 0 });
  const ava = await joinPlayer(browser, room.code, "Ava", { reducedMotion: "reduce" });
  const zion = await joinPlayer(browser, room.code, "Zion", { forcedColors: "active", colorScheme: "light" });
  await startGame(host.page);
  const live = await waitFor(ava.page, current => Boolean(current.me?.board) && current.phase === "QUESTION_ACTIVE", "question");

  // Screen-reader structure: labelled card, labelled cells, live regions, timer.
  await expect(ava.page.getByRole("group", { name: /Your Bingo card/ })).toBeVisible();
  await expect(ava.page.locator('[data-cell="0"]')).toHaveAttribute("aria-label", /^Row 1, column B: \d+\./);
  await expect(ava.page.locator('[data-cell="12"]')).toHaveAttribute("aria-label", /Free Space/);
  await expect(ava.page.locator("#announcer")).toHaveAttribute("aria-live", "polite");
  await expect(ava.page.locator("#alert-announcer")).toHaveAttribute("aria-live", "assertive");
  await expect(ava.page.getByRole("group", { name: "Ways to win" })).toBeVisible();
  await expect(ava.page.locator("#announcer")).toContainText(`Question ${live.questionNumber}`);

  // Keyboard only: focus the card, move with arrows, mark with Enter.
  const answer = Number(/^(\d+) \+ (\d+)$/.exec(live.question!.text)!.slice(1).reduce((sum, part) => sum + Number(part), 0));
  const target = live.me!.board!.findIndex(cell => !cell.free && cell.n === answer);
  await ava.page.locator('[data-cell="0"]').focus();
  const row = Math.floor(target / 5);
  const column = target % 5;
  for (let step = 0; step < row; step += 1) await ava.page.keyboard.press("ArrowDown");
  for (let step = 0; step < column; step += 1) await ava.page.keyboard.press("ArrowRight");
  await expect(ava.page.locator(`[data-cell="${target}"]`)).toBeFocused();
  const reply = ava.page.waitForResponse(response => response.url().endsWith("/api/games/math-bingo-live/play") && (response.request().postData() ?? "").includes("\"mark\""));
  await ava.page.bringToFront();
  await ava.page.keyboard.press("Enter");
  expect((await (await reply).json()).result).toBe("correct");
  await expect(ava.page.locator(`[data-cell="${target}"]`)).toHaveAttribute("aria-pressed", "true");
  await expect(ava.page.locator(`[data-cell="${target}"]`)).toHaveAttribute("aria-label", /Marked\./);
  await expect(ava.page.locator(`[data-cell="${target}"]`)).toBeFocused();
  // Focus is visible.
  const outline = await ava.page.locator(`[data-cell="${target}"]`).evaluate(element => getComputedStyle(element).outlineStyle);
  expect(outline).not.toBe("none");

  // Reduced motion: animations are effectively off.
  const duration = await ava.page.locator(`[data-cell="${target}"]`).evaluate(element => getComputedStyle(element).animationDuration);
  expect(Number.parseFloat(duration)).toBeLessThan(0.05);

  // Forced colours: a marked cell is still distinguishable (double border), the models keep their outlines.
  expect((await markBest(zion.page))?.result).toBe("correct");
  const marked = zion.page.locator(".card-cell.is-marked").first();
  const border = await marked.evaluate(element => getComputedStyle(element).borderTopStyle);
  if (engine === "chromium") expect(border).toBe("double");
  await zion.page.screenshot({ path: resolve(shots, `${engine}-forced-colors.png`) });

  // Host keyboard: the main control is a real, focusable button.
  await host.page.locator(".controls .button-primary").focus();
  await expect(host.page.locator(".controls .button-primary")).toBeFocused();

  await closeRoom(host.page);
  for (const context of [host.context, ava.context, zion.context]) await context.close();
});
