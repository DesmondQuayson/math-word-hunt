export type CircuitPoint = { x: number; y: number; z: number; heading: number };

export type Circuit = Readonly<{
  length: number;
  lengthKm: number;
  count: number;
  aspect: number;
  at(distance: number): CircuitPoint;
  mapPoint(progress: number, width: number, height: number, margin?: number): { x: number; y: number };
  mapPath(width: number, height: number, margin?: number, samples?: number): string;
}>;

export const STEP_M: number;
export const ONLINE_CIRCUIT_SEED: string;
export function buildCircuit(lengthKm: number, seed: string | number): Circuit;
export function stageCircuitSeed(stage: number): string;
