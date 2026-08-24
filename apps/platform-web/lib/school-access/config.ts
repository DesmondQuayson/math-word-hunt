import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

export type SchoolAccessConfiguration = Readonly<{
  authorizedCode: string;
  sessionSecret: string;
}>;

type Source = Readonly<Record<string, string | undefined>>;

export function normalizeAuthorizedCode(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

export function getSchoolAccessConfiguration(source: Source = process.env): SchoolAccessConfiguration | null {
  const authorizedCode = normalizeAuthorizedCode(source.MATHNEXA_SCHOOL_ACCESS_CODE);
  const sessionSecret = source.MATHNEXA_SCHOOL_ACCESS_SESSION_SECRET?.trim() ?? "";
  if (!/^[A-Z0-9][A-Z0-9_-]{3,31}$/.test(authorizedCode)) return null;
  if (!/^[\x21-\x7e]{32,256}$/.test(sessionSecret)) return null;
  return Object.freeze({ authorizedCode, sessionSecret });
}

export function authorizedCodeMatches(value: unknown, configuration: SchoolAccessConfiguration): boolean {
  const candidate = normalizeAuthorizedCode(value);
  if (candidate.length === 0 || candidate.length > 128) return false;
  const digest = (text: string) => createHmac("sha256", configuration.sessionSecret).update(text).digest();
  return timingSafeEqual(digest(candidate), digest(configuration.authorizedCode));
}
