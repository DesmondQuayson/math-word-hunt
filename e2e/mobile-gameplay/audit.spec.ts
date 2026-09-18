import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { test } from "@playwright/test";

import { GAME_LABELS, PROBES, measureLayout, openGame, seedRandom, type GameKey } from "./games";

/**
 * Mobile gameplay AUDIT — measurement only, never a gate.
 *
 * Records, for every game at every viewport in every engine, what the learner
 * sees the instant active gameplay starts (nothing scrolled): page scroll
 * extent, horizontal overflow, header height, board/problem/control boxes,
 * visibility and covering. Run it on the baseline and on the candidate with a
 * different MOBILE_GAMEPLAY_AUDIT_LABEL to produce the before/after record in
 * docs/mobile-gameplay-fit-v1.md (scripts/report-mobile-gameplay-audit.mjs).
 *
 *   MOBILE_GAMEPLAY_AUDIT_LABEL=before node scripts/run-mobile-gameplay-e2e.mjs audit.spec.ts
 */

const label = process.env.MOBILE_GAMEPLAY_AUDIT_LABEL ?? "current";
// Not under test-results/: Playwright empties that on every run, which would
// discard the "before" record the moment the "after" audit starts.
const outputRoot = resolve("qa-artifacts", "mobile-gameplay-audit", label);

export const PHONE_VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 360, height: 640 },
  { width: 360, height: 800 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 393, height: 852 },
  { width: 430, height: 932 }
] as const;

const TABLET_AND_LANDSCAPE = [
  { width: 768, height: 1024 },
  { width: 844, height: 390 }
] as const;

const LARGE = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 }
] as const;

const GAMES: readonly GameKey[] = ["math-vocabulary-hunt", "crosscalc", "number-cross", "number-logic"];

for (const game of GAMES) {
  test(`${GAME_LABELS[game]} layout audit`, async ({ page, isMobile }, testInfo) => {
    test.setTimeout(600_000);
    const viewports = [...PHONE_VIEWPORTS, ...TABLET_AND_LANDSCAPE, ...(isMobile ? [] : LARGE)];
    const project = testInfo.project.name;
    const screens = resolve(outputRoot, "screens");
    mkdirSync(screens, { recursive: true });
    await seedRandom(page);
    const records = [];
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await openGame(page, game);
      const report = await measureLayout(page, PROBES[game]);
      records.push({ game, project, ...report });
      await page.screenshot({ path: resolve(screens, `${game}-${viewport.width}x${viewport.height}-${project}.png`) });
    }
    writeFileSync(resolve(outputRoot, `${game}--${project}.json`), JSON.stringify(records, null, 2));
  });
}
