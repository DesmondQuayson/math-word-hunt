/**
 * Math Race Champions — racing audio audit. Renders the synthesised race
 * sound offline in real browser engines (no loudspeaker, no dev server) and
 * measures it:
 *
 *   - every car idles, pulls through its gears and runs down, with no clipping,
 *     no NaN and no click at the start or the end;
 *   - the four cars are equally loud (A-weighted) and differ in tone;
 *   - a correct answer makes the engine rise; a wrong answer never does;
 *   - a nearby rival is quieter than the player's engine and sits to one side;
 *   - starting and stopping races leaves silence behind (no runaway loops);
 *   - the engine sits above the ducked MathNexa music.
 *
 *   node scripts/math-race-champions-audio-audit.mjs [--browser=chromium|firefox|webkit|all] [--calibrate]
 *
 * Playwright's WebKit build for Windows ships without Web Audio (no AudioContext
 * at all), so there the synthesiser cannot run and the audit says so instead of
 * measuring; the game itself then plays music only, as it does in any browser
 * without Web Audio. Safari on a Mac, iPhone or iPad has Web Audio.
 *
 * Writes qa-artifacts/math-race-champions/audio-audit.json. Exits 1 on a failed check.
 */
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, firefox, webkit } from "@playwright/test";

process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const PUBLIC = resolve("apps/platform-web/public");
const OUT = resolve("qa-artifacts/math-race-champions");
const arg = name => process.argv.find(value => value.startsWith(`--${name}=`))?.split("=")[1];
const which = arg("browser") ?? "all";
const calibrate = process.argv.includes("--calibrate");
const TYPES = { ".js": "text/javascript", ".html": "text/html", ".mp3": "audio/mpeg", ".css": "text/css" };

const server = createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url, "http://local").pathname);
  if (path === "/audit.html") {
    response.writeHead(200, { "content-type": "text/html" });
    return response.end("<!doctype html><meta charset=utf-8><title>audio audit</title>");
  }
  const file = normalize(join(PUBLIC, path));
  if (!file.startsWith(PUBLIC) || !existsSync(file) || !statSync(file).isFile()) {
    response.writeHead(404);
    return response.end();
  }
  response.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(response);
});
await new Promise(done => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;

/** Runs inside the browser page. */
async function audit(options) {
  const base = "/internal-games/math-race-champions/src/";
  const { RaceSound } = await import(`${base}sound/race-sound.js`);
  const { ENGINE_PROFILES } = await import(`${base}sound/engine-model.js`);
  const { CARS, ONLINE_CAR, applyAnswer, newRacerState, raceSpec, viewAt } = await import(`${base}engine/race.js`);
  const audioModule = await import(`${base}audio.js`);
  const RATE = 44100;
  const STEP = 1 / 60;
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!Offline) return { skipped: "This browser build has no Web Audio (no AudioContext, no OfflineAudioContext): the race synthesiser cannot run here.", webAudio: false, audioElement: typeof window.Audio === "function", checks: [] };

  // ---- measurement ---------------------------------------------------------
  const db = value => (value > 0 ? 20 * Math.log10(value) : -200);
  const slice = (data, from, to) => data.subarray(Math.floor(from * RATE), Math.floor(to * RATE));
  const rms = data => Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / Math.max(1, data.length));
  const peak = data => data.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
  const finite = data => data.every(value => Number.isFinite(value));

  function fft(real, imag) {
    const n = real.length;
    for (let i = 1, j = 0; i < n; i += 1) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        [real[i], real[j]] = [real[j], real[i]];
        [imag[i], imag[j]] = [imag[j], imag[i]];
      }
    }
    for (let size = 2; size <= n; size <<= 1) {
      const angle = (-2 * Math.PI) / size;
      const wr = Math.cos(angle);
      const wi = Math.sin(angle);
      for (let start = 0; start < n; start += size) {
        let cr = 1;
        let ci = 0;
        for (let k = 0; k < size / 2; k += 1) {
          const a = start + k;
          const b = a + size / 2;
          const tr = real[b] * cr - imag[b] * ci;
          const ti = real[b] * ci + imag[b] * cr;
          real[b] = real[a] - tr;
          imag[b] = imag[a] - ti;
          real[a] += tr;
          imag[a] += ti;
          [cr, ci] = [cr * wr - ci * wi, cr * wi + ci * wr];
        }
      }
    }
  }

  const aWeight = f => {
    if (f < 10) return 0;
    const f2 = f * f;
    return (12194 ** 2 * f2 * f2) / ((f2 + 20.6 ** 2) * Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) * (f2 + 12194 ** 2)) * 1.2589;
  };

  /** A-weighted level, spectral centroid and the strongest frequency of a stretch of sound. */
  function spectrum(data) {
    const N = 8192;
    const power = new Float64Array(N / 2);
    let windows = 0;
    for (let start = 0; start + N <= data.length; start += N / 2) {
      const real = new Float64Array(N);
      const imag = new Float64Array(N);
      for (let i = 0; i < N; i += 1) real[i] = data[start + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
      fft(real, imag);
      for (let i = 0; i < N / 2; i += 1) power[i] += real[i] * real[i] + imag[i] * imag[i];
      windows += 1;
    }
    let total = 0;
    let weighted = 0;
    let moment = 0;
    let best = 0;
    let low = 0;
    for (let i = 1; i < N / 2; i += 1) {
      const f = (i * RATE) / N;
      const p = power[i] / Math.max(1, windows);
      total += p;
      weighted += p * aWeight(f) ** 2;
      moment += p * f;
      if (f < 250) low += p;
      if (p > power[best] / Math.max(1, windows)) best = i;
    }
    // Hann window power gain 0.375; two-sided spectrum.
    const scale = 2 / (N * N * 0.375);
    return { aRms: Math.sqrt(weighted * scale), centroid: total > 0 ? moment / total : 0, strongest: (best * RATE) / N, lowShare: total > 0 ? low / total : 0 };
  }

  // ---- rendering ------------------------------------------------------------
  /**
   * Render `seconds` of sound. `setup(context)` builds things; `frame(k, t)` is
   * called every 60th of a second of rendered time, as the race screen would.
   */
  async function render(seconds, setup, frame) {
    const context = new Offline(2, Math.ceil(seconds * RATE), RATE);
    const state = setup(context);
    const steps = Math.floor(seconds / STEP);
    const canSuspend = typeof context.suspend === "function";
    if (!canSuspend) throw new Error("OfflineAudioContext.suspend is not available");
    for (let k = 1; k < steps; k += 1) {
      const at = k * STEP;
      context.suspend(at).then(() => {
        try {
          frame(state, k, at);
        } finally {
          context.resume();
        }
      });
    }
    frame(state, 0, 0);
    const buffer = await context.startRendering();
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    const mid = new Float32Array(left.length);
    for (let i = 0; i < mid.length; i += 1) mid[i] = (left[i] + right[i]) / 2;
    return { left, right, mid, state };
  }

  const LEVEL = options.level;
  const raceSound = (context, key, extra = {}) => {
    let seed = 12345;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
    return new RaceSound(context, context.destination, key, { level: LEVEL, random, ...extra });
  };

  const checks = [];
  const check = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), detail });
  const cars = {};
  const allCars = [...CARS, ONLINE_CAR];

  for (const car of allCars) {
    const key = car.key;
    const frames = [];
    // 0-2 s idle on the grid, 2-9 s a full pull to top speed, 9-10.5 s cruise, 10.5-13 s lift and run down.
    const run = await render(
      13,
      context => ({ sound: raceSound(context, key) }),
      (state, k, t) => {
        const speed = t < 2 ? 0 : t < 10.5 ? car.topSpeed : 0;
        if (k === Math.round(2 / STEP)) state.sound.boost();
        if (k === Math.round(10.5 / STEP)) state.sound.lift();
        frames.push({ t, ...state.sound.update(STEP, { speed, topSpeed: car.topSpeed, distanceM: 0 }, []) });
      }
    );
    const idle = slice(run.mid, 0.8, 2);
    const pull = slice(run.mid, 2.3, 5.3);
    const top = slice(run.mid, 9.2, 10.4);
    const down = slice(run.mid, 12, 13);
    const profile = ENGINE_PROFILES[key];
    const idleSpectrum = spectrum(idle);
    const pullSpectrum = spectrum(pull);
    const topSpectrum = spectrum(top);
    const shifts = frames.filter(frame => frame.shifted === 1).length;
    cars[key] = {
      idle: { rmsDb: db(rms(idle)), aDb: db(idleSpectrum.aRms), centroid: Math.round(idleSpectrum.centroid), firing: Number(frames[100].firing.toFixed(1)) },
      pull: { rmsDb: db(rms(pull)), aDb: db(pullSpectrum.aRms), centroid: Math.round(pullSpectrum.centroid), lowShare: Number(pullSpectrum.lowShare.toFixed(3)) },
      top: { rmsDb: db(rms(top)), aDb: db(topSpectrum.aRms), centroid: Math.round(topSpectrum.centroid), firing: Number(frames[Math.round(10 / STEP)].firing.toFixed(1)), rpm: Math.round(frames[Math.round(10 / STEP)].rpm) },
      runDown: { rmsDb: db(rms(down)), rpm: Math.round(frames[frames.length - 1].rpm) },
      peak: Number(peak(run.mid).toFixed(3)),
      peakDb: db(peak(run.mid)),
      firstMsPeak: Number(peak(slice(run.mid, 0, 0.003)).toFixed(5)),
      shifts,
      trim: profile.trim
    };
    check(`${key}: sound is finite`, finite(run.left) && finite(run.right));
    check(`${key}: no clipping (peak under 0.9 before the limiter)`, cars[key].peak < 0.9, cars[key].peak);
    check(`${key}: fades in, no click at the start`, cars[key].firstMsPeak < 0.01, cars[key].firstMsPeak);
    check(`${key}: idles audibly, well under a pull`, cars[key].idle.aDb > -50 && cars[key].idle.aDb < cars[key].pull.aDb - 6, [cars[key].idle.aDb, cars[key].pull.aDb]);
    check(`${key}: a pull is clearly louder than idle`, cars[key].pull.aDb > cars[key].idle.aDb + 6, [cars[key].idle.aDb, cars[key].pull.aDb]);
    check(`${key}: changes up through every gear`, shifts === profile.gears - 1, shifts);
    check(`${key}: firing note rises from idle to the top of the last gear`, cars[key].top.firing > cars[key].idle.firing * 4, [cars[key].idle.firing, cars[key].top.firing]);
    check(`${key}: runs down to idle after the lift`, Math.abs(cars[key].runDown.rpm - profile.idle) < 40 && cars[key].runDown.rmsDb < cars[key].pull.rmsDb - 6, cars[key].runDown);
  }

  // Equal loudness, different voices.
  const garage = CARS.map(car => cars[car.key]);
  const loud = garage.map(car => car.pull.aDb);
  const spread = Math.max(...loud) - Math.min(...loud);
  check("the four cars are equally loud on a pull (A-weighted, within 1.5 dB)", spread < 1.5, loud.map(value => Number(value.toFixed(2))));
  const [starter, sprint, gt, thunder] = garage;
  check("Starter is the plainest voice, Thunder X the brightest", starter.pull.centroid < sprint.pull.centroid && sprint.pull.centroid < thunder.pull.centroid, garage.map(car => car.pull.centroid));
  check("Velocity GT is the deepest voice", gt.pull.lowShare > Math.max(starter.pull.lowShare, sprint.pull.lowShare, thunder.pull.lowShare), garage.map(car => car.pull.lowShare));
  check("every car idles on its own note", new Set(garage.map(car => Math.round(car.idle.firing))).size === 4, garage.map(car => car.idle.firing));
  const suggestedTrims = Object.fromEntries(allCars.map(car => [car.key, Number((ENGINE_PROFILES[car.key].trim * 10 ** ((options.targetADb - cars[car.key].pull.aDb) / 20)).toFixed(2))]));

  // Correct answer: rises. Wrong answer: never rises.
  const answers = {};
  for (const car of CARS) {
    const spec = raceSpec(car, 6);
    let state = newRacerState();
    const marks = {};
    const frames = [];
    const run = await render(
      12,
      context => ({ sound: raceSound(context, car.key) }),
      (holder, k, t) => {
        const ms = t * 1000;
        // Correct at 1, 2.5, 4 and 5.5 s; wrong at 8 s.
        for (const at of [1, 2.5, 4, 5.5]) {
          if (k === Math.round(at / STEP)) {
            state = applyAnswer(state, spec, ms, true).state;
            holder.sound.boost();
          }
        }
        if (k === Math.round(8 / STEP)) {
          marks.before = viewAt(state, spec, ms).speed;
          state = applyAnswer(state, spec, ms, false).state;
          marks.after = viewAt(state, spec, ms).speed;
          holder.sound.lift();
        }
        frames.push(holder.sound.update(STEP, { speed: viewAt(state, spec, ms).speed, topSpeed: car.topSpeed, distanceM: 0 }, []));
      }
    );
    const at = seconds => frames[Math.round(seconds / STEP)];
    const beforeCorrect = spectrum(slice(run.mid, 4.9, 5.5));
    const afterCorrect = spectrum(slice(run.mid, 5.6, 6.2));
    const beforeWrong = spectrum(slice(run.mid, 7.3, 8));
    const afterWrong = spectrum(slice(run.mid, 8.6, 9.3));
    const afterFrames = frames.slice(Math.round(8 / STEP) + 1, Math.round(9.3 / STEP));
    answers[car.key] = {
      correct: { firingBefore: at(5.45).firing, firingAfter: at(6.1).firing, aDbBefore: db(beforeCorrect.aRms), aDbAfter: db(afterCorrect.aRms), throttlePeak: Math.max(...frames.slice(Math.round(5.5 / STEP), Math.round(6.1 / STEP)).map(frame => frame.throttle)) },
      wrong: { raceSpeedBefore: marks.before, raceSpeedAfter: marks.after, firingBefore: at(7.95).firing, firingAfter: at(9.2).firing, aDbBefore: db(beforeWrong.aRms), aDbAfter: db(afterWrong.aRms), throttleMax: Math.max(...afterFrames.map(frame => frame.throttle)), speedRose: afterFrames.some((frame, index) => index > 0 && frame.speed > afterFrames[index - 1].speed + 1e-9) }
    };
    const result = answers[car.key];
    check(`${car.key}: a correct answer opens the throttle and the engine rises`, result.correct.throttlePeak > 0.9 && result.correct.firingAfter > result.correct.firingBefore * 0.99 && result.correct.aDbAfter > result.correct.aDbBefore, result.correct);
    check(`${car.key}: a wrong answer gives no acceleration sound (throttle shut, engine speed never rises, level falls)`, result.wrong.throttleMax < 0.31 && !result.wrong.speedRose && result.wrong.aDbAfter < result.wrong.aDbBefore && result.wrong.raceSpeedAfter < result.wrong.raceSpeedBefore, result.wrong);
    check(`${car.key}: whole race is finite and unclipped`, finite(run.mid) && peak(run.mid) < 0.9, peak(run.mid));
  }

  // A nearby rival: quieter than the player, to one side.
  const cruise = (withRival, side) =>
    render(
      5,
      context => ({ sound: raceSound(context, "circuit-standard") }),
      (holder, k, t) => {
        if (k === 0) holder.sound.boost();
        holder.sound.update(STEP, { speed: 110, topSpeed: 180, distanceM: 110 * t / 3.6 }, withRival ? [{ id: "r", distanceM: 110 * t / 3.6 + 4, speed: 110, side }] : []);
      }
    );
  const alone = await cruise(false, 1);
  const beside = await cruise(true, 1);
  const difference = { left: new Float32Array(alone.left.length), right: new Float32Array(alone.left.length) };
  for (let i = 0; i < difference.left.length; i += 1) {
    difference.left[i] = beside.left[i] - alone.left[i];
    difference.right[i] = beside.right[i] - alone.right[i];
  }
  const rival = {
    playerDb: db(rms(slice(alone.mid, 3, 5))),
    rivalLeftDb: db(rms(slice(difference.left, 3, 5))),
    rivalRightDb: db(rms(slice(difference.right, 3, 5)))
  };
  check("a rival four metres away is quieter than the player's own engine", Math.max(rival.rivalLeftDb, rival.rivalRightDb) < rival.playerDb - 3, rival);
  check("a rival on the right is heard more on the right, but not hard-panned", rival.rivalRightDb > rival.rivalLeftDb + 1 && rival.rivalLeftDb > -90, rival);
  const far = await render(
    3,
    context => ({ sound: raceSound(context, "circuit-standard") }),
    (holder, k, t) => {
      if (k === 0) holder.sound.boost();
      holder.sound.update(STEP, { speed: 110, topSpeed: 180, distanceM: 110 * t / 3.6 }, Array.from({ length: 49 }, (_, index) => ({ id: `far${index}`, distanceM: 110 * t / 3.6 + 60 + index * 9, speed: 110, side: index % 2 ? 1 : -1 })));
    }
  );
  const farAlone = await render(
    3,
    context => ({ sound: raceSound(context, "circuit-standard") }),
    (holder, k, t) => {
      if (k === 0) holder.sound.boost();
      holder.sound.update(STEP, { speed: 110, topSpeed: 180, distanceM: 110 * t / 3.6 }, []);
    }
  );
  let farDifference = 0;
  for (let i = 0; i < far.mid.length; i += 1) farDifference = Math.max(farDifference, Math.abs(far.mid[i] - farAlone.mid[i]));
  check("49 distant racers add nothing at all (no wall of engines)", farDifference < 1e-4, farDifference);

  // One-off sounds exist and stay in range.
  const shots = await render(
    4,
    context => ({ sound: raceSound(context, "turbo-sprint") }),
    (holder, k) => {
      holder.sound.update(STEP, { speed: 0, topSpeed: 185, distanceM: 0 }, []);
      if (k === Math.round(0.5 / STEP)) holder.sound.pass(true, 1);
      if (k === Math.round(1.5 / STEP)) holder.sound.pass(false, -1);
      if (k === Math.round(2.5 / STEP)) holder.sound.finishLine();
    }
  );
  const quiet = db(rms(slice(shots.mid, 0.2, 0.45)));
  const passGain = db(rms(slice(shots.mid, 0.55, 0.95)));
  const passLoss = db(rms(slice(shots.mid, 1.55, 1.95)));
  const line = db(rms(slice(shots.mid, 2.55, 3.2)));
  check("overtaking, being overtaken and the finish line each make a sound over the idle", passGain > quiet + 3 && passLoss > quiet + 2 && line > quiet + 3, { quiet, passGain, passLoss, line });
  check("one-off sounds do not clip", peak(shots.mid) < 0.9, peak(shots.mid));

  // Lifecycle: start and stop many races; nothing is left sounding.
  const lifecycle = await render(
    9,
    context => ({ sounds: [], context }),
    (holder, k, t) => {
      const slot = Math.floor(t / 0.5);
      if (slot < 12 && k === Math.round((slot * 0.5) / STEP)) {
        holder.sounds.forEach(sound => sound.stop(0.1));
        holder.sounds = [raceSound(holder.context, CARS[slot % 4].key)];
        holder.sounds[0].boost();
      }
      if (k === Math.round(6.2 / STEP)) holder.sounds.forEach(sound => sound.stop(0.25));
      holder.sounds.forEach(sound => {
        if (!sound.stopped) {
          sound.update(STEP, { speed: 150, topSpeed: 160, distanceM: 0 }, []);
          if (k % 20 === 0) sound.lift();
          if (k % 20 === 10) sound.boost();
        }
      });
    }
  );
  const tail = db(rms(slice(lifecycle.mid, 7.5, 9)));
  check("twelve races started and stopped leave silence behind (no runaway loop)", tail < -90, tail);
  check("restarting races does not clip or stack up", finite(lifecycle.mid) && peak(lifecycle.mid) < 0.9, peak(lifecycle.mid));

  // The MathNexa track under a race.
  let music = null;
  try {
    const bytes = await (await fetch(audioModule.MUSIC_TRACK.path)).arrayBuffer();
    const decodeContext = new Offline(2, RATE, RATE);
    const decoded = await decodeContext.decodeAudioData(bytes);
    const channel = decoded.getChannelData(0);
    const middle = channel.subarray(Math.floor(channel.length * 0.3), Math.floor(channel.length * 0.3) + decoded.sampleRate * 20);
    const trackRms = rms(middle);
    const menu = db(trackRms * audioModule.MUSIC_VOLUME);
    const underRace = db(trackRms * audioModule.MUSIC_VOLUME * audioModule.RACE_MUSIC_DUCK);
    const enginePull = Math.min(...CARS.map(car => cars[car.key].pull.rmsDb));
    const engineTop = Math.min(...CARS.map(car => cars[car.key].top.rmsDb));
    music = { seconds: Number(decoded.duration.toFixed(1)), bytes: bytes.byteLength, trackRmsDb: db(trackRms), menuDb: menu, underRaceDb: underRace, quietestEnginePullDb: enginePull, quietestEngineCruiseDb: engineTop };
    check("music is turned down under a race", underRace < menu - 4, music);
    check("the engine on a pull is above the ducked music (by 3 dB or more)", enginePull > underRace + 3, music);
    check("the engine at a cruise is not buried by the music", engineTop > underRace - 3, music);
  } catch (error) {
    check("the MathNexa music track can be read", false, String(error));
  }

  return { rate: RATE, level: LEVEL, cars, suggestedTrims, answers, rival, lifecycle: { tailDb: tail }, music, checks };
}

const report = { generatedAt: new Date().toISOString(), engines: {} };
let failed = 0;
for (const [name, type] of [["chromium", chromium], ["firefox", firefox], ["webkit", webkit]]) {
  if (which !== "all" && which !== name) continue;
  let browser;
  try {
    browser = await type.launch();
  } catch (error) {
    report.engines[name] = { skipped: `Could not launch: ${String(error.message).split(/\r?\n/)[0]}`, checks: [] };
    console.log(`SKIP [${name}] ${report.engines[name].skipped}`);
    continue;
  }
  try {
    const page = await browser.newPage();
    page.on("pageerror", error => console.error(`${name} page error:`, error.message));
    await page.goto(`${origin}/audit.html`);
    const result = await page.evaluate(audit, { level: 0.5, targetADb: -24 });
    report.engines[name] = result;
    if (result.skipped) console.log(`SKIP [${name}] ${result.skipped}`);
    for (const item of result.checks) {
      if (!item.pass) failed += 1;
      console.log(`${item.pass ? "PASS" : "FAIL"} [${name}] ${item.name}${item.pass ? "" : ` :: ${JSON.stringify(item.detail)}`}`);
    }
    if (calibrate && !result.skipped) {
      console.log(`[${name}] pull A-weighted dB:`, Object.fromEntries(Object.entries(result.cars).map(([key, car]) => [key, Number(car.pull.aDb.toFixed(2))])));
      console.log(`[${name}] suggested trims:`, result.suggestedTrims);
      console.log(`[${name}] cars:`, JSON.stringify(result.cars, null, 1));
      console.log(`[${name}] music:`, result.music);
    }
  } finally {
    await browser.close();
  }
}
server.close();
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "audio-audit.json"), `${JSON.stringify(report, null, 2)}\n`);
const total = Object.values(report.engines).reduce((sum, engine) => sum + engine.checks.length, 0);
if (!Object.values(report.engines).some(engine => engine.checks.length > 0)) failed += 1;
console.log(`${total - failed}/${total} audio checks passed${failed ? `, ${failed} FAILED` : ""}`);
process.exit(failed ? 1 : 0);
