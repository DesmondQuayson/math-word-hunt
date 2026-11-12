// The race screen's driver for one seat in an Online Race room. Every racer,
// the creator included, races through this: same car, same road, same rules.
// The seat's state only ever comes from a server reply; other racers are drawn
// from the last state the server checked for each of them, carried forward by
// the same racing model.

import { accountRequest, createServerClock, playRequest } from "../api.js";
import { ONLINE_CIRCUIT_SEED, buildCircuit } from "../engine/circuit.js";
import { ONLINE_CAR, ONLINE_LENGTH_KM, raceSpec, viewAt } from "../engine/race.js";
import { ONLINE_THEME, PAINTS } from "../palette.js";

const POLL_MS = 1200;
/** A bigger room polls a little less often (up to twice the interval at 60 racers); cars are drawn between polls anyway. */
export const pollInterval = racers => POLL_MS * Math.min(2, Math.max(1, racers / 30));
const POLL_DONE_MS = 900;
const BOARD_ROWS = 5;

/** `seat` is { token, hostToken? }; `room` is the latest room payload; `clock` may carry over from the lobby. */
export function onlineDriver({ room: first, seat, clock = createServerClock() }) {
  const spec = raceSpec(ONLINE_CAR, ONLINE_LENGTH_KM);
  const circuit = buildCircuit(ONLINE_LENGTH_KM, ONLINE_CIRCUIT_SEED);
  let room = first;
  let result = null;
  let stopped = false;
  let timer = 0;
  let problem = null;

  function take(next, sentAt) {
    if (!next) return;
    if (Number.isFinite(next.nowMs) && sentAt !== undefined) clock.sample(next.nowMs, sentAt, performance.now());
    // Replies can arrive out of order; a seat never goes back to an older state.
    if (next.me.version < room.me.version) next = { ...next, me: room.me, question: room.question };
    room = next;
    if (room.phase === "COMPLETE" && room.finalized) {
      result = { mode: "online", standings: room.standings, me: room.me, lengthKm: ONLINE_LENGTH_KM, isCreator: room.me.isCreator };
      stop();
    }
  }

  async function poll() {
    if (stopped) return;
    const sentAt = performance.now();
    try {
      const reply = await playRequest("state", { token: seat.token });
      problem = null;
      if (reply.room) take(reply.room, sentAt);
    } catch (error) {
      problem = error;
      if (["seat-not-found", "room-closed", "room-expired", "removed"].includes(error?.code)) {
        result = { mode: "online", standings: room.standings, me: room.me, lengthKm: ONLINE_LENGTH_KM, isCreator: room.me.isCreator, ended: error.code };
        stop();
        return;
      }
    }
    if (!stopped) timer = setTimeout(poll, (room.phase === "COMPLETE" ? POLL_DONE_MS : pollInterval(room.standings.length)) + Math.random() * 200 + (document.hidden ? 1200 : 0));
  }

  function stop() {
    stopped = true;
    clearTimeout(timer);
  }

  const raceMs = () => (room.startsAtMs === null ? -5000 : clock.now() - room.startsAtMs);

  function rivalView(row, at) {
    const state = { t: row.t, x: row.x, v: row.v, correct: row.correct, wrong: row.wrong, answered: row.correct + row.wrong, streak: 0, bestStreak: 0, maxSpeed: 0, lockedUntil: 0, finishMs: row.f };
    const view = viewAt(state, spec, Math.max(0, at));
    return {
      id: row.id,
      name: row.name,
      emoji: row.emoji,
      colour: row.colour,
      isCpu: false,
      model: ONLINE_CAR.key,
      paint: PAINTS[row.colour] ?? PAINTS.white,
      distanceM: view.distanceKm * 1000,
      speed: view.speed,
      progress: view.progress,
      correct: row.correct,
      finished: view.finished,
      finishMs: view.finishMs
    };
  }

  timer = setTimeout(poll, 300);

  return {
    mode: "online",
    title: "Online Race",
    lengthKm: ONLINE_LENGTH_KM,
    minCorrect: room.minCorrect,
    car: ONLINE_CAR,
    spec,
    circuit,
    themeName: ONLINE_THEME,
    playerModel: ONLINE_CAR.key,
    playerPaint: PAINTS[room.me.colour] ?? PAINTS.turquoise,
    playerColour: room.me.colour,
    playerName: room.me.name,
    settings: room.settings,
    isCreator: room.me.isCreator === true,
    raceMs,
    /** The one start time everybody in the room was given, on the server's clock. */
    startsAtMs: () => room.startsAtMs,
    state: () => room.me.state,
    question: () => (result ? null : room.question),
    rivals: at => room.standings.filter(row => row.id !== room.me.id).map(row => rivalView(row, at)),
    result: () => result,
    connectionProblem: () => problem,
    /** The live order: finishers by the moment they crossed, then by distance. Top rows plus this racer. */
    leaderboard(at, mine) {
      const rows = room.standings.map(row => {
        const view = row.id === room.me.id ? { progress: mine.progress, finished: mine.finished, finishMs: mine.finishMs } : rivalView(row, at);
        return { id: row.id, name: row.name, emoji: row.emoji, colour: row.colour, me: row.id === room.me.id, progress: view.progress, finished: view.finished, finishMs: view.finishMs };
      });
      rows.sort((a, b) => {
        if (a.finished && b.finished) return a.finishMs - b.finishMs;
        if (a.finished) return -1;
        if (b.finished) return 1;
        return b.progress - a.progress;
      });
      rows.forEach((row, index) => {
        row.place = index + 1;
      });
      const top = rows.slice(0, BOARD_ROWS);
      const me = rows.find(row => row.me);
      return me && !top.includes(me) ? [...top.slice(0, BOARD_ROWS - 1), me] : top;
    },
    bannerText(at, mine) {
      if (problem && !result) return "Reconnecting…";
      if (mine.finished && !result) return "You crossed the line! Waiting for the other racers…";
      if (room.phase === "COMPLETE" && !result) return "The race is over. Working out the result…";
      return "";
    },
    async answer(index, choice) {
      const sentAt = performance.now();
      const reply = await playRequest("answer", { token: seat.token, index, choice });
      if (reply.room) take(reply.room, sentAt);
      return reply;
    },
    /** Creator only: end the race for everyone. Needs the session and the host token. */
    hostEnd: seat.hostToken ? () => accountRequest("host", { hostToken: seat.hostToken, command: "end" }) : null,
    async quit() {
      stop();
      if (room.me.isCreator) return; // the creator's seat belongs to the room
      try {
        await playRequest("leave", { token: seat.token }, { keepalive: true });
      } catch {
        /* Leaving anyway. */
      }
    },
    dispose: stop
  };
}
