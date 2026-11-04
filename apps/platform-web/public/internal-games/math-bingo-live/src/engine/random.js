// Deterministic pseudo-random source for Math Bingo Live.
//
// The server builds a game (answer pool, question deck, every player's card)
// from one secret per-game seed, so the same seed always reproduces the same
// game. That is what lets the tests audit thousands of games and lets a card
// be dealt again after a reload without storing anything extra. The seed is
// never sent to a browser.

const UINT32 = 0x100000000;

/** Hash any string into a 32-bit unsigned seed (FNV-1a). */
export function hashSeed(text) {
  let hash = 0x811c9dc5;
  const value = String(text);
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32: small, fast and well distributed for shuffles and draws. */
export function createRandom(seed) {
  let state = (typeof seed === "number" ? seed : hashSeed(seed)) >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / UINT32;
  };
  const int = (min, max) => min + Math.floor(next() * (max - min + 1));
  return Object.freeze({
    next,
    /** Integer in [min, max], both inclusive. */
    int,
    pick(list) {
      return list[Math.floor(next() * list.length)];
    },
    /** A shuffled copy (Fisher–Yates); the input is never changed. */
    shuffle(list) {
      const copy = list.slice();
      for (let index = copy.length - 1; index > 0; index -= 1) {
        const other = int(0, index);
        [copy[index], copy[other]] = [copy[other], copy[index]];
      }
      return copy;
    }
  });
}
