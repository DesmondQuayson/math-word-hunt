// A racer's seat in one Online Race room. The token works for that room and
// nothing else; it is kept for this tab so a refresh comes back to the same car,
// and remembered briefly so the same device can be offered its seat back.

const SEAT_KEY = "mathnexa:math-race-champions:seat";
const RECENT_KEY = "mathnexa:math-race-champions:recent-seat";
const RECENT_MAX_AGE_MS = 4 * 60 * 60 * 1000;

export function readSeat() {
  try {
    const value = JSON.parse(sessionStorage.getItem(SEAT_KEY) ?? "null");
    return value && typeof value.token === "string" && typeof value.code === "string" ? value : null;
  } catch {
    return null;
  }
}

export function writeSeat(seat) {
  try {
    sessionStorage.setItem(SEAT_KEY, JSON.stringify(seat));
    localStorage.setItem(RECENT_KEY, JSON.stringify({ token: seat.token, code: seat.code, name: seat.name ?? "", at: Date.now() }));
  } catch {
    /* A refresh will then ask for the name again. */
  }
}

export function clearSeat() {
  try {
    sessionStorage.removeItem(SEAT_KEY);
    localStorage.removeItem(RECENT_KEY);
  } catch {
    /* nothing to clear */
  }
}

/** A seat this device held recently in room `code`, to be offered back, never used silently. */
export function recentSeat(code) {
  try {
    const value = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "null");
    if (!value || value.code !== code || typeof value.token !== "string" || Date.now() - Number(value.at) > RECENT_MAX_AGE_MS) return null;
    return value;
  } catch {
    return null;
  }
}
