import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

import { getAppBaseUrl } from "@/lib/auth/safe-redirect";

import { getSchoolAccessConfiguration } from "./config";

export const SCHOOL_ACCESS_COOKIE = "mathnexa-school-access";
export const SCHOOL_ACCESS_DURATION_SECONDS = 12 * 60 * 60;

export type SchoolAccessSession = Readonly<{
  id: string;
  issuedAt: number;
  expiresAt: number;
}>;

type SessionPayload = Readonly<{ v: 1; sid: string; iat: number; exp: number }>;

function sign(value: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(value).digest();
}

export function createSchoolAccessToken(
  secret: string,
  now = new Date(),
  sessionId = randomUUID()
): string | null {
  const issuedAt = Math.floor(now.getTime() / 1000);
  if (!Number.isSafeInteger(issuedAt) || !/^[0-9a-f-]{36}$/i.test(sessionId)) return null;
  const payload: SessionPayload = {
    v: 1,
    sid: sessionId,
    iat: issuedAt,
    exp: issuedAt + SCHOOL_ACCESS_DURATION_SECONDS
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${sign(encoded, secret).toString("base64url")}`;
}

export function verifySchoolAccessToken(
  value: string,
  secret: string,
  now = new Date()
): SchoolAccessSession | null {
  if (value.length > 700 || !Number.isFinite(now.getTime())) return null;
  const parts = value.split(".");
  if (parts.length !== 2) return null;
  let supplied: Buffer;
  let parsed: unknown;
  try {
    supplied = Buffer.from(parts[1]!, "base64url");
    parsed = JSON.parse(Buffer.from(parts[0]!, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const expected = sign(parts[0]!, secret);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const item = parsed as Record<string, unknown>;
  if (Object.keys(item).sort().join("|") !== "exp|iat|sid|v" || item.v !== 1 ||
    typeof item.sid !== "string" || !/^[0-9a-f-]{36}$/i.test(item.sid) ||
    !Number.isSafeInteger(item.iat) || !Number.isSafeInteger(item.exp)) return null;
  const issuedAt = item.iat as number;
  const expiresAt = item.exp as number;
  const current = Math.floor(now.getTime() / 1000);
  if (expiresAt - issuedAt !== SCHOOL_ACCESS_DURATION_SECONDS || issuedAt > current + 5 || expiresAt <= current) return null;
  return Object.freeze({ id: item.sid, issuedAt, expiresAt });
}

export function schoolAccessCookieOptions(maxAge = SCHOOL_ACCESS_DURATION_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" || getAppBaseUrl().startsWith("https://"),
    sameSite: "lax" as const,
    path: "/",
    maxAge
  };
}

export async function startSchoolAccessSession(now = new Date()): Promise<SchoolAccessSession | null> {
  const configuration = getSchoolAccessConfiguration();
  if (!configuration) return null;
  const id = randomUUID();
  const token = createSchoolAccessToken(configuration.sessionSecret, now, id);
  if (!token) return null;
  const cookieStore = await cookies();
  cookieStore.set(SCHOOL_ACCESS_COOKIE, token, schoolAccessCookieOptions());
  return Object.freeze({
    id,
    issuedAt: Math.floor(now.getTime() / 1000),
    expiresAt: Math.floor(now.getTime() / 1000) + SCHOOL_ACCESS_DURATION_SECONDS
  });
}

export async function resolveSchoolAccessSession(now = new Date()): Promise<SchoolAccessSession | null> {
  const configuration = getSchoolAccessConfiguration();
  if (!configuration) return null;
  const value = (await cookies()).get(SCHOOL_ACCESS_COOKIE)?.value;
  return value ? verifySchoolAccessToken(value, configuration.sessionSecret, now) : null;
}

export async function clearSchoolAccessSession(): Promise<void> {
  (await cookies()).delete(SCHOOL_ACCESS_COOKIE);
}
