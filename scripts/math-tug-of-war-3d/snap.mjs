#!/usr/bin/env node
/**
 * Development viewer for the Math Tug of War 3D scene.
 *
 * Serves the shipped game document with the mobile gameplay harness (real
 * route CSP), opens it in Chromium, starts a Two Teams match with the 3D
 * scene forced on, performs the requested pulls and writes screenshots plus
 * the scene's diagnostic snapshot. Used while tuning poses and for the owner
 * review pack; never part of the runtime.
 *
 *   node scripts/math-tug-of-war-3d/snap.mjs --out <dir> [--pulls t,t,p,p,p] [--wait 1500]
 *        [--viewport 1366x768] [--stage] [--win turquoise] [--video] [--gpu]
 *
 *   --pulls   sequence of teams that answer correctly (t = Turquoise, p = Pink)
 *   --stage   also capture the scene box alone, enlarged to the viewport
 *   --win     make the given team win (7 net pulls) and capture the celebration
 *   --video   record a webm of the whole run
 *   --gpu     ask Chromium for hardware GL (falls back to SwiftShader)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const require = createRequire(join(root, "package.json"));
const { chromium, webkit } = require("@playwright/test");
const { startMobileGameplayHarness } = await import(new URL("../mobile-gameplay-harness.mjs", import.meta.url));

const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const flag = (name) => args.includes(name);
const outDir = resolve(option("--out", join(root, "qa-artifacts", "tug-3d")));
const pulls = (option("--pulls", "") || "").split(",").filter(Boolean);
const waitMs = Number(option("--wait", "1500"));
const [viewportWidth, viewportHeight] = (option("--viewport", "1366x768")).split("x").map(Number);
const winner = option("--win", null);
const engine = option("--engine", "chromium");
const mode = option("--mode", "teams");
const tier = option("--tier", "3d");
const closeup = option("--closeup", null); // "pink-1": also capture that puller's face after each step
const filmstrip = Number(option("--filmstrip", "0")); // frames to capture (every 90 ms) right after each pull

mkdirSync(outDir, { recursive: true });
const server = await startMobileGameplayHarness(0);
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

const browserType = engine === "webkit" ? webkit : chromium;
const browser = await browserType.launch({
  headless: true,
  args: engine === "chromium" && flag("--gpu") ? ["--use-gl=angle", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu-rasterization"] : []
});
const context = await browser.newContext({
  viewport: { width: viewportWidth, height: viewportHeight },
  deviceScaleFactor: Number(option("--dpr", "1")),
  recordVideo: flag("--video") ? { dir: outDir, size: { width: viewportWidth, height: viewportHeight } } : undefined
});
const page = await context.newPage();
const log = [];
page.on("console", (message) => log.push(`${message.type()}: ${message.text()}`));

const MINUS = String.fromCharCode(0x2212);
const TIMES = String.fromCharCode(0xd7);
function solve(text) {
  const plain = text.split(MINUS).join("-").split(TIMES).join("*").trim();
  const opposite = /^What is the opposite of (-?\d+)\?$/.exec(plain);
  if (opposite) return -Number(opposite[1]) || 0;
  const negativeAbsolute = /^-\|(-?\d+)\|$/.exec(plain);
  if (negativeAbsolute) return -Math.abs(Number(negativeAbsolute[1])) || 0;
  const absolute = /^\|(-?\d+)\|$/.exec(plain);
  if (absolute) return Math.abs(Number(absolute[1]));
  const binary = /^(-?\d+) ([+*-]) (\((-\d+)\)|(\d+))$/.exec(plain);
  if (!binary) throw new Error(`Unrecognised question: ${text}`);
  const a = Number(binary[1]);
  const b = Number(binary[4] ?? binary[5]);
  return binary[2] === "+" ? a + b : binary[2] === "-" ? a - b : a * b;
}

async function answer(team) {
  const panel = page.locator(`.team-panel.team-${team}`);
  await panel.locator(".question-text").waitFor();
  const text = (await panel.locator(".question-text").textContent())?.trim() ?? "";
  const value = solve(text);
  const keys = [...(value < 0 ? ["-"] : []), ...String(Math.abs(value)).split(""), "submit"];
  for (const key of keys) await panel.locator(`.key[data-key="${key}"]`).click();
  await panel.locator(".question-text").waitFor();
}

async function snapshot() {
  return page.evaluate(() => {
    const stage = document.querySelector(".scene-stage");
    const scene = window.__MATHNEXA_TUG_SCENE__;
    return { renderer: stage?.dataset.renderer, tier: stage?.dataset.tier, fallback: stage?.dataset.fallback, position: document.querySelector(".tug-scene-svg")?.dataset.position, scene: scene?.snapshot?.() ?? null };
  });
}

async function shot(name) {
  await page.screenshot({ path: join(outDir, `${name}.png`) });
  if (flag("--stage")) {
    await page.evaluate(() => {
      const stage = document.querySelector(".scene-stage");
      stage.dataset.debugStyle = stage.style.cssText;
      stage.style.cssText = "position:fixed;inset:0;z-index:999;background:#000;width:100vw;height:100vh";
      stage.querySelector(".tug-scene-svg").style.height = "100%";
    });
    await page.waitForTimeout(450);
    await page.screenshot({ path: join(outDir, `${name}-stage.png`) });
    await page.evaluate(() => {
      const stage = document.querySelector(".scene-stage");
      stage.style.cssText = stage.dataset.debugStyle ?? "";
      stage.querySelector(".tug-scene-svg").style.height = "";
    });
    await page.waitForTimeout(200);
  }
  if (closeup) {
    // Park the camera on one puller's face (review override exposes the scene), shoot, release.
    const [team, index] = closeup.split("-");
    const parked = await page.evaluate(([teamName, pullerIndex]) => {
      const d = window.__MATHNEXA_TUG_3D_DEBUG__;
      if (!d) return false;
      const puller = d.pullers[teamName][Number(pullerIndex)];
      const head = new d.camera.position.constructor();
      puller.rig.worldPosition(puller.rig.bone("Head"), head);
      head.y += 0.06;
      puller.root.localToWorld(head);
      const towardsCentre = teamName === "turquoise" ? 1 : -1;
      d.closeup = true;
      d.camera.position.set(head.x + towardsCentre * 0.55, head.y + 0.12, head.z + 0.95);
      d.camera.lookAt(head.x, head.y, head.z);
      return true;
    }, [team, index]);
    if (parked) {
      await page.waitForTimeout(120);
      const box = await page.locator(".scene-stage").boundingBox();
      await page.screenshot({ path: join(outDir, `${name}-closeup.png`), clip: box ?? undefined });
      await page.evaluate(() => {
        const d = window.__MATHNEXA_TUG_3D_DEBUG__;
        if (d) d.closeup = false;
      });
      await page.waitForTimeout(80);
    }
  }
}

const results = { base, engine, viewport: [viewportWidth, viewportHeight], steps: [] };
try {
  await page.goto(`${base}/games/math-tug-of-war/play?graphics=${tier}`);
  await page.locator(`button[data-mode="${mode}"]`).click();
  await page.fill("#team-1-name", "Sharks").catch(() => undefined);
  await page.fill("#team-2-name", "Comets").catch(() => undefined);
  await page.fill("#player-name", "Ava").catch(() => undefined);
  await page.locator("#skill-addition").check();
  await page.getByRole("button", { name: "Start Game" }).click();
  await page.locator(".team-panel.team-turquoise").waitFor();
  // Wait for the 3D layer (or its fallback).
  await page.waitForFunction((forced) => {
    const stage = document.querySelector(".scene-stage");
    if (!stage) return false;
    if (forced === "classic") return stage.dataset.renderer === "svg";
    return stage.dataset.renderer === "3d" || Boolean(stage.dataset.fallback);
  }, tier, { timeout: 60_000 });
  await page.waitForTimeout(waitMs);
  results.steps.push({ step: "start", ...(await snapshot()) });
  await shot("00-start");
  let index = 1;
  for (const pull of pulls) {
    const team = pull === "t" ? "turquoise" : "pink";
    await answer(team);
    for (let frame = 0; frame < filmstrip; frame += 1) {
      await page.waitForTimeout(90);
      const box = await page.locator(".scene-stage").boundingBox();
      await page.screenshot({ path: join(outDir, `${String(index).padStart(2, "0")}-pull-${team}-frame${String(frame).padStart(2, "0")}.png`), clip: box ?? undefined });
    }
    await page.waitForTimeout(waitMs);
    results.steps.push({ step: `pull-${index}-${team}`, ...(await snapshot()) });
    await shot(`${String(index).padStart(2, "0")}-pull-${team}`);
    index += 1;
  }
  if (winner) {
    const current = Number((await snapshot()).position ?? 0);
    const needed = winner === "turquoise" ? 7 + current : 7 - current;
    for (let n = 0; n < needed; n += 1) {
      await answer(winner);
      if (n === needed - 1) break;
      await page.waitForTimeout(900);
    }
    for (const [label, delay] of [["win-0.4s", 400], ["win-1.3s", 900], ["win-2.4s", 1100], ["win-4.5s", 2100]]) {
      await page.waitForTimeout(delay);
      results.steps.push({ step: label, ...(await snapshot()) });
      await shot(`${String(index).padStart(2, "0")}-${label}`);
      index += 1;
    }
  }
  results.diagnostics = await page.evaluate(() => {
    const stage = document.querySelector(".scene-stage");
    const resources = performance.getEntriesByType("resource");
    const models = resources.filter((entry) => entry.name.includes("/models/"));
    const scripts = resources.filter((entry) => entry.name.includes("/src/"));
    const sum = (list, key) => list.reduce((total, entry) => total + (entry[key] ?? 0), 0);
    const span = (list) => (list.length ? Math.max(...list.map((entry) => entry.responseEnd)) - Math.min(...list.map((entry) => entry.startTime)) : 0);
    const memory = performance.memory ? { usedJSHeapMB: Math.round(performance.memory.usedJSHeapSize / 1048576), totalJSHeapMB: Math.round(performance.memory.totalJSHeapSize / 1048576) } : null;
    const d = window.__MATHNEXA_TUG_3D_DEBUG__;
    const gpu = d ? { geometries: d.renderer.info.memory.geometries, textures: d.renderer.info.memory.textures, programs: d.renderer.info.programs?.length ?? 0, shadowMap: d.renderer.shadowMap.enabled, pixelRatio: d.renderer.getPixelRatio(), canvas: [d.renderer.domElement.width, d.renderer.domElement.height] } : null;
    return {
      renderer: stage?.dataset.renderer === "3d" ? "3d" : "svg",
      modelBytes: sum(models, "transferSize") || sum(models, "encodedBodySize"),
      modelFiles: models.length,
      modelLoadMs: Math.round(span(models)),
      scriptBytes: sum(scripts, "transferSize") || sum(scripts, "encodedBodySize"),
      vendorBytes: resources.filter((entry) => entry.name.includes("/vendor/three.js")).map((entry) => entry.encodedBodySize)[0] ?? 0,
      memory,
      gpu,
      scene: window.__MATHNEXA_TUG_SCENE__?.snapshot?.() ?? null
    };
  });
} finally {
  results.console = log.slice(0, 60);
  writeFileSync(join(outDir, "snap.json"), JSON.stringify(results, null, 2));
  await context.close();
  await browser.close();
  server.close();
}
console.log(JSON.stringify(results.steps, null, 1));
