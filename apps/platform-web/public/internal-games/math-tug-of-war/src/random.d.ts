export type TugRandom = Readonly<{
  next(): number;
  int(min: number, max: number): number;
  pick<T>(list: readonly T[]): T;
}>;

export function hashSeed(text: string): number;
export function createRandom(seed: number | string): TugRandom;
export function freshSeed(): number;
