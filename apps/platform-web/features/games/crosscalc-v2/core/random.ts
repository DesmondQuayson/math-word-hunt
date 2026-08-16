function xmur3(value: string): () => number {
  let hash = 1779033703 ^ value.length;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }
  return () => {
    hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
    return (hash ^= hash >>> 16) >>> 0;
  };
}

export class SeededRandom {
  readonly #seed: string;
  #state: number;

  constructor(seed: string) {
    if (!seed.trim()) throw new Error("Seed must not be empty.");
    this.#seed = seed;
    this.#state = xmur3(seed)();
  }

  get seed(): string {
    return this.#seed;
  }

  next(): number {
    this.#state += 0x6d2b79f5;
    let value = this.#state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  integer(minimum: number, maximum: number): number {
    if (!Number.isSafeInteger(minimum) || !Number.isSafeInteger(maximum) || maximum < minimum) {
      throw new Error("Random integer bounds must be ordered safe integers.");
    }
    return Math.floor(this.next() * (maximum - minimum + 1)) + minimum;
  }

  pick<T>(values: readonly T[]): T {
    if (!values.length) throw new Error("Cannot pick from an empty collection.");
    return values[this.integer(0, values.length - 1)] as T;
  }

  shuffle<T>(values: readonly T[]): T[] {
    const result = [...values];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swap = this.integer(0, index);
      [result[index], result[swap]] = [result[swap] as T, result[index] as T];
    }
    return result;
  }
}

