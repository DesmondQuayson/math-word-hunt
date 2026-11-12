// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  ONLINE_SPEC,
  PREVIEW_FLAG,
  catalogPayload,
  evaluate,
  hashToken,
  isLocalOwnerPreview,
  isRoomRecord,
  isRunRecord,
  isStagingOwnerPreview,
  judgeAnswer,
  ownerHash,
  parseSettings,
  runQuestion,
  runSpec,
  seatQuestion,
  toRoomPayload,
  toRunPayload,
  type Json,
  type RoomRecord,
  type RunRecord
} from "@/lib/games/math-race-champions/server";
import { hashToken as polygonHashToken } from "@/lib/games/polygon-showdown/server";
import { buildCircuit, stageCircuitSeed } from "@/public/internal-games/math-race-champions/src/engine/circuit.js";
import { CORRECT_LOCK_MS, MIN_CORRECT, ONLINE_CAR, STAGES, WRONG_LOCK_MS, newRacerState, type RacerState } from "@/public/internal-games/math-race-champions/src/engine/race.js";

const SEED = "0123456789abcdef0123456789abcdef";
const CPU_SEED = "fedcba9876543210fedcba9876543210";

function run(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    result: "ok",
    id: "11111111-2222-4333-8444-555555555555",
    stage: 1,
    car: "starter",
    settings: { categories: ["missing-addend", "powers"], difficulty: "easy" },
    seed: SEED,
    cpuSeed: CPU_SEED,
    state: newRacerState(),
    version: 1,
    status: "active",
    startsAtMs: 1_000_000,
    nowMs: 996_000,
    ...overrides
  } as RunRecord;
}

function room(overrides: Json = {}): RoomRecord {
  return {
    result: "ok",
    id: "aaaaaaaa-2222-4333-8444-555555555555",
    code: "371524",
    phase: "ACTIVE",
    settings: { categories: ["missing-addend", "powers"], difficulty: "easy" },
    locked: true,
    version: 9,
    seed: SEED,
    nowMs: 1_010_000,
    startsAtMs: 1_000_000,
    endsAtMs: null,
    finalized: false,
    standings: [{ id: "bbbbbbbb-2222-4333-8444-555555555555", name: "Ava", emoji: null, colour: "pink", creator: false, correct: 3, wrong: 0, d: 400, f: null, rank: 1, t: 9000, x: 0.4, v: 80, connected: true, token_hash: "secret", user_id: "someone" }],
    me: { id: "bbbbbbbb-2222-4333-8444-555555555555", name: "Ava", emoji: null, colour: "pink", isCreator: false, signedIn: false, version: 4, state: { ...newRacerState(), t: 9000, x: 0.4, v: 80, correct: 3, answered: 3, streak: 3, bestStreak: 3, maxSpeed: 90 } },
    ...overrides
  } as RoomRecord;
}

describe("what a browser is told", () => {
  it("a race payload carries the question and its two choices, never the seed or the answer", () => {
    const payload = toRunPayload(run());
    const text = JSON.stringify(payload);
    expect(text).not.toContain(SEED);
    expect(text).not.toContain(CPU_SEED);
    expect(text).not.toMatch(/seed|correctIndex|"answer"|operands/i);
    const question = payload.question as { choices: string[]; text: string; index: number };
    expect(question.choices).toHaveLength(2);
    expect(question.index).toBe(0);
    expect(payload.lengthKm).toBe(STAGES[0]!.lengthKm);
  });

  it("a room payload carries only this racer's question, and no hashes, seed or account ids", () => {
    const payload = toRoomPayload(room());
    const text = JSON.stringify(payload);
    expect(text).not.toContain(SEED);
    expect(text).not.toMatch(/seed|correctIndex|"answer"|token|hash|user_id|secret|someone/i);
    expect((payload.question as { choices: string[] }).choices).toHaveLength(2);
    expect(payload.car).toEqual({ name: ONLINE_CAR.name, topSpeed: ONLINE_CAR.topSpeed, boost: ONLINE_CAR.boost, decay: ONLINE_CAR.decay });
    expect(payload.minCorrect).toBe(MIN_CORRECT);
  });

  it("there is no question in the lobby, or once the racer has finished", () => {
    expect(toRoomPayload(room({ phase: "LOBBY", startsAtMs: null })).question).toBeNull();
    const finished = room();
    finished.me.state = { ...finished.me.state, correct: 40, answered: 40, x: 8, finishMs: 200_000 };
    expect(toRoomPayload(finished).question).toBeNull();
  });

  it("the catalogue it is shown is the game's own: four cars, ten stages, ten achievements", () => {
    const catalog = catalogPayload() as { cars: { price: number }[]; stages: { reward: number }[]; achievements: { reward: number }[]; minCorrect: number };
    expect(catalog.cars.map((car) => car.price)).toEqual([0, 2000, 4000, 6000]);
    expect(catalog.stages.map((stage) => stage.reward)).toEqual([500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400]);
    expect(catalog.achievements).toHaveLength(10);
    expect(catalog.minCorrect).toBe(30);
  });
});

describe("every racer's questions", () => {
  it("are the same kind at the same point for everyone in a room, with different numbers", () => {
    const ava = room();
    const ben = room({ me: { ...ava.me, id: "cccccccc-2222-4333-8444-555555555555" } });
    let same = 0;
    for (let index = 0; index < 60; index += 1) {
      const a = seatQuestion(ava, index);
      const b = seatQuestion(ben, index);
      expect(a.category).toBe(b.category);
      if (a.key === b.key) same += 1;
    }
    expect(same).toBeLessThan(12);
  });

  it("are reproduced exactly from the seed, question by question", () => {
    for (let index = 0; index < 40; index += 1) expect(runQuestion(run(), index)).toEqual(runQuestion(run(), index));
    expect(runQuestion(run(), 0).key).not.toBe(runQuestion(run({ seed: CPU_SEED }), 0).key === runQuestion(run(), 0).key ? "x" : "y");
  });
});

describe("judging a press", () => {
  const record = run();
  const spec = runSpec(record);
  const ask = (index: number) => runQuestion(record, index);

  it("accepts the correct side and refuses the other", () => {
    const right = ask(0).correctIndex;
    const good = judgeAnswer(record.state, spec, 1000, 0, right, ask);
    expect(good).toMatchObject({ kind: "answered", correct: true });
    const bad = judgeAnswer(record.state, spec, 1000, 0, right === 0 ? 1 : 0, ask);
    expect(bad).toMatchObject({ kind: "answered", correct: false });
    if (bad.kind === "answered") expect(bad.answer).toBe(ask(0).answer);
  });

  it("refuses anything before the start", () => {
    expect(judgeAnswer(record.state, spec, -1, 0, ask(0).correctIndex, ask).kind).toBe("not-started");
  });

  it("refuses a question number that is not the racer's current one, and a third choice", () => {
    for (const index of [1, 5, -1, 0.5, "0", null, undefined]) expect(judgeAnswer(record.state, spec, 1000, index, 0, ask).kind).toBe("stale");
    for (const choice of [2, -1, "0", null, undefined, 0.5]) expect(judgeAnswer(record.state, spec, 1000, 0, choice, ask).kind).toBe("stale");
  });

  it("refuses a second press while the buttons rest", () => {
    const first = judgeAnswer(record.state, spec, 1000, 0, ask(0).correctIndex, ask);
    if (first.kind !== "answered") throw new Error("expected an answer");
    expect(judgeAnswer(first.state, spec, 1000 + CORRECT_LOCK_MS - 1, 1, ask(1).correctIndex, ask).kind).toBe("locked");
    expect(judgeAnswer(first.state, spec, 1000 + CORRECT_LOCK_MS, 1, ask(1).correctIndex, ask).kind).toBe("answered");
    const wrong = judgeAnswer(first.state, spec, 2000, 1, ask(1).correctIndex === 0 ? 1 : 0, ask);
    if (wrong.kind !== "answered") throw new Error("expected an answer");
    expect(judgeAnswer(wrong.state, spec, 2000 + WRONG_LOCK_MS - 1, 2, ask(2).correctIndex, ask).kind).toBe("locked");
  });

  it("cannot be talked into a finish: 29 perfect answers leave the car short of the line for ever", () => {
    let state: RacerState = record.state;
    for (let index = 0; index < MIN_CORRECT - 1; index += 1) {
      const judged = judgeAnswer(state, spec, (index + 1) * 400, index, ask(index).correctIndex, ask);
      if (judged.kind !== "answered") throw new Error(`refused at ${index}: ${judged.kind}`);
      state = judged.state;
    }
    const outcome = evaluate(record, { ...state });
    expect(outcome.finished).toBe(false);
    expect(outcome.won).toBe(false);
    const later = judgeAnswer(state, spec, 60 * 60 * 1000, 99, 0, ask);
    expect(later.kind).toBe("stale");
    expect(later.state.finishMs).toBeNull();
  });

  it("the online car is one fixed car", () => {
    expect(ONLINE_SPEC).toEqual({ topSpeed: 180, boost: 30, decay: 0.09, lengthKm: 8 });
    expect(Object.isFrozen(ONLINE_SPEC)).toBe(true);
  });
});

describe("records from the database are checked before use", () => {
  it("accepts a well-formed race and room", () => {
    expect(isRunRecord(run())).toBe(true);
    expect(isRoomRecord(room())).toBe(true);
  });

  it("refuses a race with an unknown car, stage or category, or a doctored state", () => {
    expect(isRunRecord(run({ car: "moon-rocket" }))).toBe(false);
    expect(isRunRecord(run({ stage: 11 }))).toBe(false);
    expect(isRunRecord(run({ settings: { categories: ["decimal-to-fraction"], difficulty: "easy" } as never }))).toBe(false);
    expect(isRunRecord(run({ state: { ...newRacerState(), correct: 9 } }))).toBe(false);
    expect(isRunRecord(null)).toBe(false);
    expect(isRunRecord({ result: "stage-locked" })).toBe(false);
  });
});

describe("settings from a browser", () => {
  it("are the seven categories and five difficulties, or nothing", () => {
    expect(parseSettings("mixed", "hard")?.categories).toHaveLength(7);
    expect(parseSettings(["powers", "powers"], "easy")).toEqual({ categories: ["powers"], difficulty: "easy" });
    for (const [categories, difficulty] of [[["decimal-to-fraction"], "easy"], [[], "easy"], [["powers"], "impossible"], [["powers"], null], ["all", "easy"], [[1], "easy"], [null, "easy"]] as const) {
      expect(parseSettings(categories, difficulty)).toBeNull();
    }
  });
});

describe("tokens and the owner preview", () => {
  it("a racer token is not a host token, and not another game's token", () => {
    expect(hashToken("player", "abc")).not.toBe(hashToken("host", "abc"));
    expect(hashToken("player", "abc")).not.toBe(polygonHashToken("player", "abc"));
    expect(hashToken("player", "abc")).toMatch(/^[0-9a-f]{64}$/);
    expect(ownerHash("secret", { kind: "consumer", id: "1" })).not.toBe(ownerHash("secret", { kind: "school-access", id: "1" }));
  });

  it("the draft is served locally only with the flag, on loopback, and never on Vercel", () => {
    const local = { [PREVIEW_FLAG]: "local-owner-review", MVH_APPLICATION_ORIGIN: "http://127.0.0.1:3103" };
    expect(isLocalOwnerPreview(local)).toBe(true);
    expect(isLocalOwnerPreview({ ...local, [PREVIEW_FLAG]: "yes" })).toBe(false);
    expect(isLocalOwnerPreview({ MVH_APPLICATION_ORIGIN: "http://127.0.0.1:3103" })).toBe(false);
    expect(isLocalOwnerPreview({ ...local, MVH_APPLICATION_ORIGIN: "https://mathnexa.com" })).toBe(false);
    expect(isLocalOwnerPreview({ ...local, VERCEL: "1" })).toBe(false);
    expect(isLocalOwnerPreview({ ...local, VERCEL_ENV: "production" })).toBe(false);
  });

  it("production can never satisfy the staging preview", () => {
    const staging = {
      [PREVIEW_FLAG]: "staging-owner-review",
      SUPABASE_URL: "https://gcmuhzxkwvfireyrearl.supabase.co",
      NEXT_PUBLIC_SUPABASE_URL: "https://gcmuhzxkwvfireyrearl.supabase.co",
      MVH_APPLICATION_ORIGIN: "https://mathnexa-platform-staging-abc.vercel.app",
      VERCEL_ENV: "preview"
    };
    expect(isStagingOwnerPreview(staging)).toBe(true);
    expect(isStagingOwnerPreview({ ...staging, MVH_APPLICATION_ORIGIN: "https://mathnexa.com" })).toBe(false);
    expect(isStagingOwnerPreview({ ...staging, MVH_APPLICATION_ORIGIN: "https://www.mathnexa.com" })).toBe(false);
    expect(isStagingOwnerPreview({ ...staging, SUPABASE_URL: "https://production.supabase.co" })).toBe(false);
    expect(isStagingOwnerPreview({ ...staging, [PREVIEW_FLAG]: "local-owner-review" })).toBe(false);
  });
});

describe("the road", () => {
  it("is the same road every time, as long as the stage says, and the map is that road", () => {
    for (const stage of STAGES) {
      const a = buildCircuit(stage.lengthKm, stageCircuitSeed(stage.stage));
      const b = buildCircuit(stage.lengthKm, stageCircuitSeed(stage.stage));
      expect(a.length).toBeCloseTo(stage.lengthKm * 1000, 6);
      expect(a.at(1234)).toEqual(b.at(1234));
      // Walking the centre line in 5 m steps covers the stated length: no gaps, no jumps.
      let walked = 0;
      let previous = a.at(0);
      for (let distance = 5; distance <= a.length; distance += 5) {
        const point = a.at(distance);
        const step = Math.hypot(point.x - previous.x, point.z - previous.z);
        expect(step).toBeLessThan(5.01);
        walked += step;
        previous = point;
      }
      expect(walked / a.length).toBeGreaterThan(0.995);
      // START and FINISH are the two ends of the map, and progress moves a marker steadily along it.
      const start = a.mapPoint(0, 200, 200, 18);
      const finish = a.mapPoint(1, 200, 200, 18);
      expect(Math.hypot(start.x - finish.x, start.y - finish.y)).toBeGreaterThan(60);
      for (let step = 0; step <= 100; step += 1) {
        const point = a.mapPoint(step / 100, 200, 200, 18);
        expect(point.x).toBeGreaterThanOrEqual(17.9);
        expect(point.x).toBeLessThanOrEqual(182.1);
        expect(point.y).toBeGreaterThanOrEqual(17.9);
        expect(point.y).toBeLessThanOrEqual(182.1);
      }
    }
  });

  it("runs on straight before START and past FINISH", () => {
    const road = buildCircuit(4.8, stageCircuitSeed(1));
    const before = road.at(-10);
    const start = road.at(0);
    expect(Math.hypot(before.x - start.x, before.z - start.z)).toBeCloseTo(10, 6);
    const after = road.at(road.length + 25);
    const finish = road.at(road.length);
    expect(Math.hypot(after.x - finish.x, after.z - finish.z)).toBeCloseTo(25, 6);
  });
});
