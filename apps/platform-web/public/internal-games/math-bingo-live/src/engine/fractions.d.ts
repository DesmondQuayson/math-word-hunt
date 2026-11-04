export type Fraction = Readonly<{ n: number; d: number }>;
export type FractionShape = "circle" | "bar" | "rect" | "grid";
export type FractionModel = Fraction & Readonly<{ shape: FractionShape }>;

export type ModelPart =
  | Readonly<{ kind: "sector"; path: string; start: number; end: number; cx: number; cy: number; radius: number; shaded: boolean }>
  | Readonly<{ kind: "rect"; x: number; y: number; width: number; height: number; shaded: boolean }>;

export type ModelGeometry = Readonly<{ shape: FractionShape; n: number; d: number; parts: readonly ModelPart[] }>;

export const SHAPES: readonly FractionShape[];
export const GRID_LAYOUTS: Readonly<Record<number, readonly [number, number]>>;
export const SHAPE_MAX_PARTS: Readonly<Record<FractionShape, number>>;

export function gcd(a: number, b: number): number;
export function isFraction(value: unknown): value is Fraction;
export function reduceFraction(value: Fraction): Fraction;
export function sameFraction(a: Fraction, b: Fraction): boolean;
export function equalValue(a: Fraction, b: Fraction): boolean;
export function properFractions(denominators: readonly number[]): Fraction[];
export function equivalentsOf(value: Fraction, denominators: readonly number[]): Fraction[];
export function allowedShapes(denominator: number): readonly FractionShape[];
export function fractionText(value: Fraction): string;
export function fractionSpoken(value: Fraction): string;
export function describeModel(value: Fraction): string;
export function modelGeometry(model: FractionModel): ModelGeometry;
export function partAreas(geometry: ModelGeometry): number[];
