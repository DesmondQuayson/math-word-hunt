// A racer that plays an Online Race over HTTP exactly as a browser does: it is
// told a question and two choices, works the answer out, and sends "left" or
// "right". It is never told an answer and has no shortcut. Used by the browser
// tests (extra racers in a room) and by the load test (10 to 50 racers).

import { DIVIDE, MINUS, SUPERSCRIPTS, TIMES, decimalsEqual, parseDecimal, shiftDecimal } from "../apps/platform-web/public/internal-games/math-race-champions/src/engine/questions.js";

const EQUATION = new RegExp(`^(\\d+) ([+${MINUS}${TIMES}${DIVIDE}]) \\? = (\\d+)$`);
const POWER = new RegExp(`^(\\d+)([${SUPERSCRIPTS.join("")}]) = \\?$`);

/** Which of the two choices is correct, worked out from the question as shown. */
export function solveQuestion(text, choices) {
  const fits = choice => {
    const equation = EQUATION.exec(text);
    if (equation) {
      const first = Number(equation[1]);
      const result = Number(equation[3]);
      const value = Number(choice);
      if (equation[2] === "+") return first + value === result;
      if (equation[2] === MINUS) return first - value === result;
      if (equation[2] === TIMES) return first * value === result;
      return value !== 0 && first === result * value;
    }
    const power = POWER.exec(text);
    if (power) return Number(choice) === Number(power[1]) ** SUPERSCRIPTS.indexOf(power[2]);
    const shown = /^(.+) = \?$/.exec(text)[1];
    const left = parseDecimal(shown);
    const right = parseDecimal(choice);
    return shown.endsWith("%") ? decimalsEqual(left, shiftDecimal(right, 2)) : decimalsEqual(shiftDecimal(left, 2), right);
  };
  const first = fits(choices[0]);
  const second = fits(choices[1]);
  if (first === second) throw new Error(`Cannot solve "${text}" with ${choices.join(" | ")}`);
  return first ? 0 : 1;
}

const sleep = ms => new Promise(done => setTimeout(done, ms));

function serverTiming(header) {
  const out = {};
  for (const part of String(header ?? "").split(",")) {
    const match = /^\s*([a-z]+);dur=([0-9.]+)/.exec(part);
    if (match) out[match[1]] = Number(match[2]);
  }
  return out;
}

export class HttpRacer {
  /**
   * `thinkMs` is how long this racer takes over each answer and `accuracy` how
   * often it is right; `extraHeaders` is for a protected staging preview.
   */
  constructor(origin, { name, colour = "turquoise", emoji = null, thinkMs = 1500, accuracy = 1, extraHeaders = {}, onSample = null } = {}) {
    this.origin = origin.replace(/\/$/, "");
    this.name = name;
    this.colour = colour;
    this.emoji = emoji;
    this.thinkMs = thinkMs;
    this.accuracy = accuracy;
    this.extraHeaders = extraHeaders;
    this.onSample = onSample;
    this.token = null;
    this.room = null;
    this.offset = 0;
    this.answers = 0;
    this.refused = 0;
    this.errors = 0;
    this.stopped = false;
  }

  async post(endpoint, body, kind = body.action) {
    const started = performance.now();
    const response = await fetch(`${this.origin}/api/games/math-race-champions/${endpoint}`, {
      method: "POST",
      headers: { ...this.extraHeaders, "content-type": "application/json", "x-mathnexa-game": "math-race-champions", "sec-fetch-site": "same-origin", origin: this.origin },
      body: JSON.stringify(body)
    });
    const elapsed = performance.now() - started;
    const payload = await response.json().catch(() => ({}));
    this.onSample?.({ kind, ms: elapsed, status: response.status, timing: serverTiming(response.headers.get("server-timing")) });
    return { status: response.status, body: payload, ms: elapsed };
  }

  take(room, sentAt) {
    if (!room) return;
    if (this.room && room.me.version < this.room.me.version) return;
    this.room = room;
    if (Number.isFinite(room.nowMs)) this.offset = room.nowMs - (sentAt + (performance.now() - sentAt) / 2);
  }

  async join(code) {
    const sentAt = performance.now();
    const reply = await this.post("play", { action: "join", code, name: this.name, emoji: this.emoji, colour: this.colour });
    if (reply.status !== 200 || !reply.body.token) return reply;
    this.token = reply.body.token;
    this.take(reply.body.room, sentAt);
    return reply;
  }

  async poll(since) {
    const sentAt = performance.now();
    const reply = await this.post("play", { action: "state", token: this.token, ...(since === undefined ? {} : { since }) });
    if (reply.status === 200 && reply.body.room) this.take(reply.body.room, sentAt);
    else if (reply.status !== 200) this.errors += 1;
    return reply;
  }

  raceMs() {
    return this.room?.startsAtMs == null ? -1 : performance.now() + this.offset - this.room.startsAtMs;
  }

  /** One answer to the current question. `correctly` false presses the other button on purpose. */
  async answer(correctly = true) {
    const question = this.room?.question;
    if (!question) return null;
    const right = solveQuestion(question.text, question.choices);
    const sentAt = performance.now();
    const reply = await this.post("play", { action: "answer", token: this.token, index: question.index, choice: correctly ? right : right === 0 ? 1 : 0 });
    if (reply.status === 200 && reply.body.room) this.take(reply.body.room, sentAt);
    if (reply.status !== 200) this.errors += 1;
    else if (reply.body.result === "ok") this.answers += 1;
    else this.refused += 1;
    return reply;
  }

  async leave() {
    return this.post("play", { action: "leave", token: this.token });
  }

  get me() {
    return this.room?.me?.state ?? null;
  }

  get finished() {
    return this.me?.finishMs != null;
  }

  stop() {
    this.stopped = true;
  }

  /**
   * Race until the room is complete: poll about every 1.2 s as the browser does,
   * and answer every `thinkMs` (with a little human spread) while there is a
   * question. Deterministic mistakes: every k-th answer, so runs are comparable.
   */
  async race({ pollMs = 1200, maxMs = 25 * 60 * 1000 } = {}) {
    const started = performance.now();
    let nextPoll = 0;
    let nextAnswer = 0;
    const wrongEvery = this.accuracy >= 1 ? 0 : Math.max(2, Math.round(1 / (1 - this.accuracy)));
    let given = 0;
    while (!this.stopped && performance.now() - started < maxMs) {
      const now = performance.now();
      if (this.room?.phase === "COMPLETE" && this.room.finalized) break;
      if (now >= nextPoll) {
        // The same rule as the browser: a bigger room polls a little less often.
        nextPoll = now + pollMs * Math.min(2, Math.max(1, (this.room?.standings?.length ?? 1) / 30)) + Math.random() * 200;
        const reply = await this.poll();
        if (reply.status === 404 || reply.status === 410) break;
        continue;
      }
      const state = this.me;
      const at = this.raceMs();
      if (this.room?.phase === "ACTIVE" && this.room.question && state && state.finishMs == null && at >= Math.max(0, state.lockedUntil) + 30 && now >= nextAnswer) {
        given += 1;
        await this.answer(!(wrongEvery && given % wrongEvery === 0));
        nextAnswer = performance.now() + this.thinkMs * (0.8 + Math.random() * 0.4);
        continue;
      }
      await sleep(Math.max(10, Math.min(nextPoll, nextAnswer || nextPoll) - performance.now(), 20));
    }
    return this.room;
  }
}
