import "server-only";

import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";

import type { ExternalGameLaunchRecord } from "@/lib/games/catalog";

export const NUMBER_CROSS_GAME_ID = "number-cross";
export const NUMBER_CROSS_ORIGIN = "https://number-cross.vercel.app";
export const NUMBER_CROSS_LAUNCH_TTL_SECONDS = 120;

const NUMBER_CROSS_ISSUER = "mathnexa";
const NUMBER_CROSS_HOST = "number-cross.vercel.app";

export type NumberCrossLaunchPurpose = "play" | "admin-preview";
export type ExternalGameLaunchAction =
  | "direct"
  | "maintenance"
  | "not-found"
  | "protected-number-cross";

export class ProtectedGameLaunchConfigurationError extends Error {
  constructor() {
    super("Protected game launch is unavailable");
    this.name = "ProtectedGameLaunchConfigurationError";
  }
}

function isNumberCrossIdentity(game: ExternalGameLaunchRecord): boolean {
  return game.stableKey === NUMBER_CROSS_GAME_ID || game.slug === NUMBER_CROSS_GAME_ID;
}

export function isTrustedNumberCrossRecord(game: ExternalGameLaunchRecord): boolean {
  if (
    game.stableKey !== NUMBER_CROSS_GAME_ID ||
    game.slug !== NUMBER_CROSS_GAME_ID ||
    game.launch.type !== "external_https" ||
    game.launch.host !== NUMBER_CROSS_HOST
  ) return false;

  try {
    const destination = new URL(game.launch.url);
    return destination.origin === NUMBER_CROSS_ORIGIN &&
      destination.pathname === "/" &&
      !destination.username &&
      !destination.password &&
      !destination.search &&
      !destination.hash;
  } catch {
    return false;
  }
}

export function externalGameLaunchAction(
  game: ExternalGameLaunchRecord,
  purpose: NumberCrossLaunchPurpose
): ExternalGameLaunchAction {
  if (game.status === "archived") return "not-found";
  if (purpose === "play") {
    if (game.status === "maintenance") return "maintenance";
    if (game.status !== "published") return "not-found";
  }
  if (isNumberCrossIdentity(game)) {
    return isTrustedNumberCrossRecord(game) ? "protected-number-cross" : "not-found";
  }
  return "direct";
}

function launchSecret(value: string | undefined): Uint8Array {
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") < 32) {
    throw new ProtectedGameLaunchConfigurationError();
  }
  return Buffer.from(value, "utf8");
}

export async function createNumberCrossLaunchUrl({
  game,
  purpose,
  secret = process.env.MATHNEXA_GAME_LAUNCH_SECRET,
  now = Math.floor(Date.now() / 1000),
  jti = randomUUID()
}: Readonly<{
  game: ExternalGameLaunchRecord;
  purpose: NumberCrossLaunchPurpose;
  secret?: string;
  now?: number;
  jti?: string;
}>): Promise<URL> {
  const expectedAction = externalGameLaunchAction(game, purpose);
  if (expectedAction !== "protected-number-cross" || !Number.isSafeInteger(now) || jti.length < 8) {
    throw new ProtectedGameLaunchConfigurationError();
  }

  const token = await new SignJWT({ game: NUMBER_CROSS_GAME_ID, purpose })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(NUMBER_CROSS_ISSUER)
    .setAudience(NUMBER_CROSS_GAME_ID)
    .setIssuedAt(now)
    .setExpirationTime(now + NUMBER_CROSS_LAUNCH_TTL_SECONDS)
    .setJti(jti)
    .sign(launchSecret(secret));

  const destination = new URL("/api/launch", game.launch.url);
  destination.searchParams.set("launch", token);
  return destination;
}
