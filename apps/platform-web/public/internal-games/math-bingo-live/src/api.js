// Math Bingo Live transport. Same-origin HTTPS only (connect-src 'self'):
// no WebSocket, no third-party realtime host, nothing a school filter has to
// open beyond the MathNexa site itself. Room state is polled with a version
// check, so an unchanged room costs one tiny reply; a poll is also scheduled
// for the moment the current phase ends, so every screen flips together.
// The server decides every outcome; this file only carries requests.

import { ATTEMPTS_PER_QUESTION } from "./engine/settings.js";

export const HOST_ENDPOINT = "/api/games/math-bingo-live/host";
export const PLAY_ENDPOINT = "/api/games/math-bingo-live/play";
export const RECONNECTING_AFTER_MS = 4000;
/** A poll or an action that takes longer than this is given up (and retried by the next poll). */
export const POLL_TIMEOUT_MS = 10_000;
export const ACTION_TIMEOUT_MS = 12_000;

export const MESSAGES = Object.freeze({
  "invalid-code": "Check the game code. It has 6 numbers.",
  "room-not-found": "No game was found with that code. Check the code on your teacher's screen.",
  "seat-not-found": "Thanks for playing! Ask your teacher for a new code to play again.",
  "room-expired": "That game has expired. Ask your teacher for a new code.",
  "room-closed": "Your teacher has ended this game.",
  "room-locked": "Joining is locked for this game. Ask your teacher.",
  "room-full": "This game is full.",
  removed: "Your teacher removed you from this game.",
  "rate-limited": "Too many tries. Wait a few minutes, then try again.",
  "name-required": "Type your name.",
  "name-too-short": "Use at least 2 characters.",
  "name-too-long": "Use 20 characters or fewer.",
  "name-invalid": "Use letters, numbers, spaces, - ' or .",
  "emoji-invalid": "Choose one of the emoji shown, or no emoji.",
  "host-sign-in-required": "Your MathNexa sign-in has ended. Sign in again to keep hosting.",
  "no-live-room": "You have no live game right now.",
  "not-available": "Math Bingo Live is not available yet.",
  "pattern-required": "Choose at least one way to win.",
  unavailable: "Math Bingo Live is having trouble connecting. Trying again…"
});

export class LiveError extends Error {
  constructor(code, status) {
    super(MESSAGES[code] ?? MESSAGES.unavailable);
    this.code = typeof code === "string" ? code : "unavailable";
    this.status = status;
  }
}

/**
 * One POST to a Math Bingo Live endpoint; resolves with the JSON payload.
 * With `timeoutMs`, a request that has not finished by then fails as
 * "unavailable" (a stuck request must never freeze a student's card); a
 * caller's own `signal` still aborts with an AbortError.
 */
export async function liveRequest(endpoint, body, { signal, timeoutMs = 0 } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  let timedOut = false;
  const timer = timeoutMs > 0 ? setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs) : null;
  try {
    let response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        // The documents are served with Referrer-Policy: no-referrer, under which
        // a POST would carry "Origin: null"; this lets the server see the origin.
        referrerPolicy: "same-origin",
        headers: { "Content-Type": "application/json", "X-MathNexa-Game": "math-bingo-live" },
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } catch (error) {
      if (error?.name === "AbortError" && !timedOut) throw error;
      throw new LiveError("unavailable", 0);
    }
    let payload = null;
    try {
      payload = await response.json();
    } catch (error) {
      if (error?.name === "AbortError" && !timedOut) throw error;
      payload = null;
    }
    if (!response.ok || !payload || typeof payload !== "object") {
      throw new LiveError(typeof payload?.error === "string" ? payload.error : "unavailable", response.status);
    }
    return payload;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

/** markUsed / attemptsLeft of a seat for the question a state shows. */
function seatForQuestion(me, questionNumber) {
  if (!Number.isInteger(me.markQuestion) || !Number.isInteger(me.attemptQuestion) || !Number.isInteger(me.attempts)) return me;
  const used = me.attemptQuestion === questionNumber ? me.attempts : 0;
  return {
    ...me,
    markUsed: questionNumber > 0 && me.markQuestion === questionNumber,
    attemptsLeft: Math.max(0, ATTEMPTS_PER_QUESTION - used)
  };
}

const newerRoom = (a, b) => a.version > b.version || (a.version === b.version && (a.progress ?? 0) >= (b.progress ?? 0));

/**
 * Merge a reply into what a screen already shows. Replies can arrive out of
 * order: a poll that left before a tap can land after the tap's reply. The
 * room (version) and a student's own seat (me.version) change independently —
 * ordinary taps change only the seat, other players' Free Space, "one away"
 * and Bingo change only the room — so the newest of EACH is kept. (Taking a
 * whole reply because its room was newer once put back a seat from before the
 * student's own tap: their marked square went blank again and tapping it was
 * refused "already marked" / "you already marked a square".)
 */
export function reconcile(previous, next) {
  if (!next) return previous;
  if (!previous || next.gameNumber > previous.gameNumber) return next;
  if (next.gameNumber < previous.gameNumber) return previous;
  const room = newerRoom(next, previous) ? next : previous;
  if (!next.me || !previous.me) return room;
  const me = next.me.version >= previous.me.version ? next.me : previous.me;
  if (room === next && me === next.me) return next;
  if (room === previous && me === previous.me) return previous;
  return { ...room, me: seatForQuestion(me, room.questionNumber) };
}

/**
 * Server clock estimate. Countdowns render from the server's deadline and
 * this offset, never from the device clock alone; low-latency samples win.
 */
export function createClock() {
  let offset = 0;
  let bestRoundTrip = Number.POSITIVE_INFINITY;
  let samples = 0;
  return Object.freeze({
    sample(serverNow, sentAt, receivedAt) {
      if (typeof serverNow !== "number") return;
      const roundTrip = Math.max(0, receivedAt - sentAt);
      const estimate = serverNow - (sentAt + roundTrip / 2);
      bestRoundTrip = Math.min(bestRoundTrip * 1.02 + 1, roundTrip);
      if (samples === 0) offset = estimate;
      else if (roundTrip <= bestRoundTrip + 80) offset = offset * 0.6 + estimate * 0.4;
      samples += 1;
    },
    now() {
      return Date.now() + offset;
    },
    get offset() {
      return offset;
    }
  });
}

const FATAL = new Set(["room-not-found", "seat-not-found", "room-expired", "room-closed", "removed", "host-sign-in-required"]);

/**
 * Polling interval for a room of this size. Up to 30 players poll at the base
 * rate; a larger class polls proportionally less often (up to twice the base
 * at 60), so a whole class makes about as many requests as 30 players do.
 * Timed phase changes do not wait for this: every client also polls at the
 * phase deadline (see DEADLINE_SPREAD_MS).
 */
export function pollInterval(base, playerCount) {
  const size = Number.isFinite(playerCount) ? playerCount : 0;
  return Math.round(base * Math.min(2, Math.max(1, size / 30)));
}

/** Deadline polls are spread over this window so a class does not arrive in one burst. */
export const DEADLINE_SPREAD_MS = 300;

/**
 * A live seat (host or player): polls, sends actions, reports state.
 *   credentials()   -> extra body fields ({ token } or { hostToken })
 *   since(state)    -> version fields for the unchanged check
 *   intervalFor(st) -> polling interval for this state
 */
export function createLiveSession({ endpoint, credentials, since, intervalFor, onState, onUnchanged, onConnection, onFatal }) {
  const clock = createClock();
  let state = null;
  let timer = null;
  let stopped = true;
  let lastSuccess = Date.now();
  let connection = "online";
  let inFlight = null;

  const setConnection = next => {
    if (next === connection) return;
    connection = next;
    onConnection?.(next);
  };

  const accept = (next, extra = {}) => {
    if (!next) return;
    const previous = state;
    // Never go backwards, for the room or for the student's own seat (see reconcile).
    const merged = reconcile(previous, next);
    if (merged === previous) return;
    state = merged;
    onState?.(merged, previous, extra);
  };

  const succeed = () => {
    lastSuccess = Date.now();
    setConnection("online");
  };

  const schedule = () => {
    if (stopped) return;
    clearTimeout(timer);
    let wait = document.hidden ? 2500 : intervalFor(state);
    const deadline = state?.timing?.phaseDeadline;
    if (typeof deadline === "number") {
      const untilDeadline = deadline - clock.now() + 120 + Math.random() * DEADLINE_SPREAD_MS;
      if (untilDeadline > 0 && untilDeadline < wait) wait = untilDeadline;
    }
    timer = setTimeout(poll, Math.max(150, wait));
  };

  async function send(action, extra = {}, { signal, timeoutMs } = {}) {
    const sentAt = Date.now();
    const payload = await liveRequest(endpoint, { action, ...credentials(), ...extra }, { signal, timeoutMs });
    clock.sample(payload.serverNow ?? payload.state?.timing?.serverNow, sentAt, Date.now());
    succeed();
    return payload;
  }

  async function poll() {
    if (stopped) return;
    try {
      inFlight = new AbortController();
      const payload = await send("state", since(state), { signal: inFlight.signal, timeoutMs: POLL_TIMEOUT_MS });
      if (payload.result === "unchanged") onUnchanged?.(payload);
      else accept(payload.state);
    } catch (error) {
      if (error?.name === "AbortError") return;
      if (error instanceof LiveError && FATAL.has(error.code)) {
        stopped = true;
        onFatal?.(error);
        return;
      }
      if (Date.now() - lastSuccess > RECONNECTING_AFTER_MS) setConnection("reconnecting");
    } finally {
      inFlight = null;
    }
    schedule();
  }

  return Object.freeze({
    clock,
    get state() {
      return state;
    },
    get connection() {
      return connection;
    },
    start(initialState) {
      stopped = false;
      if (initialState) accept(initialState);
      schedule();
    },
    pollNow() {
      clearTimeout(timer);
      inFlight?.abort();
      poll();
    },
    /** Send an action; the reply's state is applied before it resolves. */
    async act(action, extra = {}) {
      try {
        const payload = await send(action, extra, { timeoutMs: ACTION_TIMEOUT_MS });
        if (payload.state) accept(payload.state, payload);
        schedule();
        return payload;
      } catch (error) {
        if (error instanceof LiveError && FATAL.has(error.code)) {
          stopped = true;
          onFatal?.(error);
        }
        throw error;
      }
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
      inFlight?.abort();
    }
  });
}

export function readStored(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null");
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

export function writeStored(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Private browsing can refuse storage; a reload then cannot restore. */
  }
}
