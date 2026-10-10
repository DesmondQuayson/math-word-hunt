#!/usr/bin/env node
/**
 * Math Tug of War 3D — owner review pack.
 *
 * Drives scripts/math-tug-of-war-3d/snap.mjs through the scenarios the owner
 * asked to see and collects the results under owner-review/math-tug-of-war-3d-v1/:
 *
 *   before/after gameplay (classic SVG vs 3D), active pulling filmstrips,
 *   a long match for fatigue, a stumble/fall/recovery sequence, winning and
 *   losing team demonstrations, phone/desktop/Smart Board/4K comparisons,
 *   face close-ups, performance measurements and a webm recording.
 *
 * Everything is captured from the shipped game document under its production
 * route CSP (the mobile gameplay harness), with the 3D scene forced on via
 * ?graphics=3d so headless Chromium (software GL by default) renders it.
 *
 *   node scripts/capture-math-tug-of-war-3d-review-pack.mjs [--out <dir>] [--no-gpu]
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const outDir = resolve(option("--out", join(root, "owner-review", "math-tug-of-war-3d-v1")));
const gpu = !args.includes("--no-gpu");
const work = join(root, "qa-artifacts", "tug-3d-review");
rmSync(work, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
// Stale captures from an earlier pack (renamed or retimed shots) never linger next to new ones.
for (const file of readdirSync(outDir)) if (/.(png|webm|json)$/.test(file) || file === "measurements.md") rmSync(join(outDir, file), { force: true });

const snap = join(root, "scripts", "math-tug-of-war-3d", "snap.mjs");
function run(name, extra) {
  const dir = join(work, name);
  const result = spawnSync(process.execPath, [snap, "--out", dir, ...(gpu ? ["--gpu"] : []), ...extra], { cwd: root, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    throw new Error(`${name} failed`);
  }
  const summary = existsSync(join(dir, "snap.json")) ? JSON.parse(readFileSync(join(dir, "snap.json"), "utf8")) : null;
  return { dir, summary };
}

function copy(from, to) {
  cpSync(from, join(outDir, to));
}

const measurements = [];
const note = (label, summary) => {
  const d = summary?.diagnostics;
  const three = d?.scene?.three;
  if (!d || !three) return;
  measurements.push({
    label,
    tier: three.tier,
    frameMs: three.frameMs,
    worstMs: three.worstMs,
    drawCalls: three.drawCalls,
    triangles: three.triangles,
    pixelRatio: three.pixelRatio,
    canvas: d.gpu?.canvas,
    modelBytes: d.modelBytes,
    modelLoadMs: d.modelLoadMs,
    vendorBytes: d.vendorBytes,
    usedJSHeapMB: d.memory?.usedJSHeapMB ?? null,
    geometries: d.gpu?.geometries,
    textures: d.gpu?.textures,
    downgrades: three.downgrades
  });
};

// 1. Before / after at the main desktop size.
const classic = run("classic-desktop", ["--tier", "classic", "--viewport", "1366x768", "--wait", "900", "--pulls", "t,t"]);
copy(join(classic.dir, "02-pull-turquoise.png"), "01-before-classic-desktop.png");
const desktop = run("3d-desktop", ["--viewport", "1366x768", "--wait", "1200", "--pulls", "t,t", "--stage", "--closeup", "pink-0"]);
copy(join(desktop.dir, "02-pull-turquoise.png"), "02-after-3d-desktop.png");
copy(join(desktop.dir, "02-pull-turquoise-stage.png"), "03-after-3d-scene-only.png");
copy(join(desktop.dir, "02-pull-turquoise-closeup.png"), "04-face-closeup-losing-side.png");
note("desktop 1366x768", desktop.summary);

// 2. Active pulling filmstrips (90 ms frames after a Turquoise pull, then a Pink pull).
const film = run("filmstrip", ["--viewport", "1600x900", "--wait", "300", "--pulls", "t,p", "--filmstrip", "9", "--stage"]);
for (const file of readdirSync(film.dir).filter((name) => /frame0[0-8]\.png$/.test(name))) copy(join(film.dir, file), `05-pulling-${file}`);

// 3. Fatigue: a long match, both sides, then a face close-up.
const long = run("fatigue", ["--viewport", "1600x900", "--wait", "700", "--pulls", "t,p,t,p,t,p,t,p,t,p,t,p,t,p,t,p,t,p,t,p,t,p,t,p", "--closeup", "turquoise-0"]);
copy(join(long.dir, "24-pull-pink.png"), "06-fatigue-after-24-pulls.png");
copy(join(long.dir, "24-pull-pink-closeup.png"), "07-fatigue-face-closeup.png");
note("desktop 1600x900 after 24 pulls", long.summary);

// 4. Stumble, fall, recovery and the celebration (Pink wins, Turquoise loses), with a recording.
const win = run("victory", ["--viewport", "1600x900", "--wait", "900", "--pulls", "t,p,p", "--win", "pink", "--stage", "--video"]);
copy(join(win.dir, "04-win-0.5s-stage.png"), "08-loss-stumble-0.5s.png");
copy(join(win.dir, "05-win-1.4s-stage.png"), "09-loss-fall-1.4s.png");
copy(join(win.dir, "06-win-2.6s-stage.png"), "10-loss-down-helping-hand-2.6s.png");
copy(join(win.dir, "07-win-4.8s-stage.png"), "11-recovery-4.8s.png");
copy(join(win.dir, "08-win-6.0s-stage.png"), "11b-dejected-6.0s.png");
copy(join(win.dir, "06-win-2.6s.png"), "12-winning-celebration-with-result-card.png");
for (const file of readdirSync(win.dir).filter((name) => name.endsWith(".webm"))) copy(join(win.dir, file), "13-recording-pulls-victory-fall-recovery.webm");
const win2 = run("victory-turquoise", ["--viewport", "1600x900", "--wait", "900", "--pulls", "p", "--win", "turquoise", "--stage", "--closeup", "turquoise-1"]);
copy(join(win2.dir, "03-win-1.4s-stage.png"), "14-winning-team-turquoise-1.4s.png");
copy(join(win2.dir, "04-win-2.6s-stage.png"), "15-winning-team-turquoise-2.6s-high-five.png");
copy(join(win2.dir, "05-win-4.8s-stage.png"), "15b-winning-team-turquoise-4.8s.png");
copy(join(win2.dir, "03-win-1.4s-closeup.png"), "16-winner-face-joy.png");

// 5. Devices.
const devices = [["phone-390x844", "390x844"], ["phone-430x932", "430x932"], ["ipad-portrait-820x1180", "820x1180"], ["ipad-landscape-1180x820", "1180x820"], ["smart-board-1920x1080", "1920x1080"], ["4k-3840x2160", "3840x2160"]];
let index = 17;
for (const [name, viewport] of devices) {
  const mobile = /^(phone|ipad)/.test(name) ? ["--mobile"] : [];
  const capture = run(`device-${name}`, ["--viewport", viewport, "--wait", "1200", "--pulls", "t,p,p", ...mobile]);
  copy(join(capture.dir, "03-pull-pink.png"), `${index}-device-${name}.png`);
  note(`device ${name}`, capture.summary);
  index += 1;
}
// Low tier (no shadow maps, contact shadows) on a phone and the classic phone for comparison.
const low = run("phone-low", ["--viewport", "390x844", "--tier", "low", "--wait", "1200", "--pulls", "t,p", "--mobile"]);
copy(join(low.dir, "02-pull-pink.png"), `${index}-device-phone-390x844-low-tier.png`);
note("phone 390x844 low tier", low.summary);
index += 1;
const classicPhone = run("phone-classic", ["--viewport", "390x844", "--tier", "classic", "--wait", "800", "--pulls", "t,p", "--mobile"]);
copy(join(classicPhone.dir, "02-pull-pink.png"), `${index}-device-phone-390x844-classic.png`);
index += 1;

// 6. WebKit.
const webkit = run("webkit", ["--engine", "webkit", "--viewport", "1366x768", "--wait", "1200", "--pulls", "t,p"]);
copy(join(webkit.dir, "02-pull-pink.png"), `${index}-webkit-desktop.png`);
note("webkit 1366x768", webkit.summary);

writeFileSync(join(outDir, "measurements.json"), JSON.stringify(measurements, null, 2));
const rows = measurements.map((m) => `| ${m.label} | ${m.tier} | ${m.frameMs} | ${m.worstMs} | ${m.drawCalls} | ${m.triangles} | ${m.canvas?.join("×") ?? ""} | ${m.usedJSHeapMB ?? ""} | ${Math.round((m.modelBytes ?? 0) / 1024)} | ${m.modelLoadMs} |`);
writeFileSync(join(outDir, "measurements.md"), [
  "# Measurements (headless Chromium/WebKit on the development machine)",
  "",
  "| Scenario | Tier | Avg frame ms | Worst frame ms | Draw calls | Triangles | Canvas px | JS heap MB | Models KB | Model load ms |",
  "| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: |",
  ...rows,
  ""
].join("\n"));
console.log(`Review pack written to ${outDir} (${readdirSync(outDir).length} files)`);
