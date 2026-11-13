export const LANES: readonly number[];
export const CENTRE: number;
export const CAR_LENGTH: number;
export const CAR_WIDTH: number;
export const SAFE_LONG: number;
export const SAFE_LAT: number;
export const LANE_SPEED: number;
export const CATCH_MAX: number;
export const CENTRE_CLEAR_M: number;

export type TrafficRival = { id: string | number; distanceM: number; speed: number; finished?: boolean };

export type DrawnCar<Rival extends TrafficRival = TrafficRival> = {
  id: Rival["id"];
  rival: Rival;
  distanceM: number;
  lane: number;
  targetLane: number;
  standing: boolean;
  tucking: boolean;
  onScreen?: boolean;
  lateralSpeed: number;
  speedMs: number;
  gapM: number;
  trueGapM: number;
  held: boolean;
};

export type TrafficFrame<Rival extends TrafficRival = TrafficRival> = {
  cars: DrawnCar<Rival>[];
  camera: { pull: number; side: number };
  behind: { id: Rival["id"]; gapM: number; side: number; closing: number } | null;
};

export function createTraffic(): {
  step<Rival extends TrafficRival>(dtSeconds: number, player: { distanceM: number; speed: number; finished?: boolean }, rivals: readonly Rival[], limit?: number): TrafficFrame<Rival>;
  reset(): void;
};

export function overlapping(a: { distanceM: number; lane: number }, b: { distanceM: number; lane: number }): boolean;
