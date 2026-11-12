// What the signed-in account has: Race Dollars, cars, stage wins, achievements.
// Always read from the server; this is only a short-lived copy for drawing.

import { accountRequest } from "./api.js";

const PRACTICE_KEY = "mathnexa:math-race-champions:practice-unlocked";

let cached = null;

/** The account's progress, or `{ guest: true }` for a school session. */
export async function loadAccount({ fresh = false } = {}) {
  if (!cached || fresh) cached = await accountRequest("bootstrap");
  return cached;
}

export function forgetAccount() {
  cached = null;
}

/** Fold a server reply's new balance / unlocks / ownership into the copy. */
export function patchAccount(fields) {
  if (cached && !cached.guest) cached = { ...cached, ...fields };
  return cached;
}

/** A school session has no account: stage unlocks last for this tab only. */
export function practiceUnlocked() {
  try {
    const value = Number(sessionStorage.getItem(PRACTICE_KEY) ?? "1");
    return Number.isInteger(value) && value >= 1 && value <= 10 ? value : 1;
  } catch {
    return 1;
  }
}

export function unlockPractice(stage) {
  try {
    sessionStorage.setItem(PRACTICE_KEY, String(Math.min(10, Math.max(practiceUnlocked(), stage))));
  } catch {
    /* The next stage simply stays locked in this tab. */
  }
}
