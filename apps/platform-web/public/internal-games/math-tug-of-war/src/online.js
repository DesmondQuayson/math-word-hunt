// Online Match client. Talks only to this site's own API
// (connect-src 'self'); the server decides every outcome. Room state is
// polled; pulls are animated locally from the authoritative pull counts, so
// nothing about animation ever crosses the network.

export const ONLINE_ENDPOINT = "/api/games/math-tug-of-war/online";
export const SEAT_KEY = "mathnexa:math-tug-of-war:online-seat";
export const POLL_PLAYING_MS = 700;
export const POLL_IDLE_MS = 1500;
/** Our own connection counts as "reconnecting" after this long without a reply. */
export const RECONNECTING_AFTER_MS = 3500;

export const ONLINE_MESSAGES = Object.freeze({
  "invalid-code": "Check the room code. It has 5 letters and numbers.",
  "room-not-found": "No game was found with that room code.",
  "room-expired": "That room has expired. Ask for a new room code.",
  "room-full": "That room already has two players.",
  "already-in-room": "You created that room. Share the code with your opponent.",
  "rate-limited": "Too many tries. Wait a few minutes, then try again.",
  "game-access-required": "Your Math Games access has ended. Return to Math Games to sign in again.",
  "invalid-skill": "Choose a math skill.",
  unavailable: "Online Match is temporarily unavailable."
});

export class OnlineError extends Error {
  constructor(code, status) {
    super(ONLINE_MESSAGES[code] ?? ONLINE_MESSAGES.unavailable);
    this.code = code in ONLINE_MESSAGES ? code : "unavailable";
    this.status = status;
  }
}

export async function onlineRequest(body, { signal } = {}) {
  let response;
  try {
    response = await fetch(ONLINE_ENDPOINT, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      // The game document is served with Referrer-Policy: no-referrer, under
      // which a POST would carry "Origin: null". A same-origin request policy
      // lets the server verify the real origin.
      referrerPolicy: "same-origin",
      headers: { "Content-Type": "application/json", "X-MathNexa-Game": "math-tug-of-war" },
      body: JSON.stringify(body),
      signal
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new OnlineError("unavailable", 0);
  }
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok || !payload || typeof payload !== "object") {
    throw new OnlineError(typeof payload?.error === "string" ? payload.error : "unavailable", response.status);
  }
  return payload;
}

export function saveSeat(seat) {
  try {
    sessionStorage.setItem(SEAT_KEY, JSON.stringify({ code: seat.code, token: seat.token }));
  } catch {
    /* A reload simply will not offer to rejoin. */
  }
}

export function readSeat() {
  try {
    const value = JSON.parse(sessionStorage.getItem(SEAT_KEY) ?? "null");
    if (value && typeof value.code === "string" && typeof value.token === "string") return value;
  } catch {
    /* ignore */
  }
  return null;
}

export function forgetSeat() {
  try {
    sessionStorage.removeItem(SEAT_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * A live seat in a room: polls state, submits answers and reports changes.
 * `onState(state, previous)` fires for every newer version;
 * `onConnection("online" | "reconnecting")` when our own link changes.
 */
export function createOnlineSeat({ code, token, onState, onConnection, onFatal }) {
  let state = null;
  let timer = null;
  let stopped = false;
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
    // Never go backwards: an older poll reply can land after a newer answer reply.
    if (previous && next.version < previous.version && next.round <= previous.round) return;
    state = next;
    lastSuccess = Date.now();
    setConnection("online");
    onState?.(next, previous, extra);
  };

  const schedule = () => {
    if (stopped) return;
    clearTimeout(timer);
    const playing = state?.status === "playing";
    timer = setTimeout(poll, playing ? POLL_PLAYING_MS : POLL_IDLE_MS);
  };

  async function poll() {
    if (stopped) return;
    if (document.hidden) {
      // A hidden page keeps its seat; it simply polls slowly (the server
      // shows us as reconnecting to the opponent, never as a forfeit).
      timer = setTimeout(poll, POLL_IDLE_MS * 2);
      return;
    }
    try {
      inFlight = new AbortController();
      const payload = await onlineRequest({ action: "state", code, token }, { signal: inFlight.signal });
      accept(payload.state);
    } catch (error) {
      if (error?.name === "AbortError") return;
      if (error instanceof OnlineError && [401, 404, 410].includes(error.status)) {
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
    code,
    token,
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
    async answer(raw) {
      if (!state || state.status !== "playing" || !state.question) return null;
      const payload = await onlineRequest({
        action: "answer",
        code,
        token,
        round: state.round,
        questionIndex: state.question.index,
        answer: raw
      });
      accept(payload.state, { solved: payload.solved });
      return payload;
    },
    async rematch() {
      if (!state) return null;
      const payload = await onlineRequest({ action: "rematch", code, token, round: state.round });
      accept(payload.state);
      return payload;
    },
    async leave() {
      stopped = true;
      clearTimeout(timer);
      inFlight?.abort();
      try {
        await onlineRequest({ action: "leave", code, token });
      } catch {
        /* Leaving is best effort; the room also expires on its own. */
      }
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
      inFlight?.abort();
    }
  });
}
