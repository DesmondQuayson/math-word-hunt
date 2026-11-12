// Math Race Champions transport: same-origin HTTPS only (connect-src 'self'), no
// WebSocket, nothing a school filter has to open beyond MathNexa itself.
// The server decides every outcome; this file only carries requests.

export const ACCOUNT_ENDPOINT = "/api/games/math-race-champions/account";
export const PLAY_ENDPOINT = "/api/games/math-race-champions/play";
const DEFAULT_TIMEOUT_MS = 12_000;

export const MESSAGES = Object.freeze({
  "invalid-code": "Check the code. It has 6 numbers.",
  "room-not-found": "No race was found with that code.",
  "seat-not-found": "This race has finished. Ask for a new code to race again.",
  "room-expired": "That race has expired.",
  "room-closed": "The creator has ended this race.",
  "room-finished": "That race has already finished.",
  "room-started": "That race has already started. Ask the creator for the next one.",
  "room-locked": "Joining is locked for this race.",
  "room-full": "This race is full.",
  removed: "You were removed from this race.",
  "rate-limited": "Too many tries. Wait a few minutes, then try again.",
  "name-required": "Type your name.",
  "name-too-short": "Use at least 2 characters.",
  "name-too-long": "Use 20 characters or fewer.",
  "name-invalid": "Use letters, numbers, spaces, - ' or .",
  "emoji-invalid": "Choose one of the emoji shown, or no emoji.",
  "sign-in-required": "Your MathNexa sign-in has ended. Sign in again to keep your progress.",
  "account-required": "Sign in to a MathNexa account to save Race Dollars, cars and stage wins.",
  "no-live-room": "You have no live race right now.",
  "stage-locked": "Win the stage before this one to unlock it.",
  "run-moved": "This race is now open in another window.",
  "run-not-found": "This race could not be found.",
  "car-not-owned": "Buy that car before driving it.",
  "car-not-found": "That car is not in the garage.",
  "not-available": "Math Race Champions is not available yet.",
  unavailable: "Math Race Champions is having trouble connecting. Trying again…"
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
        headers: { "Content-Type": "application/json", "X-MathNexa-Game": "math-race-champions" },
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

/** A fresh key for one purchase attempt; a retry of the same attempt reuses it. */
export function newPurchaseKey() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, value => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"[value % 64]).join("");
}

export function formatRaceDollars(amount) {
  return `R$ ${Number(amount ?? 0).toLocaleString("en-US")}`;
}
