import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CARS, ONLINE_CAR, applyAnswer, newRacerState, raceSpec, viewAt } from "@/public/internal-games/math-race-champions/src/engine/race.js";
import {
  CRUISE_THROTTLE,
  ENGINE_PROFILES,
  RIVAL_EARSHOT_M,
  RIVAL_MAX_LEVEL,
  RIVAL_MAX_PAN,
  RIVAL_VOICES,
  createEngineModel,
  engineProfile,
  firingFrequency,
  gearTops,
  rivalMix,
  rpmInGear,
  type EngineFrame
} from "@/public/internal-games/math-race-champions/src/sound/engine-model.js";

const FRAME = 1 / 60;
const source = (file: string) => readFileSync(join(process.cwd(), "public/internal-games/math-race-champions/src", file), "utf8");

/** Run the engine for `seconds` at a race speed and return every frame. */
function run(model: ReturnType<typeof createEngineModel>, seconds: number, speed: number | ((t: number) => number), topSpeed: number): EngineFrame[] {
  const frames: EngineFrame[] = [];
  for (let t = 0; t < seconds; t += FRAME) frames.push(model.step(FRAME, typeof speed === "number" ? speed : speed(t), topSpeed));
  return frames;
}

const last = <T>(items: readonly T[]) => items[items.length - 1];

describe("every car has an engine voice", () => {
  it("the four garage cars and the Online Race car each have their own profile", () => {
    for (const car of [...CARS, ONLINE_CAR]) {
      expect(ENGINE_PROFILES[car.key], car.key).toBeDefined();
      expect(engineProfile(car.key).key).toBe(car.key);
    }
    expect(Object.keys(ENGINE_PROFILES).sort()).toEqual([...CARS.map(car => car.key), ONLINE_CAR.key].sort());
  });

  it("an unknown car gets the standard engine, never silence or an error", () => {
    expect(engineProfile("no-such-car").key).toBe("circuit-standard");
  });

  it("the cars differ in tone: firing note, harmonics, brightness and character", () => {
    const [starter, sprint, gt, thunder] = CARS.map(car => engineProfile(car.key));
    // Idle firing note: the V8 and the ten are their own notes, not the four's.
    const idle = [starter, sprint, gt, thunder].map(profile => Math.round(firingFrequency(profile, profile.idle)));
    expect(new Set(idle).size).toBe(4);
    // Brightness and bite climb with the car; the Starter is the simplest voice.
    expect(starter.tail).toBeLessThan(sprint.tail);
    expect(sprint.tail).toBeLessThan(thunder.tail);
    expect(starter.grit).toBeLessThan(sprint.grit);
    expect(sprint.grit).toBeLessThan(thunder.grit);
    expect(thunder.bright).toBeGreaterThan(sprint.bright);
    expect(thunder.redline).toBeGreaterThan(sprint.redline);
    expect(thunder.response).toBeLessThan(starter.response);
    // The GT is the deep one: lowest resonance, most weight, strongest half-order rumble.
    expect(gt.body).toBeLessThan(Math.min(starter.body, sprint.body, thunder.body));
    expect(gt.bright).toBeLessThan(Math.min(starter.bright, sprint.bright, thunder.bright));
    expect(gt.formant).toBeLessThan(Math.min(starter.formant, sprint.formant, thunder.formant));
    expect(gt.sub).toBeGreaterThan(Math.max(starter.sub, sprint.sub, thunder.sub));
    // Only the Turbo Sprint whistles; the Starter never crackles.
    expect([starter.turbo, sprint.turbo, gt.turbo, thunder.turbo]).toEqual([0, 1, 0, 0]);
    expect(starter.crackle).toBe(0);
  });

  it("a dearer car is not simply louder: the brighter the voice, the more it is trimmed back", () => {
    // The trims are measured (scripts/math-race-champions-audio-audit.mjs levels the cars
    // to the same A-weighted loudness); here, only that no dearer car is turned UP.
    const [starter, sprint, gt, thunder] = CARS.map(car => engineProfile(car.key).trim);
    expect(Math.max(sprint, gt, thunder)).toBeLessThanOrEqual(starter);
    expect(thunder).toBeLessThan(Math.min(starter, sprint, gt));
  });
});

describe("gears", () => {
  it.each(Object.values(ENGINE_PROFILES))("$key: gear tops rise to exactly top speed, closer together higher up", profile => {
    const tops = gearTops(profile);
    expect(tops).toHaveLength(profile.gears);
    expect(last(tops)).toBeCloseTo(1, 10);
    for (let index = 1; index < tops.length; index += 1) expect(tops[index]).toBeGreaterThan(tops[index - 1]);
    const ratios = tops.slice(1).map((top, index) => tops[index] / top);
    for (let index = 1; index < ratios.length; index += 1) expect(ratios[index]).toBeGreaterThan(ratios[index - 1]);
  });

  it.each(Object.values(ENGINE_PROFILES))("$key: revs stay between idle and the redline at any speed in any gear", profile => {
    for (let gear = 0; gear < profile.gears; gear += 1) {
      for (let share = 0; share <= 1.2; share += 0.01) {
        const rpm = rpmInGear(profile, share, gear);
        expect(rpm).toBeGreaterThanOrEqual(profile.idle);
        expect(rpm).toBeLessThanOrEqual(profile.redline);
      }
    }
  });
});

describe("the engine follows the car", () => {
  it.each(CARS)("$key idles on the grid: idle revs, throttle shut, first gear", car => {
    const model = createEngineModel(car.key);
    const frame = last(run(model, 2, 0, car.topSpeed));
    expect(frame.rpm).toBeCloseTo(model.profile.idle, 0);
    expect(frame.throttle).toBeLessThan(0.01);
    expect(frame.gear).toBe(0);
    expect(frame.speed).toBe(0);
  });

  it.each(CARS)("$key: a correct answer opens the throttle and the revs climb", car => {
    const model = createEngineModel(car.key);
    run(model, 1, 0, car.topSpeed);
    model.boost();
    const frames = run(model, 0.5, car.boost, car.topSpeed);
    expect(Math.max(...frames.map(frame => frame.throttle))).toBeGreaterThan(0.9);
    expect(last(frames).rpm).toBeGreaterThan(model.profile.idle * 1.3);
    expect(frames.some(frame => frame.climbing)).toBe(true);
    // The climb is gradual, the way a car gathers speed: never a jump.
    for (let index = 1; index < frames.length; index += 1) expect(Math.abs(frames[index].rpm - frames[index - 1].rpm)).toBeLessThan(model.profile.redline * 0.12);
  });

  it.each(CARS)("$key: a wrong answer shuts the throttle and nothing accelerates", car => {
    const model = createEngineModel(car.key);
    model.boost();
    const before = last(run(model, 3, car.topSpeed * 0.6, car.topSpeed));
    // The race model cuts the speed above idle to two fifths; the engine is told to lift.
    model.lift();
    const after = run(model, 1.2, 30 + (car.topSpeed * 0.6 - 30) * 0.4, car.topSpeed);
    expect(Math.max(...after.map(frame => frame.throttle))).toBeLessThanOrEqual(before.throttle + 1e-9);
    expect(last(after).throttle).toBeLessThan(0.02);
    expect(after.every(frame => frame.lifted && !frame.climbing)).toBe(true);
    // Road speed only ever falls after the lift.
    for (let index = 1; index < after.length; index += 1) expect(after[index].speed).toBeLessThanOrEqual(after[index - 1].speed + 1e-9);
    expect(last(after).speed).toBeLessThan(before.speed);
    // Revs only ever fall until the first change down (which, as in a real car, brings them up to the lower gear).
    for (let index = 1; index < after.length; index += 1) {
      if (after.slice(0, index + 1).every(frame => frame.shifted === 0)) {
        expect(after[index].rpm).toBeLessThanOrEqual(after[index - 1].rpm + 1e-6);
      }
    }
  });

  it("a wrong answer on the grid changes nothing at all", () => {
    const model = createEngineModel("starter");
    run(model, 1, 0, 160);
    model.lift();
    const frames = run(model, 2, 0, 160);
    expect(frames.every(frame => frame.throttle < 0.001 && Math.abs(frame.rpm - model.profile.idle) < 1 && !frame.crackle && !frame.blowOff)).toBe(true);
  });

  it.each(CARS)("$key changes up through every gear on the way to top speed, and down again", car => {
    const model = createEngineModel(car.key);
    const up = run(model, 12, car.topSpeed, car.topSpeed);
    expect(up.filter(frame => frame.shifted === 1)).toHaveLength(model.profile.gears - 1);
    expect(last(up).gear).toBe(model.profile.gears - 1);
    expect(last(up).rpm).toBeGreaterThan(model.profile.redline * 0.9);
    // Each change up drops the revs and cuts the drive for a moment.
    const shiftIndex = up.findIndex(frame => frame.shifted === 1);
    expect(Math.min(...up.slice(shiftIndex, shiftIndex + 12).map(frame => frame.throttle))).toBeLessThan(0.5);
    const down = run(model, 10, 0, car.topSpeed);
    expect(down.filter(frame => frame.shifted === -1)).toHaveLength(model.profile.gears - 1);
    expect(last(down).gear).toBe(0);
    expect(last(down).rpm).toBeCloseTo(model.profile.idle, 0);
  });

  it("holds a light cruise while the race speed eases back between answers", () => {
    const model = createEngineModel("velocity-gt");
    model.boost();
    run(model, 4, 120, 210);
    const frames = run(model, 3, t => 120 - 6 * t, 210);
    expect(last(frames).throttle).toBeCloseTo(CRUISE_THROTTLE, 2);
    expect(frames.every(frame => !frame.lifted)).toBe(true);
  });

  it("only the turbocharged car builds boost and blows off; high-revving cars crackle on a lift", () => {
    const events = (key: string, topSpeed: number) => {
      const model = createEngineModel(key);
      model.boost();
      // Lifted in the middle of a hard pull, the way a wrong answer lands on a charging car.
      const flatOut = run(model, 2.4, topSpeed, topSpeed);
      model.lift();
      const lifted = run(model, 1, topSpeed * 0.5, topSpeed);
      return { turbo: Math.max(...flatOut.map(frame => frame.turbo)), blowOff: lifted.some(frame => frame.blowOff), crackle: lifted.some(frame => frame.crackle) };
    };
    expect(events("turbo-sprint", 185)).toMatchObject({ blowOff: true });
    expect(events("turbo-sprint", 185).turbo).toBeGreaterThan(0.6);
    expect(events("starter", 160)).toEqual({ turbo: 0, blowOff: false, crackle: false });
    expect(events("velocity-gt", 210)).toMatchObject({ turbo: 0, blowOff: false, crackle: true });
    expect(events("thunder-x", 240)).toMatchObject({ turbo: 0, blowOff: false, crackle: true });
  });

  it("survives a stalled tab, a bad number and a huge frame without leaving its range", () => {
    const model = createEngineModel("thunder-x");
    for (const [seconds, speed] of [[5, 240], [Number.NaN, 100], [0.016, Number.NaN], [-1, 300], [0.016, 1e9], [0, 0]] as const) {
      const frame = model.step(seconds, speed, 240);
      expect(Number.isFinite(frame.rpm) && Number.isFinite(frame.firing) && Number.isFinite(frame.throttle)).toBe(true);
      expect(frame.rpm).toBeGreaterThanOrEqual(model.profile.idle - 1);
      expect(frame.rpm).toBeLessThanOrEqual(model.profile.redline);
      expect(frame.throttle).toBeGreaterThanOrEqual(0);
      expect(frame.throttle).toBeLessThanOrEqual(1);
    }
  });
});

describe("the engine against the real race model", () => {
  it.each(CARS)("$key: revs rise after each correct answer and fall after a wrong one, over a whole race", car => {
    const spec = raceSpec(car, 5);
    const model = createEngineModel(car.key);
    let state = newRacerState();
    let now = 0;
    const speedAt = (ms: number) => viewAt(state, spec, ms).speed;
    const settle = (seconds: number) => {
      let frame = model.step(0, speedAt(now), car.topSpeed);
      for (let t = 0; t < seconds; t += FRAME) {
        now += FRAME * 1000;
        frame = model.step(FRAME, speedAt(now), car.topSpeed);
      }
      return frame;
    };
    let rose = 0;
    let fell = 0;
    for (let answer = 0; answer < 24; answer += 1) {
      const before = settle(1.5);
      const correct = answer % 4 !== 3;
      state = applyAnswer(state, spec, now, correct).state;
      if (correct) model.boost();
      else model.lift();
      const after = settle(0.7);
      if (correct && after.speed > before.speed) rose += 1;
      if (!correct) {
        expect(after.speed).toBeLessThan(before.speed);
        expect(after.throttle).toBeLessThan(0.05);
        fell += 1;
      }
    }
    expect(rose).toBeGreaterThanOrEqual(16);
    expect(fell).toBe(6);
  });
});

describe("rivals are heard sparingly", () => {
  const player = { distanceM: 1000, speed: 120 };
  const rival = (id: string, offset: number, speed = 120, extra: Record<string, unknown> = {}) => ({ id, distanceM: 1000 + offset, speed, side: 1, ...extra });

  it("never more than two voices, however big the room", () => {
    const pack = Array.from({ length: 49 }, (_, index) => rival(`r${index}`, (index - 24) * 1.5));
    expect(rivalMix(player, pack)).toHaveLength(RIVAL_VOICES);
    expect(RIVAL_VOICES).toBe(2);
  });

  it("the nearest cars are the ones heard, and nearer is louder", () => {
    const heard = rivalMix(player, [rival("far", 40), rival("near", 4), rival("mid", -15), rival("gone", 300)]);
    expect(heard.map(item => item.id)).toEqual(["near", "mid"]);
    expect(heard[0].level).toBeGreaterThan(heard[1].level);
  });

  it("a car out of earshot, or already finished, makes no sound", () => {
    expect(rivalMix(player, [rival("a", RIVAL_EARSHOT_M), rival("b", -RIVAL_EARSHOT_M - 1), rival("c", 2000)])).toEqual([]);
    expect(rivalMix(player, [rival("done", 2, 0, { finished: true })])).toEqual([]);
  });

  it("a rival is always quieter than the player's own engine and stays inside the stereo field", () => {
    for (let offset = -44; offset <= 44; offset += 1) {
      for (const side of [-1, 1]) {
        const [heard] = rivalMix(player, [rival("x", offset, 100, { side })]);
        expect(heard.level).toBeLessThanOrEqual(RIVAL_MAX_LEVEL);
        expect(heard.level).toBeLessThan(0.5);
        expect(Math.abs(heard.pan)).toBeLessThanOrEqual(RIVAL_MAX_PAN);
        expect(Math.sign(heard.pan)).toBe(side);
      }
    }
  });

  it("a closing car sounds a little higher, a parting car a little lower", () => {
    const closing = rivalMix({ distanceM: 1000, speed: 150 }, [rival("ahead", 20, 100)])[0];
    const parting = rivalMix({ distanceM: 1000, speed: 100 }, [rival("ahead", 20, 150)])[0];
    expect(closing.doppler).toBeGreaterThan(1);
    expect(parting.doppler).toBeLessThan(1);
    expect(closing.doppler).toBeLessThanOrEqual(1.08);
    expect(parting.doppler).toBeGreaterThanOrEqual(0.92);
  });
});

describe("how the sound is made and wired", () => {
  it("is synthesised: no recording is fetched, decoded or bundled for the race", () => {
    const raceSound = source("sound/race-sound.js");
    const model = source("sound/engine-model.js");
    for (const text of [raceSound, model]) {
      expect(text).not.toMatch(/fetch\(|decodeAudioData|new Audio\(|\.mp3|\.ogg|\.wav|\.m4a|https?:\/\//);
    }
    expect(raceSound).toContain("createOscillator");
    expect(raceSound).toContain("createPeriodicWave");
  });

  it("uses one shared noise buffer, and long-lived nodes steered by ramps", () => {
    const raceSound = source("sound/race-sound.js");
    expect(raceSound.match(/context\.createBuffer\(/g)).toHaveLength(1);
    expect(raceSound).toContain("noiseBuffers.get(context)");
    expect(raceSound).toContain("setTargetAtTime");
    expect(raceSound).toContain("MAX_ONE_SHOTS");
  });

  it("music is the approved shared MathNexa track, turned down under a race, never a second copy", () => {
    const audio = source("audio.js");
    expect(audio).toContain('path: "/media/audio/cosmic-candy-catchers.mp3"');
    expect(audio).toContain('author: "Eric Matyas"');
    expect(audio).toContain('license: "CC BY 3.0"');
    expect(audio.match(/\.mp3/g)).toHaveLength(1);
    expect(audio).toMatch(/RACE_MUSIC_DUCK = 0\.\d+/);
    expect(audio).toContain("createDynamicsCompressor");
  });

  it("the race screen opens the throttle on a correct answer and only lifts on a wrong one", () => {
    const screen = source("race/race-screen.js");
    const correct = screen.slice(screen.indexOf("if (outcome.correct) {"), screen.indexOf("} else {", screen.indexOf("if (outcome.correct) {")));
    const wrong = screen.slice(screen.indexOf("} else {", screen.indexOf("if (outcome.correct) {")), screen.indexOf("} catch (error)"));
    expect(correct).toContain("audio.raceBoost()");
    expect(correct).not.toContain("raceLift");
    expect(wrong).toContain("audio.raceLift()");
    expect(wrong).not.toContain("raceBoost");
    expect(wrong).not.toContain("audio.accelerate");
    expect(screen).toContain("audio.startRace(driver.car.key)");
    expect(screen).toContain("audio.stopRace()");
  });

  it("Classroom Competition has no engine: feedback, the football and the finish only", () => {
    const classroom = source("classroom/classroom.js") + source("classroom/setup.js") + source("classroom/track-view.js");
    expect(classroom).not.toMatch(/startRace|updateRace|raceBoost|raceLift|RaceSound/);
    expect(classroom).toContain("audio.correct()");
    expect(classroom).toContain("audio.incorrect()");
    expect(classroom).toContain("audio.hop()");
    expect(classroom).toContain("audio.victory()");
  });
});
