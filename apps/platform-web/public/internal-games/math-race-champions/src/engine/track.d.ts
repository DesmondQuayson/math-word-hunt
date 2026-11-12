export type TrackStation = Readonly<{
  position: number;
  kind: "start" | "space" | "finish";
  number: number | null;
  x: number;
  y: number;
}>;

export type Track = Readonly<{
  width: number;
  height: number;
  spaces: number;
  rows: number;
  gap: number;
  tile: number;
  spacing: number;
  length: number;
  stations: readonly TrackStation[];
  path: string;
  pointAt(position: number): { x: number; y: number; heading: number };
}>;

export const TRACK_SPACES: number;
export const PRACTICE_TRACK_SPACES: number;
export const TRACK_LENGTHS: readonly number[];
export function buildTrack(box: Readonly<{ width: number; height: number; spaces?: number }>): Track;
