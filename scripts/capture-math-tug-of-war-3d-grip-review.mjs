#!/usr/bin/env node
/**
 * Owner review pack for the Math Tug of War 3D visible rope grip.
 *
 * Serves the shipped game with the mobile gameplay harness (the real route
 * document and CSP), plays real Teams matches through the keypads in
 * Chromium (hardware GL) and captures what a player sees, before and after:
 *
 *   - the ordinary gameplay camera at desktop, phone and smart-board sizes,
 *     with 4× nearest-neighbour crops of the players' real pixels;
 *   - every fist from the player's side, along the rope and from above;
 *   - recordings: all six pulling, a fist holding on while the rope moves,
 *     and the hands letting go at the win;
 *   - per-hand player-camera measurements (e2e/math-tug-of-war/player-camera-hands.ts):
 *     how many of each hand's pixels the player sees, and how many touch the rope.
 *
 *   node scripts/capture-math-tug-of-war-3d-grip-review.mjs \
 *     [--before <checkout of the production commit>] [--out owner-review/math-tug-of-war-3d-v1/visible-grip]
 *
 * "Before" frames come from a harness serving the --before checkout (byte-identical
 * runtime to production when that checkout is the production commit).
 */
import { copyFileSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const require = createRequire(join(root, "package.json"));
const { chromium } = require("@playwright/test");
const { playerCameraHands } = await import(pathToFileURL(join(root, "e2e/math-tug-of-war/player-camera-hands.ts")).href);

const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const out = resolve(root, option("--out", "owner-review/math-tug-of-war-3d-v1/visible-grip"));
const beforeRoot = option("--before", null);
const scratch = join(out, ".work");
rmSync(scratch, { recursive: true, force: true });
mkdirSync(scratch, { recursive: true });
const GPU_ARGS = ["--use-gl=angle", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu-rasterization"];
const MINUS = String.fromCharCode(0x2212);
const TIMES = String.fromCharCode(0xd7);

async function harness(checkout) {
  const { startMobileGameplayHarness } = await import(pathToFileURL(join(checkout, "scripts/mobile-gameplay-harness.mjs")).href);
  const server = await startMobileGameplayHarness(0);
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

const browser = await chromium.launch({ headless: true, args: GPU_ARGS });
const measurements = { capturedAt: new Date().toISOString(), before: {}, after: {}, notes: [] };

function solve(text) {
  const plain = text.split(MINUS).join("-").split(TIMES).join("*").trim();
  const m = /^(-?\d+) ([+*-]) (\((-\d+)\)|(\d+))$/.exec(plain);
  if (!m) throw new Error(`Unrecognised question: ${text}`);
  const a = Number(m[1]);
  const b = Number(m[4] ?? m[5]);
  return m[2] === "+" ? a + b : m[2] === "-" ? a - b : a * b;
}

/** A started Teams match with the 3D scene; `debug` exposes the review hook (same tier as the device path). */
async function match(base, { viewport, dpr = 1, mobile = false, video = null, debug = true }) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile, ...(video ? { recordVideo: { dir: video, size: viewport } } : {}) });
  if (debug) await context.addInitScript(() => { window.__MATHNEXA_GRAPHICS__ = "medium"; });
  const page = await context.newPage();
  await page.goto(`${base}/games/math-tug-of-war/play`);
  await page.locator('button[data-mode="teams"]').click();
  await page.fill("#team-1-name", "Sharks");
  await page.fill("#team-2-name", "Comets");
  await page.locator("#skill-addition").check();
  await page.getByRole("button", { name: "Start Game" }).click();
  await page.locator(".team-panel.team-turquoise").waitFor();
  await page.waitForFunction(() => document.querySelector(".scene-stage")?.dataset.renderer === "3d", null, { timeout: 120_000 });
  await page.waitForTimeout(1_800);
  const answer = async (team) => {
    const panel = page.locator(`.team-panel.team-${team}`);
    // The panel shows its last result briefly; its keys are locked until it clears.
    await page.waitForFunction((name) => !document.querySelector(`.team-panel.team-${name}`)?.dataset.result, team, { timeout: 8_000 });
    await panel.locator('.key[data-key="submit"]:not([disabled])').waitFor({ timeout: 8_000 });
    const value = solve(((await panel.locator(".question-text").textContent()) ?? "").trim());
    for (const key of [...(value < 0 ? ["-"] : []), ...String(Math.abs(value)).split(""), "submit"]) await panel.locator(`.key[data-key="${key}"]`).click();
  };
  const win = async (team) => {
    for (let pull = 0; pull < 16; pull += 1) {
      if (await page.getByRole("dialog").isVisible().catch(() => false)) break;
      if (await answer(team).then(() => false, () => true)) break; // the match ended: the keys stay locked
      await page.waitForTimeout(760);
    }
  };
  /** Pull for `team` until the game confirms the win; resolves the moment the 3D scene has the winner. */
  const winNow = async (team) => {
    for (let pull = 0; pull < 16; pull += 1) {
      if (await answer(team).then(() => false, () => true)) break;
      const won = await page.waitForFunction(() => Boolean(window.__MATHNEXA_TUG_SCENE__?.snapshot()?.three?.winner), null, { timeout: 1_200, polling: 30 }).then(() => true, () => false);
      if (won) return performance.now();
    }
    await page.waitForFunction(() => Boolean(window.__MATHNEXA_TUG_SCENE__?.snapshot()?.three?.winner), null, { timeout: 10_000, polling: 30 });
    return performance.now();
  };
  return { context, page, answer, win, winNow };
}

/** The gameplay camera's view enlarged to the whole viewport (clicks pass through to the keypads). */
const enlargeStage = async (page) => {
  await page.evaluate(() => {
    const stage = document.querySelector(".scene-stage");
    stage.style.cssText = "position:fixed;inset:0;z-index:999;background:#000;width:100vw;height:100vh;pointer-events:none";
    window.dispatchEvent(new Event("resize"));
  });
  await page.waitForTimeout(300);
};

const stageShot = async (page, file) => {
  const box = await page.locator(".scene-stage").boundingBox();
  await page.screenshot({ path: file, clip: box });
  return box;
};

/** Nearest-neighbour enlargement of a region of a screenshot: the player's real pixels, just bigger. */
async function crop(input, [x, y, w, h], scale, output) {
  const page = await browser.newPage({ viewport: { width: Math.round(w * scale), height: Math.round(h * scale) } });
  const uri = `data:image/png;base64,${readFileSync(input).toString("base64")}`;
  await page.setContent(`<body style="margin:0;overflow:hidden;background:#000"><div style="position:relative;width:${w * scale}px;height:${h * scale}px;overflow:hidden"><img src="${uri}" style="position:absolute;left:${-x * scale}px;top:${-y * scale}px;image-rendering:pixelated;transform-origin:0 0;transform:scale(${scale})"></div></body>`);
  await page.waitForTimeout(80);
  await page.screenshot({ path: output });
  await page.close();
}

/** A labelled grid of images. */
async function grid(output, columns, cells, width = 520) {
  const page = await browser.newPage({ viewport: { width: columns * (width + 12) + 12, height: 400 } });
  const body = cells.map(([label, file]) => `<figure style="margin:0"><figcaption style="padding:0 0 6px">${label}</figcaption><img src="data:image/png;base64,${readFileSync(file).toString("base64")}" style="width:${width}px;display:block"></figure>`).join("");
  await page.setContent(`<body style="margin:0;background:#111;font:600 15px system-ui;color:#fff"><div style="display:grid;grid-template-columns:repeat(${columns},${width}px);gap:12px;padding:12px">${body}</div></body>`);
  await page.waitForTimeout(120);
  await page.screenshot({ path: output, fullPage: true });
  await page.close();
}

/** Crop boxes (page CSS px) around each team's three pullers, from the projected bones. */
async function teamBoxes(page) {
  return page.evaluate(() => {
    const d = window.__MATHNEXA_TUG_3D_DEBUG__;
    const canvas = d.renderer.domElement.getBoundingClientRect();
    const boxes = {};
    for (const team of ["turquoise", "pink"]) {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const p of d.pullers[team]) {
        for (const bone of ["Head", "LeftFoot", "RightFoot", "LeftHand", "RightHand"]) {
          const v = p.boneWorld(bone, p.root.position.clone()).project(d.camera);
          const x = canvas.left + ((v.x + 1) / 2) * canvas.width;
          const y = canvas.top + ((1 - v.y) / 2) * canvas.height;
          x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        }
      }
      boxes[team] = [Math.floor(x0 - 10), Math.floor(y0 - 10), Math.ceil(x1 - x0 + 20), Math.ceil(y1 - y0 + 24)];
    }
    return boxes;
  });
}

const summary = (hands) => hands.map((hand) => `${hand.puller}-${hand.side[0]} ${hand.visible}/${hand.touching}`).join(", ");

async function playerViews(label, base, target) {
  // Desktop 1366×900 (a common school laptop), one pull each way, zoomed crops of both teams.
  const desktop = await match(base, { viewport: { width: 1366, height: 900 } });
  const files = {};
  target.desktop = { rest: await playerCameraHands(desktop.page) };
  await desktop.page.screenshot({ path: (files.page = join(scratch, `${label}-desktop.png`)) });
  const boxes = await teamBoxes(desktop.page);
  await crop(files.page, boxes.turquoise, 4, (files.turquoise = join(scratch, `${label}-desktop-turquoise-4x.png`)));
  await crop(files.page, boxes.pink, 4, (files.pink = join(scratch, `${label}-desktop-pink-4x.png`)));
  await desktop.answer("turquoise");
  await desktop.page.waitForTimeout(260);
  target.desktop.midPullTurquoise = await playerCameraHands(desktop.page);
  await desktop.page.screenshot({ path: (files.pull = join(scratch, `${label}-desktop-pull.png`)) });
  await crop(files.pull, (await teamBoxes(desktop.page)).turquoise, 4, (files.pullTurquoise = join(scratch, `${label}-desktop-pull-turquoise-4x.png`)));
  await desktop.page.waitForTimeout(900);
  await desktop.answer("pink");
  await desktop.page.waitForTimeout(260);
  target.desktop.midPullPink = await playerCameraHands(desktop.page);
  await desktop.context.close();
  // Phone 390×844 and Pixel 7, smart board 1920×1080.
  for (const [name, viewport, dpr, mobile] of [["phone-390x844", { width: 390, height: 844 }, 3, true], ["phone-pixel7-412x915", { width: 412, height: 915 }, 2.625, true], ["smart-board-1920x1080", { width: 1920, height: 1080 }, 1, false]]) {
    const device = await match(base, { viewport, dpr, mobile });
    target[name] = { rest: await playerCameraHands(device.page) };
    await device.page.screenshot({ path: (files[name] = join(scratch, `${label}-${name}.png`)) });
    await device.context.close();
  }
  return files;
}

try {
  const after = await harness(root);
  const afterFiles = await playerViews("after", after.base, measurements.after);
  let beforeFiles = null;
  if (beforeRoot) {
    const before = await harness(resolve(beforeRoot));
    beforeFiles = await playerViews("before", before.base, measurements.before);
    before.server.close();
  }

  // A whole match from the gameplay camera: start, the rope moving towards each team (strong pulls),
  // tired pullers, the stumble and release, the victory.
  const sequence = [];
  {
    const run = await match(after.base, { viewport: { width: 1366, height: 768 } });
    const frame = async (label, file, measure = true) => {
      await stageShot(run.page, join(scratch, file));
      sequence.push([label, join(scratch, file)]);
      if (measure) (measurements.after.sequence ??= {})[label] = await playerCameraHands(run.page);
    };
    await frame("match start", "seq-01-start.png");
    for (let pull = 0; pull < 3; pull += 1) { await run.answer("turquoise"); await run.page.waitForTimeout(pull < 2 ? 900 : 260); }
    await frame("rope moving towards Turquoise (third pull in a row: strong)", "seq-02-towards-turquoise.png");
    await run.page.waitForTimeout(900);
    for (let pull = 0; pull < 4; pull += 1) { await run.answer("pink"); await run.page.waitForTimeout(pull < 3 ? 900 : 260); }
    await frame("rope moving towards Pink (Turquoise yanked forward)", "seq-03-towards-pink.png");
    await run.page.waitForTimeout(900);
    for (let pull = 0; pull < 12; pull += 1) { await run.answer(pull % 2 ? "pink" : "turquoise"); await run.page.waitForTimeout(pull < 11 ? 900 : 260); }
    await frame("tired pullers after 19 pulls", "seq-04-fatigue.png");
    await run.page.waitForTimeout(900);
    const wonAt = await run.winNow("pink");
    const at = async (ms) => run.page.waitForTimeout(Math.max(0, wonAt + ms - performance.now()));
    await at(300);
    await frame("Pink wins: fists opening, the rope dropping (0.3 s)", "seq-05-release.png", false);
    await at(1_100);
    await frame("Turquoise stumble and fall (1.1 s)", "seq-06-stumble.png", false);
    await at(3_200);
    await frame("Pink celebrate together (3.2 s)", "seq-07-victory.png", false);
    await run.context.close();
  }

  // The let-go in close-up: the losing front puller's front fist as the win is confirmed.
  const release = [];
  {
    const run = await match(after.base, { viewport: { width: 960, height: 600 } });
    for (let pull = 0; pull < 6; pull += 1) { await run.answer("pink"); await run.page.waitForTimeout(820); }
    await run.page.evaluate(() => {
      const stage = document.querySelector(".scene-stage");
      stage.style.cssText = "position:fixed;inset:0;z-index:999;background:#000;width:100vw;height:100vh;pointer-events:none";
      window.dispatchEvent(new Event("resize"));
      window.__MATHNEXA_TUG_3D_DEBUG__.closeup = { team: "turquoise", index: 0, bone: "Hips", view: "side", distance: 2.3 };
    });
    const wonAt = await run.winNow("pink");
    for (const ms of [0, 120, 240, 400, 700]) {
      await run.page.waitForTimeout(Math.max(0, wonAt + ms - performance.now()));
      const file = join(scratch, `release-${ms}.png`);
      await run.page.screenshot({ path: file });
      release.push([`${(ms / 1000).toFixed(2)} s after the confirmed win`, file]);
    }
    await run.context.close();
  }

  // Fist close-ups: every hand, from the player's side, down the rope and from above, at rest and mid-pull.
  const fists = await match(after.base, { viewport: { width: 960, height: 600 } });
  await fists.page.evaluate(() => {
    const stage = document.querySelector(".scene-stage");
    stage.style.cssText = "position:fixed;inset:0;z-index:999;background:#000;width:100vw;height:100vh;pointer-events:none";
    window.dispatchEvent(new Event("resize"));
  });
  await fists.page.waitForTimeout(300);
  const fistShot = async (team, index, side, view, file) => {
    await fists.page.evaluate(([t, i, s, v]) => { window.__MATHNEXA_TUG_3D_DEBUG__.closeup = { team: t, index: i, fist: s, view: v, distance: 0.3 }; }, [team, index, side, view]);
    await fists.page.waitForTimeout(140);
    await fists.page.screenshot({ path: file });
  };
  const fistFiles = { turquoise: {}, pink: {} };
  for (const view of ["player", "along", "top"]) {
    for (const team of ["turquoise", "pink"]) {
      fistFiles[team][view] = [];
      for (const index of [0, 1, 2]) {
        for (const side of ["Left", "Right"]) {
          const file = join(scratch, `fist-${team}-${index}-${side}-${view}.png`);
          await fistShot(team, index, side, view, file);
          fistFiles[team][view].push([`${team} ${index + 1} ${side.toLowerCase()} hand`, file]);
        }
      }
    }
  }
  // Mid-pull: the fists keep the rope while the team heaves (and while the other team yanks them).
  await fists.page.evaluate(() => { window.__MATHNEXA_TUG_3D_DEBUG__.closeup = false; });
  const midPull = [];
  for (const [team, puller, side] of [["turquoise", 0, "Left"], ["turquoise", 0, "Right"], ["pink", 0, "Left"], ["pink", 0, "Right"]]) {
    await fists.answer(team === "turquoise" ? "turquoise" : "pink");
    await fists.page.waitForTimeout(240);
    const file = join(scratch, `fist-midpull-${team}-${puller}-${side}.png`);
    await fistShot(team, puller, side, "player", file);
    midPull.push([`mid-pull: ${team} front puller, ${side.toLowerCase()} hand`, file]);
    await fists.page.evaluate(() => { window.__MATHNEXA_TUG_3D_DEBUG__.closeup = false; });
    await fists.page.waitForTimeout(900);
  }
  measurements.after.fists = await fists.page.evaluate(() => window.__MATHNEXA_TUG_SCENE__.snapshot().three.hands.map((hand) => ({ puller: hand.puller, side: hand.side, coverage: hand.coverage, channelDeg: hand.channelDeg, wristDeg: hand.wristDeg })));
  await fists.context.close();

  // Recordings (player camera, 1366×768): all six pulling; a fist on the moving rope; the release at the win.
  const videoDir = join(scratch, "video");
  const recordAll = await match(after.base, { viewport: { width: 1366, height: 768 }, video: join(videoDir, "all") });
  await enlargeStage(recordAll.page);
  for (const team of ["turquoise", "turquoise", "pink", "pink", "pink", "turquoise"]) {
    await recordAll.answer(team);
    await recordAll.page.waitForTimeout(950);
  }
  await recordAll.context.close();
  const recordFist = await match(after.base, { viewport: { width: 1280, height: 720 }, video: join(videoDir, "fist") });
  await recordFist.page.evaluate(() => {
    const stage = document.querySelector(".scene-stage");
    stage.style.cssText = "position:fixed;inset:0;z-index:999;background:#000;width:100vw;height:100vh;pointer-events:none";
    window.dispatchEvent(new Event("resize"));
    window.__MATHNEXA_TUG_3D_DEBUG__.closeup = { team: "turquoise", index: 0, fist: "Left", view: "player", distance: 0.55 };
  });
  for (const team of ["turquoise", "pink", "turquoise", "pink", "pink", "turquoise"]) {
    await recordFist.answer(team);
    await recordFist.page.waitForTimeout(950);
  }
  await recordFist.context.close();
  const recordWin = await match(after.base, { viewport: { width: 1366, height: 768 }, video: join(videoDir, "win") });
  await enlargeStage(recordWin.page);
  await recordWin.answer("pink");
  await recordWin.page.waitForTimeout(800);
  await recordWin.winNow("pink");
  await recordWin.page.waitForTimeout(5_000);
  await recordWin.context.close();

  // Assemble the pack.
  mkdirSync(out, { recursive: true });
  const put = (from, name) => copyFileSync(from, join(out, name));
  if (beforeFiles) {
    put(beforeFiles.page, "02-before-player-camera-desktop-1366x900.png");
    put(beforeFiles.turquoise, "02b-before-turquoise-real-pixels-4x.png");
    put(beforeFiles.pink, "02c-before-pink-real-pixels-4x.png");
    await grid(join(out, "09-before-after-player-camera.png"), 2, [["BEFORE v1.2.22 — Turquoise (player camera, real pixels ×4)", beforeFiles.turquoise], ["AFTER — Turquoise", afterFiles.turquoise], ["BEFORE v1.2.22 — Pink", beforeFiles.pink], ["AFTER — Pink", afterFiles.pink]], 640);
    await grid(join(out, "09b-before-after-phone.png"), 2, [["BEFORE — phone 390×844", beforeFiles["phone-390x844"]], ["AFTER — phone 390×844", afterFiles["phone-390x844"]]], 390);
  }
  put(afterFiles.page, "03-after-player-camera-desktop-1366x900.png");
  put(afterFiles.turquoise, "03b-after-turquoise-real-pixels-4x.png");
  put(afterFiles.pink, "03c-after-pink-real-pixels-4x.png");
  put(afterFiles.pull, "03d-after-turquoise-pulling-desktop.png");
  put(afterFiles.pullTurquoise, "03e-after-turquoise-pulling-real-pixels-4x.png");
  for (const view of ["player", "along", "top"]) {
    await grid(join(out, `04-pink-fists-${view}.png`), 3, fistFiles.pink[view], 420);
    await grid(join(out, `05-turquoise-fists-${view}.png`), 3, fistFiles.turquoise[view], 420);
  }
  await grid(join(out, "06-fists-mid-pull.png"), 2, midPull, 520);
  await grid(join(out, "07-match-sequence-player-camera.png"), 2, sequence, 640);
  await grid(join(out, "07b-release-closeup.png"), 3, release, 420);
  put(afterFiles["phone-390x844"], "08-after-phone-390x844.png");
  put(afterFiles["phone-pixel7-412x915"], "08b-after-phone-pixel7.png");
  put(afterFiles["smart-board-1920x1080"], "08c-after-smart-board-1920x1080.png");
  for (const [dir, name] of [["all", "10-recording-all-six-pulling.webm"], ["fist", "11-recording-fist-holds-while-rope-moves.webm"], ["win", "12-recording-hands-release-at-victory.webm"]]) {
    const file = readdirSync(join(videoDir, dir)).find((entry) => entry.endsWith(".webm"));
    if (file) renameSync(join(videoDir, dir, file), join(out, name));
  }
  writeFileSync(join(out, "measurements.json"), JSON.stringify(measurements, null, 2));
  const lines = ["# Player-camera hand measurements", "", "Pixels of each hand the player's camera shows / pixels touching the rope (e2e/math-tug-of-war/player-camera-hands.ts).", ""];
  for (const [phase, data] of [["before (v1.2.22)", measurements.before], ["after", measurements.after]]) {
    if (!data.desktop) continue;
    lines.push(`## ${phase}`, "");
    for (const [key, hands] of Object.entries({ "desktop at rest": data.desktop.rest, "desktop mid-pull (Turquoise)": data.desktop.midPullTurquoise, "desktop mid-pull (Pink)": data.desktop.midPullPink, "phone 390×844": data["phone-390x844"]?.rest, "Pixel 7": data["phone-pixel7-412x915"]?.rest, "smart board": data["smart-board-1920x1080"]?.rest })) {
      if (!hands) continue;
      const hidden = hands.filter((hand) => hand.touching < 4).length;
      lines.push(`- **${key}**: ${hidden} of 12 hands with fewer than 4 px on the visible rope; fewest ${Math.min(...hands.map((hand) => hand.visible))} px visible. ${summary(hands)}`);
    }
    lines.push("");
  }
  if (measurements.after.sequence) {
    lines.push("## Match sequence (after, 1366×768)", "");
    for (const [label, hands] of Object.entries(measurements.after.sequence)) {
      lines.push(`- **${label}**: ${hands.filter((hand) => hand.touching < 4).length} of 12 hands with fewer than 4 px on the visible rope; fewest ${Math.min(...hands.map((hand) => hand.touching))} px touching. ${summary(hands)}`);
    }
    lines.push("");
  }
  if (measurements.after.fists) {
    lines.push("## Fists (after)", "", ...measurements.after.fists.map((hand) => `- ${hand.puller} ${hand.side}: coverage ${hand.coverage}, channel ${hand.channelDeg}°, wrist ${hand.wristDeg}°`), "");
  }
  writeFileSync(join(out, "measurements.md"), lines.join("\n"));
  after.server.close();
} finally {
  await browser.close();
  rmSync(scratch, { recursive: true, force: true });
}
console.log(`pack written to ${out}`);
