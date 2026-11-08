// Polygon Showdown coin rules, timing limits and achievements: the numbers
// the browser shows and the server enforces, kept in one place.
//
// Polygon Coins are a virtual game currency. They are not money, cannot be
// bought, and are never shown as dollars or cents. Tuned with
// scripts/polygon-showdown-economy-simulation.mjs (see docs/polygon-showdown-v1.md).

export const CURRENCY_NAME = "Polygon Coins";
export const CURRENCY_SINGULAR = "Polygon Coin";

/** The combo multiplier stops growing here for coins; the COMBO count itself keeps climbing. */
export const COMBO_CAP = 5;

/** Extra coins for a larger match: 3 shapes +0, 4 shapes +1, 5 or more +2. */
export function sizeBonus(size) {
  if (size >= 5) return 2;
  return size === 4 ? 1 : 0;
}

/**
 * One match's coins, by `chain` (1 for the player's own swap, 2 or more for the
 * links of a cascade) and whether it is the first match of its step.
 *
 * One normal match is one coin. COMBO ×2 pays two, COMBO ×3 pays three. A step
 * that happens to clear several lines at once pays the combo once. The bonus
 * for a larger match rewards the player's own swap, not the luck of a cascade.
 */
export function coinsForMatch(size, chain, firstInStep = true) {
  const combo = firstInStep ? Math.min(chain, COMBO_CAP) : 1;
  return combo + (chain === 1 ? sizeBonus(size) : 0);
}

export function scoreForMatch(size, chain) {
  return size * 10 * Math.min(chain, 8);
}

// ---------------------------------------------------------------- timing
//
// The fastest a client may legally play. A move's result takes time to fall
// into place, so the next move cannot come sooner than this after it; the
// browser waits at least this long too, so an honest player can never trip it.
export const TIMING = Object.freeze({
  MIN_SWAP_MS: 150,
  MIN_STEP_MS: 180,
  /** A move may be stamped at most this far ahead of the server's clock. */
  FUTURE_TOLERANCE_MS: 1_500,
  /** ...and at most this far behind it (no saving up moves to send later). */
  MAX_BACKDATE_MS: 45_000,
  /** How long after the buzzer a move already in flight may still arrive. */
  SHOWDOWN_GRACE_MS: 2_500,
  MAX_BATCH: 40
});

/** How soon after a move with this many cascade steps the next one may start. */
export function minGapAfter(chainSteps) {
  return TIMING.MIN_SWAP_MS + chainSteps * TIMING.MIN_STEP_MS;
}

// ------------------------------------------------------------- permanent coins

/** Solo coins reach the wallet in batches; never more than this is left unbanked for long. */
export const BANK_EVERY_COINS = 25;
export const BANK_EVERY_MS = 30_000;

/** The most one account can bank in a calendar day (UTC). The run itself keeps counting. */
export const DAILY_EARN_CAP = 15_000;

/** A Showdown's coins are worth this much in the permanent wallet. Solo stays the main earner. */
export const SHOWDOWN_REWARD_RATE = 0.5;
/** Most permanent coins a Showdown can pay, per minute of its length. */
export const SHOWDOWN_REWARD_PER_MINUTE = 40;

/** Permanent coins for a signed-in player's validated Showdown coins. */
export function showdownReward(showdownCoins, durationSeconds) {
  if (!Number.isInteger(showdownCoins) || showdownCoins <= 0 || !Number.isInteger(durationSeconds) || durationSeconds <= 0) return 0;
  return Math.min(Math.floor((durationSeconds / 60) * SHOWDOWN_REWARD_PER_MINUTE), Math.floor(showdownCoins * SHOWDOWN_REWARD_RATE));
}

// ------------------------------------------------------------- milestones

/** Coins reached within one Solo run. */
export const RUN_MILESTONES = Object.freeze([25, 50, 100, 250, 500, 1000, 2500, 5000]);

export function milestonesCrossed(before, after) {
  return RUN_MILESTONES.filter((value) => before < value && after >= value);
}

export const ACHIEVEMENTS = Object.freeze([
  Object.freeze({ key: "first-match", title: "First Break", detail: "Make your first match." }),
  Object.freeze({ key: "combo-3", title: "Chain Starter", detail: "Reach COMBO ×3." }),
  Object.freeze({ key: "combo-5", title: "Chain Master", detail: "Reach COMBO ×5." }),
  Object.freeze({ key: "combo-7", title: "Cascade Legend", detail: "Reach COMBO ×7." }),
  Object.freeze({ key: "clear-4", title: "Four in Line", detail: "Clear 4 shapes in one match." }),
  Object.freeze({ key: "clear-5", title: "Big Break", detail: "Clear 5 or more shapes in one match." }),
  Object.freeze({ key: "clear-7", title: "Shape Storm", detail: "Clear 7 or more shapes in one match." }),
  Object.freeze({ key: "matches-100", title: "Hundred Matches", detail: "Make 100 matches." }),
  Object.freeze({ key: "matches-1000", title: "Thousand Matches", detail: "Make 1,000 matches." }),
  Object.freeze({ key: "coins-100", title: "Coin Collector", detail: "Earn 100 Polygon Coins." }),
  Object.freeze({ key: "coins-1000", title: "Coin Keeper", detail: "Earn 1,000 Polygon Coins." }),
  Object.freeze({ key: "coins-10000", title: "Coin Vault", detail: "Earn 10,000 Polygon Coins." }),
  Object.freeze({ key: "first-purchase", title: "First Style", detail: "Buy your first item." }),
  Object.freeze({ key: "first-showdown", title: "Showdown Rookie", detail: "Finish a Showdown." }),
  Object.freeze({ key: "showdown-win", title: "Showdown Champion", detail: "Win a Showdown." })
]);

const ACHIEVEMENT_KEYS = new Set(ACHIEVEMENTS.map((item) => item.key));

export function isAchievementKey(key) {
  return ACHIEVEMENT_KEYS.has(key);
}

/** Achievements the totals have reached. Pure, so a repeat call changes nothing. */
export function achievementsFor(totals) {
  const earned = [];
  const add = (key, condition) => {
    if (condition) earned.push(key);
  };
  add("first-match", totals.matches >= 1);
  add("combo-3", totals.bestCombo >= 3);
  add("combo-5", totals.bestCombo >= 5);
  add("combo-7", totals.bestCombo >= 7);
  add("clear-4", totals.largestClear >= 4);
  add("clear-5", totals.largestClear >= 5);
  add("clear-7", totals.largestClear >= 7);
  add("matches-100", totals.matches >= 100);
  add("matches-1000", totals.matches >= 1000);
  add("coins-100", totals.lifetimeCoins >= 100);
  add("coins-1000", totals.lifetimeCoins >= 1000);
  add("coins-10000", totals.lifetimeCoins >= 10000);
  return earned;
}
