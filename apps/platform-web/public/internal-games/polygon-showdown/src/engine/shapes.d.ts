export type ShapeGeometry =
  | Readonly<{ type: "circle"; cx: number; cy: number; r: number }>
  | Readonly<{ type: "rect"; x: number; y: number; width: number; height: number; rx: number }>
  | Readonly<{ type: "polygon"; points: ReadonlyArray<readonly [number, number]> }>;
export type ShapeEntry = Readonly<{ key: string; label: string; spoken: string; sides: number; geometry: ShapeGeometry; colors: Readonly<{ face: string; body: string; rim: string }> }>;
export const SHAPES: readonly ShapeEntry[];
export const SHAPE_INDEX: Readonly<Record<string, number>>;
export const ACTIVE_SHAPES: readonly number[];
export const PENTAGON: number;
export const ADVANCED_SHAPES: readonly number[];
export function shapeLabel(kind: number): string;
export function aspectRatio(geometry: ShapeGeometry): number;
export function classifyGeometry(geometry: ShapeGeometry): string;
