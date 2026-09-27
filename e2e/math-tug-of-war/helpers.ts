import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, type Page } from "@playwright/test";

export const GAME_ROUTE = "/games/math-tug-of-war/play";
export const MINUS = String.fromCharCode(0x2212);
export const TIMES = String.fromCharCode(0xd7);
export const SKILLS = ["addition", "subtraction", "multiplication", "integers", "opposite", "absolute"] as const;
export type Skill = (typeof SKILLS)[number];
export type Team = "turquoise" | "pink";

const axeSource = readFileSync(resolve("node_modules/axe-core/axe.min.js"), "utf8");

/** Independent solver for the visible question text (never reads game internals). */
export function solve(text: string): number {
  const plain = text.split(MINUS).join("-").split(TIMES).join("*").trim();
  const opposite = /^What is the opposite of (-?\d+)\?$/.exec(plain);
  if (opposite) return Number(opposite[1]) === 0 ? 0 : -Number(opposite[1]);
  const absolute = /^\|(-?\d+)\|$/.exec(plain);
  if (absolute) return Math.abs(Number(absolute[1]));
  const binary = /^(-?\d+) ([+*-]) (\((-\d+)\)|(\d+))$/.exec(plain);
  if (!binary) throw new Error(`Unrecognised question: ${text}`);
  const a = Number(binary[1]);
  const b = Number(binary[4] ?? binary[5]);
  const value = binary[2] === "+" ? a + b : binary[2] === "-" ? a - b : a * b;
  return value === 0 ? 0 : value;
}

export async function openGame(page: Page) {
  await page.goto(GAME_ROUTE);
  await expect(page.getByRole("heading", { level: 1, name: /Math Tug of War/ })).toBeVisible();
}

export async function startLocal(page: Page, mode: "robot" | "teams", skill: Skill, names: { turquoise?: string; pink?: string } = {}) {
  await openGame(page);
  await page.locator(`button[data-mode="${mode}"]`).click();
  if (mode === "teams") {
    if (names.turquoise !== undefined) await page.fill("#team-1-name", names.turquoise);
    if (names.pink !== undefined) await page.fill("#team-2-name", names.pink);
  } else if (names.turquoise !== undefined) {
    await page.fill("#player-name", names.turquoise);
  }
  await page.locator(`#skill-${skill}`).check();
  await page.getByRole("button", { name: "Start Game" }).click();
  await expect(page.locator(".team-panel.team-turquoise")).toBeVisible();
}

export function panel(page: Page, team: Team) {
  return page.locator(`.team-panel.team-${team}`);
}

export async function questionText(page: Page, team: Team) {
  return (await panel(page, team).locator(".question-text").textContent())?.trim() ?? "";
}

export async function ropePosition(page: Page) {
  return Number(await page.locator(".tug-scene-svg").getAttribute("data-position"));
}

/** Press keys on the on-screen keypad with real pointer input. */
export async function tapKeys(page: Page, team: Team, keys: string[]) {
  for (const key of keys) await panel(page, team).locator(`.key[data-key="${key}"]`).click();
}

export function keysFor(value: number, { plus = false } = {}): string[] {
  const digits = String(Math.abs(value)).split("");
  if (value < 0) return ["-", ...digits];
  return plus ? ["+", ...digits] : digits;
}

/** Answer the team's current question; waits until the next one is shown. */
export async function answer(page: Page, team: Team, { wrong = false, plus = false } = {}) {
  const text = await questionText(page, team);
  const correct = solve(text);
  const value = wrong ? correct + 1 : correct;
  await tapKeys(page, team, [...keysFor(value, { plus: plus && value > 0 }), "submit"]);
  return { text, value, correct };
}

export async function waitForUnlocked(page: Page, team: Team) {
  await expect(panel(page, team)).not.toHaveAttribute("data-result", /.+/, { timeout: 5_000 });
}

export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

export async function axeSeriousOrCritical(page: Page) {
  await page.evaluate(axeSource);
  const violations = await page.evaluate(async () => {
    const result = await (window as unknown as { axe: { run: (context: Document, options: unknown) => Promise<{ violations: { id: string; impact: string; nodes: unknown[] }[] }> } })
      .axe.run(document, { resultTypes: ["violations"] });
    return result.violations.filter(violation => violation.impact === "serious" || violation.impact === "critical").map(violation => `${violation.id} (${violation.nodes.length})`);
  });
  return violations;
}
