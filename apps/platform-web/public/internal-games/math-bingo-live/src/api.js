// Math Bingo Live transport. Same-origin HTTPS only (connect-src 'self'):
// no WebSocket, no third-party realtime host, nothing a school filter has to
// open beyond the MathNexa site itself. Room state is polled with a version
// check, so an unchanged room costs one tiny reply; a poll is also scheduled
// for the moment the current phase ends, so every screen flips together.
// The server decides every outcome; this file only carries requests.

export const HOST_ENDPOINT = "/api/games/math-bingo-live/host";
export const PLAY_ENDPOINT = "/api/games/math-bingo-live/play";
export const RECONNECTING_AFTER_MS = 4000;

export const MESSAGES = Object.freeze({
  "invalid-code": "Check the game code. It has 6 numbers.",
  "room-not-found": "No game was found with that code. Check the code on your teacher's screen.",
  "seat-not-found": "This game has ended.",
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

/** One POST to a Math Bingo Live endpoint; resolves with the JSON payload. */
export async function liveRequest(endpoint, body, { signal } = {}) {
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
      signal
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new LiveError("unavailable", 0);
  }
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok || !payload || typeof payload !== "object") {
    throw new LiveError(typeof payload?.error === "string" ? payload.error : "unavailable", response.status);
  }
  return payload;
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
    // Never go backwards: an older poll reply can land after a newer action reply.
    if (previous && next.gameNumber === previous.gameNumber && next.version < previous.version && next.me?.version <= previous.me?.version) return;
    state = next;
    onState?.(next, previous, extra);
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
      const untilDeadline = deadline - clock.now() + 120;
      if (untilDeadline > 0 && untilDeadline < wait) wait = untilDeadline;
    }
    timer = setTimeout(poll, Math.max(150, wait));
  };

  async function send(action, extra = {}, { signal } = {}) {
    const sentAt = Date.now();
    const payload = await liveRequest(endpoint, { action, ...credentials(), ...extra }, { signal });
    clock.sample(payload.serverNow ?? payload.state?.timing?.serverNow, sentAt, Date.now());
    succeed();
    return payload;
  }

  async function poll() {
    if (stopped) return;
    try {
      inFlight = new AbortController();
      const payload = await send("state", since(state), { signal: inFlight.signal });
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
        const payload = await send(action, extra);
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
