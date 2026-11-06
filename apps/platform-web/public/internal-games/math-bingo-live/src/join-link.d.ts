export type LocationLike = Readonly<{ host?: string; origin?: string }>;

export const PRODUCTION_ORIGIN: string;
export function joinOrigin(location: LocationLike): string | null;
export function joinLink(code: string, location: LocationLike): string | null;
export function joinHostLabel(location: LocationLike): string;
export function codeFromSearch(search: string): string;
