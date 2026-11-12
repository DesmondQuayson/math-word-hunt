// Deterministic pseudo-random source for Math Race Champions.
//
// The same seed always reproduces the same sequence. The audits rely on it,
// and so does the server: Computer Race and Online Race regenerate a racer's
// question from a secret seed instead of trusting what the browser says the
// question (or its answer) was. Seeds are never shown to players.

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

/** mulberry32: small, fast and good enough for question variety. */
export function createRandom(seed) {
  let state = (typeof seed === "number" ? seed : hashSeed(seed)) >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / UINT32;
  };
  return Object.freeze({
    next,
    /** Integer in [min, max], both inclusive. */
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    pick(list) {
      return list[Math.floor(next() * list.length)];
    },
    /** A shuffled copy (Fisher-Yates). */
    shuffle(list) {
      const copy = [...list];
      for (let index = copy.length - 1; index > 0; index -= 1) {
        const other = Math.floor(next() * (index + 1));
        [copy[index], copy[other]] = [copy[other], copy[index]];
      }
      return copy;
    }
  });
}

/** A fresh non-reproducible seed for normal play. */
export function freshSeed() {
  const cryptoSource = globalThis.crypto;
  if (cryptoSource && typeof cryptoSource.getRandomValues === "function") {
    const buffer = new Uint32Array(1);
    cryptoSource.getRandomValues(buffer);
    return buffer[0];
  }
  return Math.floor(Math.random() * UINT32) >>> 0;
}
