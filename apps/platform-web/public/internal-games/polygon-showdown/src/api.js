// Polygon Showdown transport: same-origin HTTPS only (connect-src 'self'), no
// WebSocket, nothing a school filter has to open beyond MathNexa itself.
// The server decides every outcome; this file only carries requests.

export const ACCOUNT_ENDPOINT = "/api/games/polygon-showdown/account";
export const PLAY_ENDPOINT = "/api/games/polygon-showdown/play";
const DEFAULT_TIMEOUT_MS = 12_000;

export const MESSAGES = Object.freeze({
  "invalid-code": "Check the code. It has 6 numbers.",
  "room-not-found": "No Showdown was found with that code.",
  "seat-not-found": "This Showdown has finished. Ask for a new code to play again.",
  "room-expired": "That Showdown has expired.",
  "room-closed": "The creator has ended this Showdown.",
  "room-finished": "That Showdown has already finished.",
  "room-locked": "Joining is locked for this Showdown.",
  "room-full": "This Showdown is full.",
  removed: "You were removed from this Showdown.",
  "rate-limited": "Too many tries. Wait a few minutes, then try again.",
  "name-required": "Type your name.",
  "name-too-short": "Use at least 2 characters.",
  "name-too-long": "Use 20 characters or fewer.",
  "name-invalid": "Use letters, numbers, spaces, - ' or .",
  "emoji-invalid": "Choose one of the emoji shown, or no emoji.",
  "sign-in-required": "Your MathNexa sign-in has ended. Sign in again to keep your progress.",
  "account-required": "Sign in to a MathNexa account to save coins, purchases and avatar progress.",
  "no-live-room": "You have no live Showdown right now.",
  "no-active-run": "You have no unfinished Solo run.",
  "run-moved": "This run is now open in another window.",
  "run-ended": "This run has ended.",
  "run-not-found": "This run could not be found.",
  "item-not-owned": "Buy that item before wearing it.",
  "not-available": "Polygon Showdown is not available yet.",
  unavailable: "Polygon Showdown is having trouble connecting. Trying again…"
});

export class GameError extends Error {
  constructor(code, status) {
    super(MESSAGES[code] ?? MESSAGES.unavailable);
    this.code = typeof code === "string" ? code : "unavailable";
    this.status = status;
  }
}

async function post(endpoint, body, { timeoutMs = DEFAULT_TIMEOUT_MS, keepalive = false } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
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
        keepalive,
        headers: { "Content-Type": "application/json", "X-MathNexa-Game": "polygon-showdown" },
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } catch {
      throw new GameError("unavailable", 0);
    }
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (!response.ok || !payload || typeof payload !== "object") {
      throw new GameError(typeof payload?.error === "string" ? payload.error : "unavailable", response.status);
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

export const accountRequest = (action, fields = {}, options) => post(ACCOUNT_ENDPOINT, { action, ...fields }, options);
export const playRequest = (action, fields = {}, options) => post(PLAY_ENDPOINT, { action, ...fields }, options);

/** Timing kept from the fastest round trips: the device clock is never trusted. */
export function createServerClock() {
  let offset = null;
  let bestRtt = Infinity;
  let bestAt = 0;
  return {
    sample(serverMs, sentAt, receivedAt) {
      if (!Number.isFinite(serverMs)) return;
      const rtt = receivedAt - sentAt;
      // A better sample always wins; an old best sample slowly loses its claim.
      if (offset === null || rtt <= bestRtt || receivedAt - bestAt > 20_000) {
        bestRtt = rtt;
        bestAt = receivedAt;
        offset = serverMs + rtt / 2 - receivedAt;
      }
    },
    now() {
      return performance.now() + (offset ?? 0);
    },
    ready: () => offset !== null
  };
}
