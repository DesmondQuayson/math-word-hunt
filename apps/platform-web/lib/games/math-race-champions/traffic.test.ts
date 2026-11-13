import { describe, expect, it } from "vitest";

import {
  CORRECT_LOCK_MS,
  MIN_CORRECT,
  ONLINE_CAR,
  ONLINE_LENGTH_KM,
  STARTER_CAR,
  WRONG_LOCK_MS,
  applyAnswer,
  cpuTimeline,
  distanceAllowed,
  getCar,
  getStage,
  newRacerState,
  raceSpec,
  viewAt,
  type RaceSpec,
  type RacerState,
  type RacerView
} from "@/public/internal-games/math-race-champions/src/engine/race.js";
import { createRandom } from "@/public/internal-games/math-race-champions/src/engine/random.js";
import {
  CAR_LENGTH,
  CAR_WIDTH,
  CATCH_MAX,
  CENTRE_CLEAR_M,
  LANES,
  LANE_SPEED,
  SAFE_LAT,
  createTraffic,
  overlapping,
  type DrawnCar,
  type TrafficFrame
} from "@/public/internal-games/math-race-champions/src/race/traffic.js";

// The picture of a race is drawn by race/traffic.js from each racer's
// authoritative distance. These tests race scripted racers with the real race
// engine and check, frame by frame, that what is drawn is a real overtake:
// cars pass side by side, never through each other, never by teleporting, and
// the order on the road is the order of the race.

type Answer = readonly [atMs: number, correct: 0 | 1];
type Seed = Partial<Pick<RacerState, "x" | "v" | "correct">>;
type Rival = { id: string; distanceM: number; speed: number; finished: boolean; limitM: number; view: RacerView };

const ROAD_HALF = 6.5;
/** Extra speed a car out of the camera's sight (well behind the player) may use, m/s. */
const UNSEEN = 90;
const SLACK = 12;

/** A racer who answers at fixed moments: the engine does the rest. */
function racer(spec: RaceSpec, answers: readonly Answer[], seed: Seed = {}) {
  let state: RacerState = { ...newRacerState(), ...seed, answered: seed.correct ?? 0 };
  let next = 0;
  return {
    spec,
    /** The racer's checked state at `atMs` (times only ever go forward). */
    stateAt(atMs: number): RacerState {
      while (next < answers.length && answers[next]![0] <= atMs) {
        state = applyAnswer(state, spec, answers[next]![0], answers[next]![1] === 1).state;
        next += 1;
      }
      return state;
    },
    viewAt(atMs: number): RacerView {
      return viewAt(this.stateAt(atMs), spec, atMs);
    }
  };
}

/** Correct answers every `everyMs` from `fromMs` to `toMs`. */
const steady = (fromMs: number, toMs: number, everyMs: number): Answer[] => {
  const out: Answer[] = [];
  for (let at = fromMs; at < toMs; at += everyMs) out.push([Math.round(at), 1]);
  return out;
};

/** A person: thinks about `intervalMs` per answer, right `accuracy` of the time. */
function person(seed: string, intervalMs: number, accuracy: number, untilMs = 600_000): Answer[] {
  const random = createRandom(seed);
  const out: Answer[] = [];
  let at = 600 + random.next() * 2400;
  while (at < untilMs) {
    const correct = random.next() < accuracy;
    out.push([Math.round(at), correct ? 1 : 0]);
    at += Math.max(correct ? CORRECT_LOCK_MS : WRONG_LOCK_MS, intervalMs * (0.5 + random.next()));
  }
  return out;
}

const limitOf = (view: RacerView, lengthKm: number) => (view.finished || view.correct >= MIN_CORRECT ? Infinity : distanceAllowed(view.correct, lengthKm) * 1000);

type Watch = {
  frames: number;
  overlaps: number;
  offRoad: number;
  backwards: number;
  worstJump: number;
  worstSideways: number;
  /** Frames in which a drawn rival was on the wrong side of the player (more than 1.5 m of true gap). */
  wrongSide: number;
  longestWrongSideMs: number;
  /** The same, counting only from fifteen seconds into the race (the start-line scramble is over). */
  longestWrongSideRacingMs: number;
  /** Largest gap between a moving rival's drawn and true place, after the first 100 m. */
  worstLag: number;
  /** Lead changes against the player: by the race, and as drawn. */
  truePasses: number;
  drawnPasses: number;
  /** The lane offset of each rival at the moment it was drawn level with the player. */
  passLanes: number[];
  mostDrawn: number;
  heldFrames: number;
  frame: TrafficFrame<Rival> | null;
};

/**
 * Race `player` against `rivals` for `seconds`, stepping the picture `fps` times a second.
 * `poll` (ms) makes rivals arrive the way an Online Race delivers them: a standings row every so
 * often, carried forward by the engine in between, so a new row can move a car in a step.
 */
function watch(options: {
  lengthKm: number;
  player: ReturnType<typeof racer>;
  rivals: { id: string; racer: ReturnType<typeof racer> }[];
  seconds: number;
  fps?: number;
  limit?: number;
  fromMs?: number;
  poll?: number;
  untilPlayerFinishes?: boolean;
}): Watch {
  const { lengthKm, player, rivals, seconds, fps = 60, limit = 9, fromMs = -1000, poll = 0, untilPlayerFinishes = true } = options;
  const traffic = createTraffic();
  const dt = 1 / fps;
  const result: Watch = { frames: 0, overlaps: 0, offRoad: 0, backwards: 0, worstJump: 0, worstSideways: 0, wrongSide: 0, longestWrongSideMs: 0, longestWrongSideRacingMs: 0, worstLag: 0, truePasses: 0, drawnPasses: 0, passLanes: [], mostDrawn: 0, heldFrames: 0, frame: null };
  const last = new Map<string, DrawnCar<Rival>>();
  const trueSide = new Map<string, number>();
  const drawnSide = new Map<string, number>();
  const rows = new Map<string, { state: RacerState; at: number }>();
  let wrongRun = 0;
  for (let at = fromMs; at < seconds * 1000; at += dt * 1000) {
    const clock = Math.max(0, at);
    const mine = player.viewAt(clock);
    if (mine.finished && untilPlayerFinishes) break;
    const me = { distanceM: mine.distanceKm * 1000, speed: mine.speed };
    const field: Rival[] = rivals.map((rival, index) => {
      let view: RacerView;
      if (poll > 0) {
        // A new row for this racer every `poll` ms, each racer on its own beat.
        const row = rows.get(rival.id);
        if (!row || clock - row.at >= poll + ((index * 137) % 400)) rows.set(rival.id, { state: rival.racer.stateAt(clock), at: clock });
        view = viewAt(rows.get(rival.id)!.state, rival.racer.spec, clock);
      } else view = rival.racer.viewAt(clock);
      return { id: rival.id, distanceM: view.distanceKm * 1000, speed: view.speed, finished: view.finished, limitM: limitOf(view, lengthKm), view };
    });
    const frame = traffic.step(dt, me, field, limit);
    result.frame = frame;
    result.frames += 1;
    result.mostDrawn = Math.max(result.mostDrawn, frame.cars.length);

    const everyone = [{ distanceM: me.distanceM, lane: 0 }, ...frame.cars];
    for (let a = 0; a < everyone.length; a += 1) for (let b = a + 1; b < everyone.length; b += 1) if (overlapping(everyone[a]!, everyone[b]!)) result.overlaps += 1;

    let wrong = false;
    const seen = new Set<string>();
    for (const car of frame.cars) {
      seen.add(car.id);
      if (Math.abs(car.lane) + CAR_WIDTH / 2 > ROAD_HALF) result.offRoad += 1;
      if (car.held) result.heldFrames += 1;
      const before = last.get(car.id);
      if (before) {
        const moved = car.distanceM - before.distanceM;
        if (moved < -1e-6) result.backwards += 1;
        const unseen = before.gapM < -11;
        result.worstJump = Math.max(result.worstJump, moved / dt - car.rival.speed / 3.6 - (unseen ? UNSEEN : CATCH_MAX) - SLACK);
        result.worstSideways = Math.max(result.worstSideways, Math.abs(car.lane - before.lane) / dt);
      }
      last.set(car.id, car);
      if (!car.rival.finished) {
        if (me.distanceM > 100 && car.rival.speed > 1) result.worstLag = Math.max(result.worstLag, Math.abs(car.gapM - car.trueGapM));
        if (Math.abs(car.trueGapM) > 1.5 && Math.sign(car.gapM) !== Math.sign(car.trueGapM)) wrong = true;
        // Lead changes, counted once a car is a clear metre past.
        for (const [sides, gap, key] of [[trueSide, car.trueGapM, "truePasses"], [drawnSide, car.gapM, "drawnPasses"]] as const) {
          if (Math.abs(gap) < 1) continue;
          const side = Math.sign(gap);
          if (sides.has(car.id) && sides.get(car.id) !== side) {
            result[key] += 1;
            if (key === "drawnPasses") result.passLanes.push(Math.abs(car.lane));
          }
          sides.set(car.id, side);
        }
      }
    }
    for (const id of [...last.keys()]) {
      if (seen.has(id)) continue;
      last.delete(id);
      trueSide.delete(id);
      drawnSide.delete(id);
    }
    wrongRun = wrong ? wrongRun + 1 : 0;
    if (wrong) result.wrongSide += 1;
    result.longestWrongSideMs = Math.max(result.longestWrongSideMs, wrongRun * dt * 1000);
    if (at > 15_000) result.longestWrongSideRacingMs = Math.max(result.longestWrongSideRacingMs, Math.min(wrongRun * dt * 1000, at - 15_000));
  }
  return result;
}

/** Everything that must hold in every race, whatever happens in it. */
function expectPhysical(result: Watch) {
  expect(result.overlaps, "cars drawn inside one another").toBe(0);
  expect(result.offRoad, "cars drawn off the road").toBe(0);
  expect(result.backwards, "cars drawn going backwards").toBe(0);
  expect(result.worstJump, "a car moved further in a frame than a car can drive").toBeLessThanOrEqual(0.5);
  expect(result.worstSideways, "a car moved sideways faster than a lane change").toBeLessThanOrEqual(LANE_SPEED + 0.01);
}

const STAGE = getStage(1)!;
const LENGTH = STAGE.lengthKm;
const SPEC = raceSpec(STARTER_CAR, LENGTH);
/** Mid-race, clear of the next limit: 1,000 m in, ten correct answers behind them. */
const MID: Seed = { x: 1.0, v: 70, correct: 10 };

describe("Math Race Champions overtaking: two cars", () => {
  it("lanes fit the road and leave a car's width between neighbours", () => {
    expect(LANES).toEqual([-5.2, -2.6, 0, 2.6, 5.2]);
    for (let index = 1; index < LANES.length; index += 1) expect(LANES[index]! - LANES[index - 1]!).toBeGreaterThanOrEqual(SAFE_LAT);
    expect(Math.max(...LANES) + CAR_WIDTH / 2).toBeLessThan(ROAD_HALF);
  });

  // Scenario A: the player starts 60 m back and answers faster.
  it("A: the player catches the computer, draws alongside and passes", () => {
    for (const fps of [60, 30, 12]) {
      const result = watch({
        lengthKm: LENGTH,
        player: racer(SPEC, steady(300, 30_000, 900), MID),
        rivals: [{ id: "cpu", racer: racer(SPEC, steady(800, 30_000, 3200), { ...MID, x: 1.06 }) }],
        seconds: 26,
        fps,
        fromMs: 0
      });
      expectPhysical(result);
      expect(result.truePasses).toBe(1);
      expect(result.drawnPasses).toBe(1);
      expect(result.wrongSide).toBe(0);
      expect(result.worstLag).toBeLessThan(0.75);
      // Level with the player it is a lane to one side: a pass beside, not through.
      expect(Math.min(...result.passLanes)).toBeGreaterThanOrEqual(SAFE_LAT);
      expect(result.frame!.cars[0]!.trueGapM).toBeLessThan(-5);
    }
  });

  // Scenario B: the computer starts 60 m back and answers faster.
  it("B: the computer catches the player, draws alongside and passes", () => {
    for (const fps of [60, 30, 12]) {
      let pulled = 0;
      let sideWhenClose = 0;
      const player = racer(SPEC, steady(800, 30_000, 3200), { ...MID, x: 1.06 });
      const cpu = racer(SPEC, steady(300, 30_000, 900), MID);
      const traffic = createTraffic();
      const dt = 1 / fps;
      let passedAt = -1;
      for (let at = 0; at < 26_000; at += dt * 1000) {
        const mine = player.viewAt(at);
        const view = cpu.viewAt(at);
        const frame = traffic.step(dt, { distanceM: mine.distanceKm * 1000, speed: mine.speed }, [{ id: "cpu", distanceM: view.distanceKm * 1000, speed: view.speed, finished: false, limitM: limitOf(view, LENGTH) }], 9);
        const car = frame.cars[0]!;
        if (car.gapM < -3 && car.gapM > -20) {
          // Coming up behind: the camera is asked to open, towards the side the car is on, and the mirror names it.
          pulled = Math.max(pulled, frame.camera.pull);
          sideWhenClose = frame.camera.side;
          expect(frame.behind?.id).toBe("cpu");
          expect(frame.behind?.side).toBe(Math.sign(car.lane));
        }
        if (passedAt < 0 && car.gapM > 1) passedAt = at;
        expect(overlapping({ distanceM: mine.distanceKm * 1000, lane: 0 }, car)).toBe(false);
      }
      expect(passedAt).toBeGreaterThan(0);
      expect(pulled).toBeGreaterThan(0.9);
      expect(Math.abs(sideWhenClose)).toBe(1);
      const result = watch({
        lengthKm: LENGTH,
        player: racer(SPEC, steady(800, 30_000, 3200), { ...MID, x: 1.06 }),
        rivals: [{ id: "cpu", racer: racer(SPEC, steady(300, 30_000, 900), MID) }],
        seconds: 26,
        fps,
        fromMs: 0
      });
      expectPhysical(result);
      expect(result.truePasses).toBe(1);
      expect(result.drawnPasses).toBe(1);
      expect(result.wrongSide).toBe(0);
      expect(Math.min(...result.passLanes)).toBeGreaterThanOrEqual(SAFE_LAT);
      expect(result.frame!.camera.pull).toBe(0);
    }
  });

  // Scenario C: the player passes, then gets two answers wrong and goes quiet; the computer passes back.
  it("C: pass and re-pass", () => {
    const playerAnswers: Answer[] = [...steady(300, 7000, 800), [8000, 0], [10_500, 0], ...steady(24_000, 40_000, 2500)];
    const result = watch({
      lengthKm: LENGTH,
      player: racer(SPEC, playerAnswers, MID),
      rivals: [{ id: "cpu", racer: racer(SPEC, steady(600, 40_000, 1700), { ...MID, x: 1.04 }) }],
      seconds: 36,
      fromMs: 0
    });
    expectPhysical(result);
    expect(result.truePasses).toBe(2);
    expect(result.drawnPasses).toBe(2);
    expect(result.wrongSide).toBe(0);
    expect(Math.min(...result.passLanes)).toBeGreaterThanOrEqual(SAFE_LAT);
  });

  // Scenario D: the lead changes hands again and again.
  it("D: several lead changes, every one drawn", () => {
    const bursts: Answer[] = [...steady(300, 5000, 800), ...steady(16_000, 21_000, 800), ...steady(32_000, 37_000, 800)];
    for (const fps of [60, 20]) {
      const result = watch({
        lengthKm: LENGTH,
        player: racer(SPEC, bursts, { ...MID, correct: 12 }),
        rivals: [{ id: "cpu", racer: racer(SPEC, steady(500, 70_000, 2600), { ...MID, correct: 12, x: 1.03 }) }],
        seconds: 30,
        fps,
        fromMs: 0
      });
      expectPhysical(result);
      expect(result.truePasses).toBe(4);
      expect(result.drawnPasses).toBe(result.truePasses);
      expect(result.wrongSide).toBe(0);
      expect(result.worstLag).toBeLessThan(0.75);
      expect(Math.min(...result.passLanes)).toBeGreaterThanOrEqual(SAFE_LAT);
    }
  });

  // Scenario E: both need two more correct answers with 250 m to go, and cross within a blink of each other.
  it("E: a near-simultaneous finish is drawn in the order it happened", () => {
    const late: Seed = { x: LENGTH - 0.25, v: 120, correct: 29 };
    // The computer starts 7 m ahead of the player, or 7 m behind: about a fifth of a second at the line.
    for (const rivalAhead of [0.007, -0.007]) {
      // Each has 29 correct answers: one more lets it cross (the 30-answer rule).
      const player = racer(SPEC, [[500, 1]], late);
      const cpu = racer(SPEC, [[500, 1]], { ...late, x: late.x! + rivalAhead });
      let both = -1;
      const traffic = createTraffic();
      const dt = 1 / 60;
      let checked = false;
      for (let at = 0; at < 20_000; at += dt * 1000) {
        const mine = player.viewAt(at);
        const view = cpu.viewAt(at);
        const me = { distanceM: mine.distanceKm * 1000, speed: mine.speed, finished: mine.finished };
        const frame = traffic.step(dt, me, [{ id: "cpu", distanceM: view.distanceKm * 1000, speed: view.speed, finished: view.finished, limitM: limitOf(view, LENGTH) }], 9);
        const car = frame.cars[0]!;
        expect(overlapping({ distanceM: me.distanceM, lane: 0 }, car)).toBe(false);
        if (mine.finished && view.finished && both < 0) both = at;
        if (both >= 0 && at - both > 500 && !checked) {
          checked = true;
          const cpuFirst = view.finishMs! < mine.finishMs!;
          const apart = Math.abs(view.finishMs! - mine.finishMs!);
          expect(apart).toBeGreaterThan(100);
          expect(apart).toBeLessThan(400);
          expect(cpuFirst).toBe(rivalAhead > 0);
          // Whoever crossed first is in front on the road once both are home; the other is never drawn past it.
          if (cpuFirst) expect(car.gapM).toBeGreaterThan(CAR_LENGTH);
          else expect(car.gapM).toBeLessThanOrEqual(0);
        }
        // Before either is home, the car that is ahead in the race is ahead on the road.
        if (!mine.finished && !view.finished && at > 1000) expect(Math.sign(car.gapM)).toBe(Math.sign(rivalAhead));
        // A car that has finished rolls on past the line; it does not stop dead on it.
        // A car that finished first rolls on past the line; it does not stop dead on it. A car that finished
        // second stops on the line beside the winner.
        if (view.finished && at - view.finishMs! > 1500 && at - view.finishMs! < 2500) {
          if (rivalAhead > 0) expect(car.distanceM).toBeGreaterThan(LENGTH * 1000 + 20);
          else expect(car.distanceM).toBeCloseTo(LENGTH * 1000, 1);
        }
      }
      expect(checked).toBe(true);
    }
  });

  it("a real Computer Race: every stage's computer against a steady player, grid to flag", () => {
    for (const stage of [1, 4, 7, 10]) {
      const info = getStage(stage)!;
      const timeline = cpuTimeline(stage, `overtake:${stage}`);
      const spec = raceSpec(STARTER_CAR, info.lengthKm);
      const result = watch({
        lengthKm: info.lengthKm,
        player: racer(raceSpec(getCar("velocity-gt")!, info.lengthKm), person(`player:${stage}`, info.interval * 1000, 0.85)),
        rivals: [{ id: "cpu", racer: racer(spec, timeline.events as readonly Answer[]) }],
        seconds: 600,
        fps: 30
      });
      expectPhysical(result);
      expect(result.drawnPasses).toBe(result.truePasses);
      expect(result.wrongSide).toBe(0);
      expect(result.worstLag).toBeLessThan(0.75);
      expect(result.heldFrames).toBe(0);
    }
  });

  it("the picture adds nothing to the race: a rival is drawn where its answers put it", () => {
    // The computer gets everything wrong after its first answer; the picture may not carry it forward.
    const wrong: Answer[] = [[500, 1], ...Array.from({ length: 12 }, (_, index) => [3000 + index * 2100, 0] as Answer)];
    const result = watch({
      lengthKm: LENGTH,
      player: racer(SPEC, steady(400, 30_000, 1500), MID),
      rivals: [{ id: "cpu", racer: racer(SPEC, wrong, { ...MID, x: 1.05 }) }],
      seconds: 28,
      fromMs: 0
    });
    expectPhysical(result);
    expect(result.truePasses).toBe(1);
    expect(result.drawnPasses).toBe(1);
    expect(result.worstLag).toBeLessThan(0.75);
    // A faster car is no pass by itself either: same answers, the dearest car, drawn exactly where the engine has it.
    const premium = watch({
      lengthKm: LENGTH,
      player: racer(raceSpec(getCar("thunder-x")!, LENGTH), [], { ...MID, v: 30 }),
      rivals: [{ id: "cpu", racer: racer(SPEC, [], { ...MID, v: 30, x: 1.02 }) }],
      seconds: 20,
      fromMs: 0
    });
    expect(premium.truePasses).toBe(0);
    expect(premium.drawnPasses).toBe(0);
  });
});

describe("Math Race Champions overtaking: the starting grid and standing cars", () => {
  const grid = (count: number) => {
    const traffic = createTraffic();
    const rivals = Array.from({ length: count }, (_, index) => ({ id: `r${index}`, distanceM: 0, speed: 0, finished: false, limitM: 0 }));
    return traffic.step(1 / 60, { distanceM: 0, speed: 0 }, rivals, 9);
  };

  it("one or two rivals stand beside the player; more stand in two files along the kerbs", () => {
    expect(grid(1).cars.map(car => [car.distanceM, car.lane])).toEqual([[0, 2.6]]);
    expect(grid(2).cars.map(car => [car.distanceM, car.lane]).sort()).toEqual([[0, -2.6], [0, 2.6]]);
    const many = grid(9);
    expect(many.cars).toHaveLength(9);
    expect(new Set(many.cars.map(car => Math.abs(car.lane)))).toEqual(new Set([5.2]));
    // Nobody stands in front of the player's car, and nobody in anybody else.
    for (const car of many.cars) expect(car.distanceM).toBeLessThanOrEqual(0);
    const all = [{ distanceM: 0, lane: 0 }, ...many.cars];
    for (let a = 0; a < all.length; a += 1) for (let b = a + 1; b < all.length; b += 1) expect(overlapping(all[a]!, all[b]!)).toBe(false);
  });

  it("a car at the back of the grid that answers first drives off round the cars still standing", () => {
    const spec = raceSpec(ONLINE_CAR, ONLINE_LENGTH_KM);
    // r8 (last on the grid) answers at once and keeps answering; everyone else waits ten seconds.
    const rivals = Array.from({ length: 9 }, (_, index) => ({ id: `r${index}`, racer: racer(spec, index === 8 ? steady(300, 20_000, 900) : steady(10_000, 20_000, 2000)) }));
    const result = watch({ lengthKm: ONLINE_LENGTH_KM, player: racer(spec, steady(10_500, 20_000, 2000)), rivals, seconds: 9, fromMs: 0, untilPlayerFinishes: false });
    expectPhysical(result);
    const away = result.frame!.cars.find(car => car.id === "r8")!;
    expect(away.trueGapM).toBeGreaterThan(100);
    expect(Math.abs(away.gapM - away.trueGapM)).toBeLessThan(1);
    // It stood four rows behind the player's car and was truly ahead a moment later: it is seen pulling out
    // and driving past, and is drawn ahead within three seconds.
    expect(result.longestWrongSideMs).toBeLessThan(3000);
  });

  it("a racer standing at its limit pulls over to the kerb lane, and the cars behind drive past it", () => {
    const spec = raceSpec(ONLINE_CAR, ONLINE_LENGTH_KM);
    // One correct answer, then nothing: this racer rolls to its limit (267 m) and stands there.
    const stopper = racer(spec, [[500, 1]]);
    const others = Array.from({ length: 4 }, (_, index) => ({ id: `go${index}`, racer: racer(spec, steady(2500 + index * 400, 60_000, 1500 + index * 150)) }));
    const result = watch({ lengthKm: ONLINE_LENGTH_KM, player: racer(spec, steady(6000, 60_000, 1600)), rivals: [{ id: "stopper", racer: stopper }, ...others], seconds: 45, fromMs: 0 });
    expectPhysical(result);
    expect(result.longestWrongSideMs).toBeLessThan(3000);
    const limit = distanceAllowed(1, ONLINE_LENGTH_KM) * 1000;
    expect(stopper.viewAt(45_000).distanceKm * 1000).toBeCloseTo(limit, 3);
    const traffic = createTraffic();
    let parked: DrawnCar | undefined;
    for (let at = 0; at < 40_000; at += 1000 / 60) {
      const view = stopper.viewAt(at);
      parked = traffic.step(1 / 60, { distanceM: 0, speed: 0 }, [{ id: "stopper", distanceM: view.distanceKm * 1000, speed: view.speed, finished: false, limitM: limitOf(view, ONLINE_LENGTH_KM) }], 9).cars[0];
    }
    expect(Math.abs(parked!.lane)).toBeCloseTo(5.2, 3);
    expect(parked!.distanceM).toBeCloseTo(limit, 1);
  });
});

describe("Math Race Champions overtaking: Online Race", () => {
  const spec = raceSpec(ONLINE_CAR, ONLINE_LENGTH_KM);
  const field = (count: number, seed: string) =>
    Array.from({ length: count }, (_, index) => ({ id: `racer-${index}`, racer: racer(spec, person(`${seed}:${index}`, 1700 + (index % 6) * 350, 0.72 + (index % 5) * 0.05)) }));

  it("a standings row that arrives late moves a car by driving, never by a jump", () => {
    const traffic = createTraffic();
    const dt = 1 / 60;
    let previous = 0;
    let settled = Infinity;
    for (let frame = 0; frame < 600; frame += 1) {
      // The rival's row is 35 m further on than the picture believed, two seconds in.
      const truth = 500 + frame * dt * 30 + (frame >= 120 ? 35 : 0);
      const car = traffic.step(dt, { distanceM: 440 + frame * dt * 30, speed: 108 }, [{ id: "late", distanceM: truth, speed: 108, finished: false }], 9).cars[0]!;
      if (frame > 0) {
        const speed = (car.distanceM - previous) / dt;
        expect(speed).toBeGreaterThanOrEqual(0);
        expect(speed).toBeLessThanOrEqual(30 + CATCH_MAX + SLACK + 0.01);
      }
      previous = car.distanceM;
      if (frame >= 120 && settled === Infinity && Math.abs(car.distanceM - truth) < 0.5) settled = (frame - 120) * dt;
    }
    // 35 m at up to 34 m/s over its own speed: seen driving there in about a second and a half.
    expect(settled).toBeGreaterThan(0.8);
    expect(settled).toBeLessThan(2);
  });

  it("after the picture has stood still for seconds, the cars are where the race has them", () => {
    const traffic = createTraffic();
    const rivals = (offset: number) => [
      { id: "a", distanceM: 500 + offset, speed: 100, finished: false },
      { id: "b", distanceM: 480 + offset * 1.5, speed: 150, finished: false }
    ];
    for (let frame = 0; frame < 60; frame += 1) traffic.step(1 / 60, { distanceM: 490 + frame * 0.5, speed: 108 }, rivals(frame * 0.46), 9);
    // Five seconds with no frame at all (a hidden tab): no car is left where it was to drive the difference.
    const after = traffic.step(5, { distanceM: 670, speed: 108 }, rivals(150), 9);
    expect(after.cars.map(car => [car.id, Math.round(car.gapM), Math.round(car.trueGapM)]).sort()).toEqual([["a", -20, -20], ["b", 35, 35]]);
    for (const car of after.cars) expect(overlapping({ distanceM: 670, lane: 0 }, car)).toBe(false);
  });

  it("2, 5 and 10 racers on once-a-second standings: real passes, nothing through anything", () => {
    for (const racers of [2, 5, 10]) {
      for (const fps of [60, 15]) {
        const result = watch({ lengthKm: ONLINE_LENGTH_KM, player: racer(spec, person("me", 2100, 0.86)), rivals: field(racers - 1, `room${racers}`), seconds: 240, fps, poll: 1000 });
        expectPhysical(result);
        expect(result.mostDrawn).toBe(Math.min(9, racers - 1));
        if (racers > 2) expect(result.drawnPasses).toBeGreaterThan(0);
        // The player is on the right side of every car on the road. With a few racers that holds to within the
        // moment a late row lands. With ten, cars at the back of the grid take a few seconds to thread through
        // the cars still standing (they may not drive through them); once racing it is a couple of seconds at most.
        expect(result.longestWrongSideMs).toBeLessThan(racers <= 5 ? 1000 : 6000);
        expect(result.longestWrongSideRacingMs).toBeLessThan(racers <= 5 ? 1000 : 3500);
        expect(Math.min(...result.passLanes)).toBeGreaterThanOrEqual(SAFE_LAT);
      }
    }
  });

  it("20, 30, 40 and 50 in the room: only the nearest are drawn, and the same rules hold", () => {
    for (const racers of [20, 30, 40, 50]) {
      for (const limit of [3, 6, 9]) {
        const result = watch({ lengthKm: ONLINE_LENGTH_KM, player: racer(spec, person("me", 2100, 0.86)), rivals: field(racers - 1, `big${racers}`), seconds: 150, fps: 30, limit, poll: 1000 });
        expectPhysical(result);
        expect(result.mostDrawn).toBe(limit);
        // A full room leaves the line in a scramble: a car from the back rows may be several seconds getting
        // past slower cars it may not drive through. Once racing, with dozens of racers bunched together, a car
        // can still be boxed in for a few seconds; it is never drawn through anything to get out.
        expect(result.longestWrongSideMs).toBeLessThan(9000);
        expect(result.longestWrongSideRacingMs).toBeLessThan(6000);
      }
    }
  });

  it("rivals stay out of the player's lane wherever the player's car could meet them", () => {
    const rivals = field(19, "centre");
    const player = racer(spec, person("me", 2000, 0.9));
    const traffic = createTraffic();
    const dt = 1 / 60;
    for (let at = 0; at < 120_000; at += dt * 1000) {
      const mine = player.viewAt(at);
      const frame = traffic.step(
        dt,
        { distanceM: mine.distanceKm * 1000, speed: mine.speed },
        rivals.map(rival => {
          const view = rival.racer.viewAt(at);
          return { id: rival.id, distanceM: view.distanceKm * 1000, speed: view.speed, finished: view.finished, limitM: limitOf(view, ONLINE_LENGTH_KM) };
        }),
        9
      );
      // In the player's lane (within a car's width of the centre line): only behind the player's car, or far ahead.
      for (const car of frame.cars) if (Math.abs(car.lane) < CAR_WIDTH && car.gapM > -CAR_LENGTH) expect(car.gapM).toBeGreaterThan(CENTRE_CLEAR_M - 25);
    }
  });
});
