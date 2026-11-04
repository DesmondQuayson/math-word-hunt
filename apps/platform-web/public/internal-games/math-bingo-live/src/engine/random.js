// Deterministic pseudo-random source for Math Bingo Live (not a CSPRNG; its
// strength is the 128-bit secret seed and 128-bit state, see createRandom).
//
// The server builds a game (answer pool, question deck, every player's card)
// from one secret per-game seed, so the same seed always reproduces the same
// game. That is what lets the tests audit thousands of games and lets a card
// be dealt again after a reload without storing anything extra. The seed is
// never sent to a browser.

const UINT32 = 0x100000000;

/** Hash any string into a 32-bit unsigned value (FNV-1a). */
export function hashSeed(text) {
  let hash = 0x811c9dc5;
  const value = String(text);
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Hash a string into four 32-bit words (cyrb128): a 128-bit generator state. */
export function hash128(text) {
  const value = String(text);
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    h1 = h2 ^ Math.imul(h1 ^ code, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ code, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ code, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ code, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/**
 * sfc32 over a 128-bit state hashed from the seed text. The server seeds each
 * game with 128 secret random bits, so the deck cannot be recovered by trying
 * seeds: the state space is 2^128, not the 2^32 of a single-word generator
 * (a student knows the settings, the pool and the questions asked so far).
 */
export function createRandom(seed) {
  let [a, b, c, d] = typeof seed === "number" ? [seed >>> 0, 0x9e3779b9, 0x243f6a88, 0xb7e15162] : hash128(seed);
  const step = () => {
    const t = (((a + b) >>> 0) + d) >>> 0;
    d = (d + 1) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) >>> 0;
    return t >>> 0;
  };
  for (let warm = 0; warm < 15; warm += 1) step();
  const next = () => step() / UINT32;
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
