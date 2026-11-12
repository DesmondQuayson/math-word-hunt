// The racing model shared by Computer Race and Online Race. Pure: no DOM, no
// timers, no randomness of its own. The server runs exactly this code on the
// answers it has checked itself; a browser runs it only to draw the car between
// server replies. Nothing a browser computes here is ever believed.
//
// The model, in full:
//   * A car has a speed. A CORRECT answer adds the car's acceleration to it, up
//     to the car's top speed. Between answers the speed eases back towards an
//     idle roll, at the car's own rate (better "handling" = holds speed longer).
//   * A WRONG answer adds nothing and lifts the throttle: the speed above idle
//     is cut to two fifths, and the answer buttons rest longer. Guessing is always slower
//     than thinking.
//   * Distance is speed over time, worked out exactly (closed form) between
//     answers, so the frame rate of the screen has no effect on it at all.
//   * THE 30-ANSWER RULE: a car can never be further along than
//     (correct answers / 30) of the race. With 29 correct answers no car, at any
//     speed, can be past 96.7%; the finish line needs 30. No car or upgrade can
//     change that number.

import { createRandom } from "./random.js";

/** Correct answers every racer needs before the finish line can be crossed. */
export const MIN_CORRECT = 30;
/** The slow roll every car eases back to between answers, km/h. */
export const IDLE_SPEED = 30;
/** A wrong answer keeps this share of the speed above idle. */
export const WRONG_SPEED_KEPT = 0.4;
/** Rest after a correct answer, ms. The server refuses anything sooner. */
export const CORRECT_LOCK_MS = 350;
/** Rest after a wrong answer, ms. */
export const WRONG_LOCK_MS = 2000;
/** Lights-out countdown before every race, ms. */
export const COUNTDOWN_MS = 4000;
/** A race nobody finishes is closed after this long, ms. */
export const MAX_RACE_MS = 20 * 60 * 1000;

/**
 * The four cars of Computer Race. These numbers ARE the simulation: the shop
 * shows them, the server races with them, and nothing else distinguishes one
 * car from another.
 *   topSpeed  km/h the car can reach
 *   boost     km/h gained per correct answer (shown as Acceleration)
 *   decay     share of the speed above idle lost per second (shown as Handling:
 *             lower is better)
 */
export const CARS = Object.freeze([
  Object.freeze({ key: "starter", name: "Street Starter", price: 0, topSpeed: 160, boost: 28, decay: 0.1, recommended: Object.freeze([1, 2]), blurb: "Free. Can win every stage with quick, accurate answers." }),
  Object.freeze({ key: "turbo-sprint", name: "Turbo Sprint", price: 2000, topSpeed: 185, boost: 32, decay: 0.09, recommended: Object.freeze([3, 6]), blurb: "Quicker off every correct answer." }),
  Object.freeze({ key: "velocity-gt", name: "Velocity GT", price: 4000, topSpeed: 210, boost: 36, decay: 0.08, recommended: Object.freeze([7, 8]), blurb: "Higher top speed and holds it longer." }),
  Object.freeze({ key: "thunder-x", name: "Thunder X", price: 6000, topSpeed: 240, boost: 40, decay: 0.07, recommended: Object.freeze([9, 10]), blurb: "The fastest car in the garage. Still needs 30 correct answers." })
]);

export const CAR_KEYS = Object.freeze(CARS.map(car => car.key));
export const STARTER_CAR = CARS[0];

/** Online Race: every racer drives this one car. Garage cars are never used online. */
export const ONLINE_CAR = Object.freeze({ key: "circuit-standard", name: "Circuit Standard", topSpeed: 180, boost: 30, decay: 0.09 });
export const ONLINE_LENGTH_KM = 8;
/** Paint only: a colour changes nothing about how a car performs. */
export const RACER_COLOURS = Object.freeze(["turquoise", "pink", "gold", "green", "red", "purple", "orange", "white"]);
/** Racers in one Online Race room, the creator included. */
export const ROOM_CAPACITY = 60;

export function getCar(key) {
  return CARS.find(car => car.key === key) ?? null;
}

/**
 * The ten stages. The computer always drives the Street Starter; what grows
 * from stage to stage is how quickly and how accurately it answers:
 *   interval  seconds it takes over each answer, on average
 *   accuracy  share of its answers that are correct
 * `lengthKm` is set so the computer finishes in about five and three quarter
 * minutes on every stage (engine tests hold it to that), and `reward` is the
 * one-time first-win payment: 500 Race Dollars, then 100 more per stage.
 */
export const STAGES = Object.freeze(
  [
    { interval: 7.5, accuracy: 0.72, lengthKm: 4.8, suggested: "beginner" },
    { interval: 6.6, accuracy: 0.75, lengthKm: 5.3, suggested: "beginner" },
    { interval: 5.9, accuracy: 0.78, lengthKm: 5.7, suggested: "easy" },
    { interval: 5.3, accuracy: 0.8, lengthKm: 6.1, suggested: "easy" },
    { interval: 4.8, accuracy: 0.82, lengthKm: 6.6, suggested: "medium" },
    { interval: 4.3, accuracy: 0.84, lengthKm: 7.1, suggested: "medium" },
    { interval: 3.8, accuracy: 0.86, lengthKm: 7.8, suggested: "medium" },
    { interval: 3.4, accuracy: 0.88, lengthKm: 8.5, suggested: "hard" },
    { interval: 3.0, accuracy: 0.91, lengthKm: 9.6, suggested: "hard" },
    { interval: 2.6, accuracy: 0.93, lengthKm: 10.9, suggested: "expert" }
  ].map((stage, index) => Object.freeze({ stage: index + 1, reward: 500 + index * 100, ...stage }))
);

export const STAGE_COUNT = STAGES.length;

export function getStage(number) {
  return STAGES.find(stage => stage.stage === number) ?? null;
}

export function stageReward(number) {
  return getStage(number)?.reward ?? 0;
}

/** Every way to earn Race Dollars other than a stage's first win. Each pays once per account. */
export const ACHIEVEMENT_REWARD = 250;
export const ACHIEVEMENTS = Object.freeze([
  Object.freeze({ key: "first-win", title: "First Win", text: "Win any stage." }),
  Object.freeze({ key: "sharp-90", title: "Sharp Driver", text: "Win a race with 90% accuracy or better." }),
  Object.freeze({ key: "flawless", title: "Flawless", text: "Win a race without a single wrong answer." }),
  Object.freeze({ key: "streak-15", title: "On a Roll", text: "Answer 15 in a row correctly in one race." }),
  Object.freeze({ key: "mixed-master", title: "Mixed Master", text: "Win Stage 3 or higher on Mixed Skills." }),
  Object.freeze({ key: "hard-mode", title: "Hard Mode", text: "Win a race on Hard or Expert questions." }),
  Object.freeze({ key: "top-speed", title: "Flat Out", text: "Reach your car's top speed in a race." }),
  Object.freeze({ key: "starter-hero", title: "Starter Hero", text: "Win Stage 5 or higher in the Street Starter." }),
  Object.freeze({ key: "halfway", title: "Halfway There", text: "Win Stages 1 to 5." }),
  Object.freeze({ key: "champion", title: "Champion", text: "Win all ten stages." })
]);
export const ACHIEVEMENT_KEYS = Object.freeze(ACHIEVEMENTS.map(item => item.key));

/** Everything that can ever be earned: 9,500 from stages and 2,500 from achievements. */
export const TOTAL_EARNABLE = STAGES.reduce((sum, stage) => sum + stage.reward, 0) + ACHIEVEMENTS.length * ACHIEVEMENT_REWARD;

// ------------------------------------------------------------------ physics

/** What the simulation needs to know about one racer's car and race. */
export function raceSpec(car, lengthKm) {
  return Object.freeze({ topSpeed: car.topSpeed, boost: car.boost, decay: car.decay, lengthKm });
}

export function newRacerState() {
  return {
    t: 0, // ms since the start of the race that the state is true at
    x: 0, // km travelled
    v: 0, // km/h; every car waits on the grid until its first correct answer
    correct: 0,
    wrong: 0,
    answered: 0, // index of the next question
    streak: 0,
    bestStreak: 0,
    maxSpeed: 0,
    lockedUntil: 0,
    finishMs: null
  };
}

export function isRacerState(value) {
  if (!value || typeof value !== "object") return false;
  const numbers = ["t", "x", "v", "correct", "wrong", "answered", "streak", "bestStreak", "maxSpeed", "lockedUntil"];
  if (!numbers.every(key => typeof value[key] === "number" && Number.isFinite(value[key]) && value[key] >= 0)) return false;
  if (value.finishMs !== null && !(typeof value.finishMs === "number" && Number.isFinite(value.finishMs) && value.finishMs >= 0)) return false;
  return Number.isInteger(value.correct) && Number.isInteger(value.wrong) && value.answered === value.correct + value.wrong;
}

/** How far a racer may be right now: the 30-answer rule. */
export function distanceAllowed(correct, lengthKm) {
  return lengthKm * Math.min(1, correct / MIN_CORRECT);
}

/** km covered in `seconds` starting at speed `v`, easing towards idle. */
function coast(v, decay, seconds) {
  return (IDLE_SPEED * seconds + ((v - IDLE_SPEED) * (1 - Math.exp(-decay * seconds))) / decay) / 3600;
}

function speedAfter(v, decay, seconds) {
  return IDLE_SPEED + (v - IDLE_SPEED) * Math.exp(-decay * seconds);
}

/**
 * The racer's state at race time `toMs` if nothing else happens until then.
 * Returns a new state; never moves a racer past what its correct answers allow,
 * and records the exact moment the finish line is crossed.
 */
export function advance(state, spec, toMs) {
  if (state.finishMs !== null || !(toMs > state.t)) return state;
  const seconds = (toMs - state.t) / 1000;
  const allowed = distanceAllowed(state.correct, spec.lengthKm);
  if (state.x >= allowed) {
    // Waiting for a correct answer: the car stands still.
    return { ...state, t: toMs, x: allowed, v: 0 };
  }
  const travelled = coast(state.v, spec.decay, seconds);
  if (state.x + travelled < allowed) {
    return { ...state, t: toMs, x: state.x + travelled, v: speedAfter(state.v, spec.decay, seconds) };
  }
  // The car reaches the limit inside this stretch: find the moment (bisection).
  const gap = allowed - state.x;
  let low = 0;
  let high = seconds;
  for (let step = 0; step < 50; step += 1) {
    const middle = (low + high) / 2;
    if (coast(state.v, spec.decay, middle) < gap) low = middle;
    else high = middle;
  }
  if (allowed >= spec.lengthKm) {
    return { ...state, t: toMs, x: spec.lengthKm, v: speedAfter(state.v, spec.decay, high), finishMs: Math.round(state.t + high * 1000) };
  }
  return { ...state, t: toMs, x: allowed, v: 0 };
}

/**
 * One answer at race time `atMs`. `isCorrect` is the server's own verdict.
 * Refused (state returned unchanged, `accepted: false`) before the start, after
 * the finish, or while the buttons are resting.
 */
export function applyAnswer(state, spec, atMs, isCorrect) {
  if (atMs < 0) return { state, accepted: false, reason: "not-started" };
  if (atMs < state.lockedUntil) return { state, accepted: false, reason: "locked" };
  const now = advance(state, spec, atMs);
  if (now.finishMs !== null) return { state: now, accepted: false, reason: "finished" };
  const next = { ...now, t: atMs, answered: now.answered + 1 };
  if (isCorrect) {
    next.correct += 1;
    next.streak += 1;
    next.bestStreak = Math.max(next.bestStreak, next.streak);
    next.v = Math.min(spec.topSpeed, Math.max(next.v, 0) + spec.boost);
    next.maxSpeed = Math.max(next.maxSpeed, next.v);
    next.lockedUntil = atMs + CORRECT_LOCK_MS;
  } else {
    next.wrong += 1;
    next.streak = 0;
    // Never faster after a wrong answer: only the speed above idle is cut.
    if (next.v > IDLE_SPEED) next.v = IDLE_SPEED + (next.v - IDLE_SPEED) * WRONG_SPEED_KEPT;
    next.lockedUntil = atMs + WRONG_LOCK_MS;
  }
  return { state: next, accepted: true, reason: null };
}

export function progressOf(state, spec) {
  return Math.min(1, state.x / spec.lengthKm);
}

/** What a screen may show about a racer at `atMs` (the state itself is left alone). */
export function viewAt(state, spec, atMs) {
  const now = advance(state, spec, Math.max(atMs, state.t));
  return {
    progress: progressOf(now, spec),
    distanceKm: now.x,
    speed: now.v,
    correct: now.correct,
    wrong: now.wrong,
    finished: now.finishMs !== null,
    finishMs: now.finishMs,
    waiting: now.finishMs === null && now.x >= distanceAllowed(now.correct, spec.lengthKm) && now.correct < MIN_CORRECT
  };
}

export function accuracyOf(state) {
  const answered = state.correct + state.wrong;
  return answered === 0 ? 0 : Math.round((state.correct / answered) * 100);
}

// --------------------------------------------------------------- the computer

/**
 * The computer's whole race, from a seed: every answer it gives, when, and
 * whether it is right. It drives the Street Starter through exactly the same
 * `applyAnswer` as a person, so it obeys the 30-answer rule, brakes on its own
 * wrong answers and never moves except by answering.
 */
export function cpuTimeline(stageNumber, seed) {
  const stage = getStage(stageNumber);
  if (!stage) throw new RangeError(`Unknown stage: ${String(stageNumber)}`);
  const spec = raceSpec(STARTER_CAR, stage.lengthKm);
  const random = createRandom(`${seed}:cpu:${stage.stage}`);
  const events = [];
  let state = newRacerState();
  let at = 0;
  while (state.finishMs === null && at < MAX_RACE_MS) {
    // Thinking time varies by 35% either way; never quicker than a person could press.
    const think = stage.interval * (0.65 + 0.7 * random.next()) * 1000;
    at = Math.max(at + think, state.lockedUntil + 250);
    const isCorrect = random.next() < stage.accuracy;
    const result = applyAnswer(state, spec, Math.round(at), isCorrect);
    state = result.state;
    if (result.accepted) events.push([Math.round(at), isCorrect ? 1 : 0]);
    else if (state.finishMs === null) break;
  }
  if (state.finishMs === null) state = advance(state, spec, MAX_RACE_MS);
  return Object.freeze({ stage: stage.stage, events: Object.freeze(events), finishMs: state.finishMs, correct: state.correct, wrong: state.wrong });
}

/** The computer's state at race time `atMs`, replayed from its timeline. */
export function cpuStateAt(timeline, atMs) {
  const stage = getStage(timeline.stage);
  const spec = raceSpec(STARTER_CAR, stage.lengthKm);
  let state = newRacerState();
  for (const [at, isCorrect] of timeline.events) {
    if (at > atMs) break;
    state = applyAnswer(state, spec, at, isCorrect === 1).state;
  }
  return { state, spec };
}

// ------------------------------------------------------------------- results

/**
 * The result of a finished Computer Race and the achievements it earns on its
 * own merits ("halfway" and "champion" depend on other stages and are decided
 * where the stage record lives). Run by the server on the state it built.
 */
export function evaluateRun({ stage, carKey, settings, state, cpuFinishMs }) {
  const finished = state.finishMs !== null;
  const won = finished && state.correct >= MIN_CORRECT && (cpuFinishMs === null || state.finishMs < cpuFinishMs);
  const car = getCar(carKey) ?? STARTER_CAR;
  const achievements = [];
  if (won) {
    const accuracy = accuracyOf(state);
    achievements.push("first-win");
    if (accuracy >= 90) achievements.push("sharp-90");
    if (state.wrong === 0) achievements.push("flawless");
    if (stage >= 3 && settings.categories.length === 7) achievements.push("mixed-master");
    if (settings.difficulty === "hard" || settings.difficulty === "expert") achievements.push("hard-mode");
    if (stage >= 5 && car.key === STARTER_CAR.key) achievements.push("starter-hero");
  }
  if (finished) {
    if (state.bestStreak >= 15) achievements.push("streak-15");
    if (state.maxSpeed >= car.topSpeed - 1e-9) achievements.push("top-speed");
  }
  return Object.freeze({
    finished,
    won,
    timeMs: state.finishMs,
    cpuTimeMs: cpuFinishMs,
    correct: state.correct,
    wrong: state.wrong,
    accuracy: accuracyOf(state),
    maxSpeed: Math.round(state.maxSpeed),
    bestStreak: state.bestStreak,
    achievements: Object.freeze(achievements)
  });
}

/**
 * Order finished racers by the moment they crossed the line; racers who cross
 * in the same millisecond share a place. Unfinished racers follow, by distance.
 * `racers` is [{ id, finishMs, x }]. Never looks at join order or at names.
 */
export function rankRacers(racers) {
  const ordered = [...racers].sort((a, b) => {
    if (a.finishMs !== null && b.finishMs !== null) return a.finishMs - b.finishMs;
    if (a.finishMs !== null) return -1;
    if (b.finishMs !== null) return 1;
    return b.x - a.x;
  });
  let place = 0;
  return ordered.map((racer, index) => {
    const previous = ordered[index - 1];
    const same = previous && ((racer.finishMs !== null && racer.finishMs === previous.finishMs) || (racer.finishMs === null && previous.finishMs === null && racer.x === previous.x));
    if (!same) place = index + 1;
    return { ...racer, place, tied: Boolean(same) };
  });
}
