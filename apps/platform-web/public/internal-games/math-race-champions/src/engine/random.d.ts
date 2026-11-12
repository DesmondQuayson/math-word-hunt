export type RaceRandom = Readonly<{
  next(): number;
  int(min: number, max: number): number;
  pick<T>(list: readonly T[]): T;
  shuffle<T>(list: readonly T[]): T[];
}>;

export function hashSeed(text: string | number): number;
export function createRandom(seed: number | string): RaceRandom;
export function freshSeed(): number;
