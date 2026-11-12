import { describe, expect, it } from "vitest";

import { normalizeSettings } from "@/public/internal-games/math-race-champions/src/engine/questions.js";
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_REWARD,
  CARS,
  CORRECT_LOCK_MS,
  IDLE_SPEED,
  MAX_RACE_MS,
  MIN_CORRECT,
  ONLINE_CAR,
  ONLINE_LENGTH_KM,
  STAGES,
  STARTER_CAR,
  TOTAL_EARNABLE,
  WRONG_LOCK_MS,
  advance,
  applyAnswer,
  cpuStateAt,
  cpuTimeline,
  distanceAllowed,
  evaluateRun,
  getCar,
  isRacerState,
  newRacerState,
  raceSpec,
  rankRacers,
  viewAt,
  type RaceCar,
  type RacerState
} from "@/public/internal-games/math-race-champions/src/engine/race.js";
import { createRandom } from "@/public/internal-games/math-race-champions/src/engine/random.js";

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;

/** A simulated person: thinks `interval` seconds per answer, right `accuracy` of the time. */
function person(car: Pick<RaceCar, "topSpeed" | "boost" | "decay">, lengthKm: number, interval: number, accuracy: number, seed: string): RacerState {
  const spec = raceSpec(car, lengthKm);
  const random = createRandom(seed);
  let state = newRacerState();
  let at = 0;
  while (state.finishMs === null && at < MAX_RACE_MS) {
    at = Math.max(at + interval * (0.7 + 0.6 * random.next()) * 1000, state.lockedUntil + 150);
    state = applyAnswer(state, spec, Math.round(at), random.next() < accuracy).state;
  }
  return state.finishMs === null ? advance(state, spec, MAX_RACE_MS) : state;
}

function winRate(car: RaceCar, stage: number, interval: number, accuracy: number, races = 120): number {
  let wins = 0;
  for (let index = 0; index < races; index += 1) {
    const cpu = cpuTimeline(stage, `balance-${index}`);
    const me = person(car, STAGES[stage - 1]!.lengthKm, interval, accuracy, `me-${car.key}-${stage}-${interval}-${index}`);
    if (me.finishMs !== null && cpu.finishMs !== null && me.finishMs < cpu.finishMs) wins += 1;
  }
  return wins / races;
}

describe("the garage", () => {
  it("has one free starter car and three premium cars at 2,000, 4,000 and 6,000 Race Dollars", () => {
    expect(CARS.map(car => [car.name, car.price])).toEqual([
      ["Street Starter", 0],
      ["Turbo Sprint", 2000],
      ["Velocity GT", 4000],
      ["Thunder X", 6000]
    ]);
    expect(CARS.map(car => car.recommended)).toEqual([[1, 2], [3, 6], [7, 8], [9, 10]]);
  });

  it("every dearer car is better on every statistic", () => {
    for (let index = 1; index < CARS.length; index += 1) {
      expect(CARS[index]!.topSpeed).toBeGreaterThan(CARS[index - 1]!.topSpeed);
      expect(CARS[index]!.boost).toBeGreaterThan(CARS[index - 1]!.boost);
      expect(CARS[index]!.decay).toBeLessThan(CARS[index - 1]!.decay);
    }
  });

  it("the online car is not a garage car", () => {
    expect(getCar(ONLINE_CAR.key)).toBeNull();
  });
});

describe("stages and rewards", () => {
  it("ten stages paying 500, then 100 more each: 9,500 in all", () => {
    expect(STAGES.map(stage => stage.reward)).toEqual([500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400]);
    expect(STAGES.reduce((sum, stage) => sum + stage.reward, 0)).toBe(9500);
  });

  it("the computer gets quicker and more accurate every stage", () => {
    for (let index = 1; index < STAGES.length; index += 1) {
      expect(STAGES[index]!.interval).toBeLessThan(STAGES[index - 1]!.interval);
      expect(STAGES[index]!.accuracy).toBeGreaterThan(STAGES[index - 1]!.accuracy);
    }
  });

  it("everything earnable buys exactly the three cars, and the first car is in reach after Stage 3", () => {
    expect(ACHIEVEMENTS).toHaveLength(10);
    expect(TOTAL_EARNABLE).toBe(12_000);
    expect(TOTAL_EARNABLE).toBe(CARS.reduce((sum, car) => sum + car.price, 0));
    // 500 + 600 + 700 = 1,800; the First Win achievement makes it 2,050.
    expect(500 + 600 + 700 + ACHIEVEMENT_REWARD).toBeGreaterThanOrEqual(CARS[1]!.price);
  });
});

describe("the racing model", () => {
  const spec = raceSpec(STARTER_CAR, 6);

  it("a correct answer accelerates; a wrong answer never makes the car faster", () => {
    let state = newRacerState();
    const first = applyAnswer(state, spec, 1000, true);
    expect(first.accepted).toBe(true);
    expect(first.state.v).toBeGreaterThan(state.v);
    expect(first.state.correct).toBe(1);
    state = applyAnswer(applyAnswer(first.state, spec, 1500, true).state, spec, 2000, true).state;
    const before = advance(state, spec, 3000);
    const wrong = applyAnswer(state, spec, 3000, false);
    expect(wrong.state.v).toBeLessThan(before.v);
    expect(wrong.state.v).toBeGreaterThanOrEqual(IDLE_SPEED);
    expect(wrong.state.x).toBeCloseTo(before.x, 12);
    expect(wrong.state.correct).toBe(3);
    expect(wrong.state.wrong).toBe(1);
  });

  it("a wrong answer at idle speed or below changes no speed", () => {
    const idle = { ...newRacerState(), v: IDLE_SPEED, correct: 5, answered: 5 };
    expect(applyAnswer(idle, spec, 1000, false).state.v).toBeCloseTo(IDLE_SPEED, 9);
  });

  it("never exceeds the car's top speed", () => {
    for (const car of CARS) {
      const carSpec = raceSpec(car, 50);
      let state = newRacerState();
      for (let index = 0; index < 60; index += 1) state = applyAnswer(state, carSpec, (index + 1) * CORRECT_LOCK_MS, true).state;
      expect(state.v).toBeLessThanOrEqual(car.topSpeed + 1e-9);
      expect(state.maxSpeed).toBeCloseTo(car.topSpeed, 6);
    }
  });

  it("refuses answers before the start, while the buttons rest, and after the finish", () => {
    const state = newRacerState();
    expect(applyAnswer(state, spec, -1, true)).toMatchObject({ accepted: false, reason: "not-started" });
    const one = applyAnswer(state, spec, 1000, true).state;
    expect(applyAnswer(one, spec, 1000 + CORRECT_LOCK_MS - 1, true)).toMatchObject({ accepted: false, reason: "locked" });
    const two = applyAnswer(one, spec, 2000, false).state;
    expect(applyAnswer(two, spec, 2000 + WRONG_LOCK_MS - 1, true)).toMatchObject({ accepted: false, reason: "locked" });
    expect(applyAnswer(two, spec, 2000 + WRONG_LOCK_MS, true).accepted).toBe(true);
    const finished = person(STARTER_CAR, 2, 1, 1, "finish");
    expect(finished.finishMs).not.toBeNull();
    expect(applyAnswer(finished, raceSpec(STARTER_CAR, 2), finished.finishMs! + 10_000, true)).toMatchObject({ accepted: false, reason: "finished" });
  });

  it("is the same whatever the frame rate: one long step equals ten thousand short ones", () => {
    let coarse = applyAnswer(newRacerState(), spec, 500, true).state;
    let fine = coarse;
    coarse = advance(coarse, spec, 20_500);
    for (let at = 502; at <= 20_500; at += 2) fine = advance(fine, spec, at);
    expect(fine.x).toBeCloseTo(coarse.x, 9);
    expect(fine.v).toBeCloseTo(coarse.v, 9);
  });

  it("recognises a stored state and rejects a doctored one", () => {
    const state = person(STARTER_CAR, 2, 2, 0.9, "stored");
    expect(isRacerState(JSON.parse(JSON.stringify(state)))).toBe(true);
    expect(isRacerState({ ...state, correct: state.correct + 5 })).toBe(false);
    expect(isRacerState({ ...state, x: -1 })).toBe(false);
    expect(isRacerState(null)).toBe(false);
  });
});

describe("the 30-answer rule", () => {
  it("limits distance to correct/30 of the race", () => {
    expect(distanceAllowed(0, 6)).toBe(0);
    expect(distanceAllowed(15, 6)).toBe(3);
    expect(distanceAllowed(29, 6)).toBeLessThan(6);
    expect(distanceAllowed(30, 6)).toBe(6);
    expect(distanceAllowed(500, 6)).toBe(6);
  });

  it("no car can finish on 29 correct answers, however long it waits or however short the race", () => {
    for (const car of [...CARS, { ...ONLINE_CAR, price: 0, recommended: [1, 1], blurb: "" } as unknown as RaceCar]) {
      for (const lengthKm of [0.2, 1, STAGES[0]!.lengthKm, STAGES[9]!.lengthKm]) {
        const spec = raceSpec(car, lengthKm);
        let state = newRacerState();
        for (let index = 0; index < MIN_CORRECT - 1; index += 1) state = applyAnswer(state, spec, (index + 1) * 400, true).state;
        state = advance(state, spec, MAX_RACE_MS * 3);
        expect(state.correct).toBe(29);
        expect(state.finishMs).toBeNull();
        expect(state.x).toBeLessThan(lengthKm);
        expect(viewAt(state, spec, MAX_RACE_MS * 3).progress).toBeLessThan(1);
        // Wrong answers and waiting never help.
        for (let index = 0; index < 200; index += 1) state = applyAnswer(state, spec, MAX_RACE_MS * 3 + (index + 1) * WRONG_LOCK_MS, false).state;
        expect(state.finishMs).toBeNull();
        // The 30th correct answer opens the line.
        const at = state.lockedUntil + 10;
        state = advance(applyAnswer(state, spec, at, true).state, spec, at + MAX_RACE_MS);
        expect(state.correct).toBe(30);
        expect(state.finishMs).not.toBeNull();
      }
    }
  });

  it("holds in 4,000 simulated races: every finisher has at least 30 correct answers", () => {
    const random = createRandom("thirty");
    for (let index = 0; index < 4000; index += 1) {
      const car = random.pick(CARS);
      const stage = random.pick(STAGES);
      const state = person(car, stage.lengthKm, 0.3 + random.next() * 8, 0.4 + random.next() * 0.6, `sim-${index}`);
      if (state.finishMs !== null) expect(state.correct).toBeGreaterThanOrEqual(MIN_CORRECT);
      expect(state.x).toBeLessThanOrEqual(distanceAllowed(state.correct, stage.lengthKm) + 1e-9);
    }
  });

  it("a car with no credit left stands still until the next correct answer", () => {
    const spec = raceSpec(CARS[3]!, 3);
    let state = applyAnswer(newRacerState(), spec, 400, true).state;
    state = advance(state, spec, 120_000);
    expect(state.x).toBeCloseTo(0.1, 9);
    expect(viewAt(state, spec, 120_000).waiting).toBe(true);
    expect(viewAt(state, spec, 120_000).speed).toBe(0);
    state = applyAnswer(state, spec, 121_000, true).state;
    expect(advance(state, spec, 122_000).x).toBeGreaterThan(0.1);
  });
});

describe("the computer opponent", () => {
  it("is fully decided by its seed", () => {
    expect(cpuTimeline(4, "seed")).toEqual(cpuTimeline(4, "seed"));
    expect(cpuTimeline(4, "seed").finishMs).not.toBe(cpuTimeline(4, "other").finishMs);
  });

  it("finishes every stage in about five and three quarter minutes, with at least 30 correct answers", () => {
    for (const stage of STAGES) {
      const runs = Array.from({ length: 80 }, (_, index) => cpuTimeline(stage.stage, `pace-${index}`));
      for (const run of runs) {
        expect(run.finishMs).not.toBeNull();
        expect(run.correct).toBeGreaterThanOrEqual(MIN_CORRECT);
      }
      const seconds = median(runs.map(run => run.finishMs!)) / 1000;
      expect(seconds).toBeGreaterThan(320);
      expect(seconds).toBeLessThan(370);
    }
  });

  it("never answers instantly, never teleports, and moves only by answering", () => {
    for (const stage of STAGES) {
      const timeline = cpuTimeline(stage.stage, "honest");
      let previous = 0;
      for (const [at] of timeline.events) {
        expect(at - previous).toBeGreaterThanOrEqual(600);
        previous = at;
      }
      let last = 0;
      for (let at = 0; at <= timeline.finishMs!; at += 2000) {
        const { state, spec } = cpuStateAt(timeline, at);
        const now = advance(state, spec, at);
        // At most top speed for two seconds between samples.
        expect(now.x - last).toBeLessThanOrEqual((STARTER_CAR.topSpeed * 2) / 3600 + 1e-9);
        expect(now.x).toBeGreaterThanOrEqual(last - 1e-9);
        last = now.x;
      }
      const observed = timeline.events.filter(event => event[1] === 1).length / timeline.events.length;
      expect(Math.abs(observed - stage.accuracy)).toBeLessThan(0.2);
    }
  });

  it("is harder at every stage for the same person", () => {
    const rates = STAGES.map(stage => winRate(STARTER_CAR, stage.stage, 4.2, 0.88, 60));
    expect(rates[0]).toBeGreaterThan(0.95);
    expect(rates[9]).toBeLessThan(0.05);
    for (let index = 1; index < rates.length; index += 1) expect(rates[index]!).toBeLessThanOrEqual(rates[index - 1]! + 0.08);
  });
});

describe("balance", () => {
  it("a beginner can win Stage 1 in the starter car", () => {
    expect(winRate(STARTER_CAR, 1, 6, 0.8)).toBeGreaterThan(0.85);
  });

  it("the starter car can win Stage 10, with fast and accurate answers", () => {
    expect(winRate(STARTER_CAR, 10, 2.5, 0.95)).toBeGreaterThan(0.6);
    expect(winRate(STARTER_CAR, 10, 1.8, 0.97)).toBeGreaterThan(0.95);
    expect(winRate(STARTER_CAR, 10, 5, 0.85)).toBeLessThan(0.05);
  });

  it("each premium car is a real advantage where it is recommended, and never a guaranteed win", () => {
    const steady = [5, 0.85] as const;
    // Turbo Sprint: Stages 3 to 6.
    expect(winRate(CARS[1]!, 6, ...steady)).toBeGreaterThan(winRate(STARTER_CAR, 6, ...steady) + 0.3);
    // Velocity GT: Stages 7 and 8.
    expect(winRate(CARS[2]!, 8, ...steady)).toBeGreaterThan(winRate(CARS[1]!, 8, ...steady) + 0.3);
    // Thunder X: Stages 9 and 10.
    expect(winRate(CARS[3]!, 9, ...steady)).toBeGreaterThan(winRate(CARS[2]!, 9, ...steady) + 0.3);
    // The best car still loses to slow or careless answering.
    expect(winRate(CARS[3]!, 10, 7, 0.75)).toBeLessThan(0.05);
    expect(winRate(CARS[3]!, 9, 7, 0.75)).toBeLessThan(0.05);
    expect(winRate(CARS[3]!, 10, 3.5, 0.9)).toBeGreaterThan(0.9);
  });

  it("pressing at random as fast as possible does not beat thinking", () => {
    expect(winRate(STARTER_CAR, 3, 0.3, 0.5)).toBeLessThan(0.1);
    expect(winRate(CARS[3]!, 7, 0.3, 0.5)).toBeLessThan(0.05);
  });

  it("a typical race lasts a few minutes, and nobody is cut off at a fixed time", () => {
    const typical = median(Array.from({ length: 60 }, (_, index) => person(STARTER_CAR, STAGES[3]!.lengthKm, 5, 0.85, `len-${index}`).finishMs!));
    expect(typical / 60_000).toBeGreaterThan(4);
    expect(typical / 60_000).toBeLessThan(8);
    const slow = person(STARTER_CAR, STAGES[0]!.lengthKm, 14, 0.7, "slow");
    expect(slow.finishMs).not.toBeNull();
    expect(slow.finishMs!).toBeGreaterThan(8 * 60_000);
  });

  it("online: one car for everyone, five minutes for a steady racer, never fewer than 30 correct", () => {
    const times = Array.from({ length: 80 }, (_, index) => person(ONLINE_CAR, ONLINE_LENGTH_KM, 4.2, 0.88, `online-${index}`));
    const minutes = median(times.map(state => state.finishMs!)) / 60_000;
    expect(minutes).toBeGreaterThan(3.5);
    expect(minutes).toBeLessThan(7);
    for (const state of times) expect(state.correct).toBeGreaterThanOrEqual(MIN_CORRECT);
  });
});

describe("results and achievements", () => {
  const settings = normalizeSettings({ categories: "mixed", difficulty: "hard" });

  function finishedState(overrides: Partial<RacerState> = {}): RacerState {
    return { ...newRacerState(), t: 200_000, x: 6, v: 90, correct: 40, wrong: 2, answered: 42, streak: 5, bestStreak: 16, maxSpeed: 160, finishMs: 200_000, ...overrides };
  }

  it("a win needs the finish line, 30 correct answers and a time ahead of the computer", () => {
    expect(evaluateRun({ stage: 5, carKey: "starter", settings, state: finishedState(), cpuFinishMs: 210_000 }).won).toBe(true);
    expect(evaluateRun({ stage: 5, carKey: "starter", settings, state: finishedState(), cpuFinishMs: 190_000 }).won).toBe(false);
    expect(evaluateRun({ stage: 5, carKey: "starter", settings, state: finishedState(), cpuFinishMs: 200_000 }).won).toBe(false);
    expect(evaluateRun({ stage: 5, carKey: "starter", settings, state: finishedState({ finishMs: null }), cpuFinishMs: 210_000 }).won).toBe(false);
    expect(evaluateRun({ stage: 5, carKey: "starter", settings, state: finishedState({ correct: 29, answered: 31 }), cpuFinishMs: 210_000 }).won).toBe(false);
  });

  it("awards exactly the achievements the race earned", () => {
    const won = evaluateRun({ stage: 5, carKey: "starter", settings, state: finishedState(), cpuFinishMs: 210_000 });
    expect([...won.achievements].sort()).toEqual(["first-win", "hard-mode", "mixed-master", "sharp-90", "starter-hero", "streak-15", "top-speed"].sort());
    const flawless = evaluateRun({ stage: 1, carKey: "thunder-x", settings: normalizeSettings({ categories: ["powers"], difficulty: "easy" }), state: finishedState({ wrong: 0, answered: 40, bestStreak: 40, maxSpeed: 200 }), cpuFinishMs: 300_000 });
    expect([...flawless.achievements].sort()).toEqual(["first-win", "flawless", "sharp-90", "streak-15"].sort());
    const lost = evaluateRun({ stage: 5, carKey: "starter", settings, state: finishedState({ bestStreak: 3, maxSpeed: 120 }), cpuFinishMs: 100_000 });
    expect(lost.achievements).toEqual([]);
  });
});

describe("finish order", () => {
  it("is by finish time only; the same millisecond shares a place; unfinished racers follow by distance", () => {
    const ranked = rankRacers([
      { id: "late", finishMs: 300_500, x: 8 },
      { id: "dnf-far", finishMs: null, x: 6 },
      { id: "first", finishMs: 250_000, x: 8 },
      { id: "tie-a", finishMs: 280_000, x: 8 },
      { id: "dnf-near", finishMs: null, x: 2 },
      { id: "tie-b", finishMs: 280_000, x: 8 }
    ]);
    expect(ranked.map(racer => [racer.id, racer.place])).toEqual([
      ["first", 1],
      ["tie-a", 2],
      ["tie-b", 2],
      ["late", 4],
      ["dnf-far", 5],
      ["dnf-near", 6]
    ]);
    expect(ranked.filter(racer => racer.tied).map(racer => racer.id)).toEqual(["tie-b"]);
  });

  it("does not depend on the order racers are listed in", () => {
    const racers = [
      { id: "a", finishMs: 200_000, x: 8 },
      { id: "b", finishMs: 190_000, x: 8 },
      { id: "c", finishMs: null, x: 3 }
    ];
    const forward = rankRacers(racers).map(racer => racer.id);
    const backward = rankRacers([...racers].reverse()).map(racer => racer.id);
    expect(forward).toEqual(["b", "a", "c"]);
    expect(backward).toEqual(forward);
  });
});
