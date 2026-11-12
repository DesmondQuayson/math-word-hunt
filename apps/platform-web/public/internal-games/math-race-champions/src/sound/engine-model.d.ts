export type EngineProfile = Readonly<{
  key: string;
  pulses: number;
  idle: number;
  redline: number;
  gears: number;
  response: number;
  shiftMs: number;
  harmonics: readonly number[];
  tail: number;
  body: number;
  sub: number;
  subRatio: number;
  grit: number;
  dark: number;
  bright: number;
  formant: number;
  intake: number;
  turbo: number;
  crackle: number;
  trim: number;
}>;

export type EngineFrame = Readonly<{
  rpm: number;
  rpmShare: number;
  gear: number;
  throttle: number;
  load: number;
  turbo: number;
  speed: number;
  speedShare: number;
  firing: number;
  climbing: boolean;
  lifted: boolean;
  shifted: -1 | 0 | 1;
  blowOff: boolean;
  crackle: boolean;
}>;

export type EngineModel = Readonly<{
  profile: EngineProfile;
  boost(): void;
  lift(): void;
  step(seconds: number, raceSpeed: number, topSpeed: number): EngineFrame;
}>;

export type RivalHeard = Readonly<{ id: string; gap: number; level: number; pan: number; speed: number; doppler: number }>;

export const ENGINE_PROFILES: Readonly<Record<string, EngineProfile>>;
export const DEFAULT_ENGINE_PROFILE: string;
export const SHIFT_POINT: number;
export const CRUISE_THROTTLE: number;
export const RIVAL_EARSHOT_M: number;
export const RIVAL_VOICES: number;
export const RIVAL_MAX_LEVEL: number;
export const RIVAL_MAX_PAN: number;

export function engineProfile(carKey: string): EngineProfile;
export function gearTops(profile: EngineProfile): number[];
export function rpmInGear(profile: EngineProfile, speedShare: number, gear: number): number;
export function firingFrequency(profile: EngineProfile, rpm: number): number;
export function createEngineModel(profile: EngineProfile | string): EngineModel;
export function rivalMix(
  player: Readonly<{ distanceM: number; speed: number }>,
  rivals: readonly Readonly<{ id: string; distanceM: number; speed: number; finished?: boolean; side?: number }>[]
): RivalHeard[];
