// A "driver" feeds the race screen: whose race this is, what the clock says,
// what the racer's checked state is, who else is on the road, and where an
// answer goes. There are three:
//
//   computerDriver  a Computer Race run kept and judged by the server
//   practiceDriver  a race that lives only in this tab (school-session guests,
//                   and "Try car" in the garage): no account, no rewards
//   onlineDriver    a seat in an Online Race room (race/online-driver.js)
//
// The race screen draws from `state()` with engine/race.js. In a server-run
// race that state only ever comes from a server reply.

import { accountRequest, createServerClock } from "../api.js";
import { buildCircuit, stageCircuitSeed } from "../engine/circuit.js";
import { createQuestionStream, publicQuestion } from "../engine/questions.js";
import {
  COUNTDOWN_MS,
  MIN_CORRECT,
  STARTER_CAR,
  advance,
  applyAnswer,
  cpuTimeline,
  evaluateRun,
  getCar,
  getStage,
  newRacerState,
  raceSpec,
  viewAt
} from "../engine/race.js";
import { freshSeed } from "../engine/random.js";
import { PAINTS, themeForStage } from "../palette.js";

/** The computer's car at any moment, replayed from its fixed timeline. */
function createCpu(stage, events, finishMs) {
  const spec = raceSpec(STARTER_CAR, getStage(stage).lengthKm);
  let state = newRacerState();
  let next = 0;
  return {
    finishMs,
    view(raceMs) {
      while (next < events.length && events[next][0] <= raceMs) {
        state = applyAnswer(state, spec, events[next][0], events[next][1] === 1).state;
        next += 1;
      }
      return viewAt(state, spec, raceMs);
    }
  };
}

function cpuRival(cpu, lengthKm, raceMs) {
  const view = cpu.view(Math.max(0, raceMs));
  return {
    id: "cpu",
    name: "Computer",
    emoji: null,
    isCpu: true,
    model: STARTER_CAR.key,
    paint: PAINTS.rival,
    colour: "rival",
    distanceM: view.distanceKm * 1000,
    speed: view.speed,
    progress: view.progress,
    correct: view.correct,
    finished: view.finished,
    finishMs: view.finishMs,
    lengthKm
  };
}

function base(stage, car, lengthKm) {
  return {
    stage,
    lengthKm,
    minCorrect: MIN_CORRECT,
    car,
    spec: raceSpec(car, lengthKm),
    circuit: buildCircuit(lengthKm, stageCircuitSeed(stage)),
    themeName: themeForStage(stage),
    playerModel: car.key,
    playerPaint: null,
    playerName: "You"
  };
}

/** A Computer Race the server keeps. `run` is a "race-start" or "race-sync" payload. */
export function computerDriver(run) {
  const clock = createServerClock();
  clock.sample(run.nowMs, performance.now(), performance.now());
  const car = { ...(getCar(run.car.key) ?? STARTER_CAR), ...run.car };
  const cpu = createCpu(run.stage, run.cpu.events, run.cpu.finishMs);
  const spec = raceSpec(car, run.lengthKm);
  let state = run.state;
  let question = run.question;
  let result = null;
  let settling = false;
  let retryAt = 0;

  const raceMs = () => clock.now() - run.startsAtMs;

  function take(payload, sentAt) {
    if (Number.isFinite(payload.nowMs)) clock.sample(payload.nowMs, sentAt, performance.now());
    if (payload.state) state = payload.state;
    if (payload.question !== undefined) question = payload.question;
    if ((payload.result === "finished" || payload.result === "ended") && !result) {
      result = { ...payload, mode: "computer", stage: run.stage, car, lengthKm: run.lengthKm };
      question = null;
    }
  }

  return {
    ...base(run.stage, car, run.lengthKm),
    mode: "computer",
    title: `Stage ${run.stage}`,
    settings: run.settings,
    raceMs,
    state: () => state,
    question: () => question,
    rivals: at => [cpuRival(cpu, run.lengthKm, at)],
    result: () => result,
    async answer(index, choice) {
      const sentAt = performance.now();
      const payload = await accountRequest("race-answer", { run: run.id, index, choice });
      take(payload, sentAt);
      return payload;
    },
    /** Called every frame: when the clock carries the car over the line, ask the server to confirm it. */
    tick(at) {
      if (result || settling || performance.now() < retryAt) return;
      if (!viewAt(state, spec, at).finished) return;
      settling = true;
      const sentAt = performance.now();
      accountRequest("race-sync", { run: run.id })
        .then(payload => {
          if (payload.run) take({ nowMs: payload.run.nowMs, state: payload.run.state, question: payload.run.question }, sentAt);
          else take(payload, sentAt);
        })
        .catch(() => { /* the next frame tries again */ })
        .finally(() => {
          settling = false;
          retryAt = performance.now() + 400;
        });
    },
    async quit() {
      if (result) return;
      try {
        take(await accountRequest("race-quit", { run: run.id }, { keepalive: true }), performance.now());
      } catch {
        /* Leaving anyway: the next race replaces this one. */
      }
    },
    dispose() {}
  };
}

/**
 * A race that exists only in this tab: for a school session (which has no
 * account to save to) and for trying a car. The same engine, the same rules,
 * the same computer; nothing is sent anywhere and nothing is earned.
 */
export function practiceDriver({ stage, carKey = STARTER_CAR.key, settings, reason = "guest" }) {
  const car = getCar(carKey) ?? STARTER_CAR;
  const stageInfo = getStage(stage);
  const spec = raceSpec(car, stageInfo.lengthKm);
  const seed = freshSeed();
  const stream = createQuestionStream(settings, `${seed}:player`, { orderSeed: seed });
  const timeline = cpuTimeline(stage, `${seed}:cpu`);
  const cpu = createCpu(stage, timeline.events, timeline.finishMs);
  const startedAt = performance.now() + COUNTDOWN_MS;
  let state = newRacerState();
  let current = stream.next();
  let result = null;

  const raceMs = () => performance.now() - startedAt;

  function finish(finalState) {
    state = finalState;
    const outcome = evaluateRun({ stage, carKey: car.key, settings: stream.settings, state, cpuFinishMs: timeline.finishMs });
    result = { result: "finished", mode: "practice", reason, stage, car, lengthKm: stageInfo.lengthKm, outcome: { ...outcome, stage, car: car.key }, state, rewards: null };
  }

  return {
    ...base(stage, car, stageInfo.lengthKm),
    mode: "practice",
    reason,
    title: reason === "try" ? `Trying ${car.name}` : `Stage ${stage} practice`,
    settings: stream.settings,
    raceMs,
    state: () => state,
    question: () => (result ? null : publicQuestion(current)),
    rivals: at => [cpuRival(cpu, stageInfo.lengthKm, at)],
    result: () => result,
    async answer(index, choice) {
      const at = raceMs();
      const now = advance(state, spec, Math.max(0, at));
      if (now.finishMs !== null) {
        finish(now);
        return { result: "finished" };
      }
      if (index !== state.answered) return { result: "stale" };
      const correct = choice === current.correctIndex;
      const applied = applyAnswer(state, spec, at, correct);
      if (!applied.accepted) return { result: applied.reason };
      const answered = current;
      state = applied.state;
      current = stream.next();
      return { result: "ok", correct, answer: answered.answer, choice };
    },
    tick(at) {
      if (result) return;
      const now = advance(state, spec, Math.max(0, at));
      if (now.finishMs !== null) finish(now);
    },
    async quit() {
      if (!result) finish(advance(state, spec, Math.max(0, raceMs())));
    },
    dispose() {}
  };
}
