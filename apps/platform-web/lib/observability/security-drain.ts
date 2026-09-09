import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { parseEmittedLine, type RawEmittedEvent } from "./security-pipeline";

/**
 * Vercel log-drain delivery, treated as an untrusted network input.
 *
 * A configurable log drain signs every delivery with `x-vercel-signature`: the
 * hex HMAC-SHA1 of the raw request body under the drain's secret. Nothing is
 * parsed until that signature has been verified in constant time, and a
 * deployment with no secret configured refuses every delivery rather than
 * accepting an unsigned one. Forged "security events" would poison the very
 * store an incident responder relies on, so this boundary fails closed
 * everywhere, not only in production.
 */
export const DRAIN_SIGNATURE_HEADER = "x-vercel-signature";
export const DRAIN_VERIFY_HEADER = "x-vercel-verify";
export const MAXIMUM_DRAIN_BODY_BYTES = 4 * 1024 * 1024;
export const MAXIMUM_DRAIN_ENTRIES = 5_000;
const MINIMUM_DRAIN_SECRET_LENGTH = 32;

export function drainSecretConfigured(source: Readonly<Record<string, string | undefined>> = process.env): string | null {
  const value = source.MVH_SECURITY_DRAIN_SECRET?.trim() ?? "";
  return value.length >= MINIMUM_DRAIN_SECRET_LENGTH && /^[\x21-\x7e]+$/.test(value) ? value : null;
}

export function drainSignature(rawBody: string | Uint8Array, secret: string): string {
  return createHmac("sha1", secret).update(rawBody).digest("hex");
}

export function verifyDrainSignature(rawBody: string | Uint8Array, presented: string | null, secret: string): boolean {
  if (!presented || !/^[0-9a-f]{40}$/i.test(presented)) return false;
  const expected = Buffer.from(drainSignature(rawBody, secret), "hex");
  const supplied = Buffer.from(presented.toLowerCase(), "hex");
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export type DrainEntry = Readonly<{
  message: string;
  /** Platform capture time, when present and plausible. */
  timestamp: Date | undefined;
  source: string;
}>;

function entryFrom(value: unknown): DrainEntry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.message !== "string") return null;
  const stamp = typeof record.timestamp === "number" && Number.isFinite(record.timestamp) ? new Date(record.timestamp) : undefined;
  return {
    message: record.message,
    timestamp: stamp && Number.isFinite(stamp.getTime()) ? stamp : undefined,
    source: typeof record.source === "string" ? record.source.slice(0, 32) : "unknown"
  };
}

/**
 * Accepts both delivery formats a drain can be configured with: a JSON array
 * (`json`) or one JSON object per line (`ndjson`). Anything else is an empty
 * delivery, never an error that could stall the drain into retrying forever.
 */
export function parseDrainPayload(rawBody: string): readonly DrainEntry[] {
  const trimmed = rawBody.trim();
  if (!trimmed) return [];
  const entries: DrainEntry[] = [];
  const push = (value: unknown) => {
    const entry = entryFrom(value);
    if (entry && entries.length < MAXIMUM_DRAIN_ENTRIES) entries.push(entry);
  };
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) for (const value of parsed) push(value);
      return entries;
    } catch {
      return [];
    }
  }
  for (const line of trimmed.split("\n")) {
    try {
      push(JSON.parse(line));
    } catch {
      // Not a JSON line; skip it.
    }
  }
  return entries;
}

export type DrainedEvent = Readonly<{ raw: RawEmittedEvent; occurredAt: Date | undefined }>;

/**
 * Picks the structured security lines out of a delivery. A function log
 * message is the raw stdout line, so the emitter's JSON is the whole message;
 * everything that does not parse as an emitted event is ignored here and the
 * registry check in normalization ignores whatever is not a security code.
 */
export function extractSecurityLines(entries: readonly DrainEntry[]): readonly DrainedEvent[] {
  const drained: DrainedEvent[] = [];
  for (const entry of entries) {
    const raw = parseEmittedLine(entry.message);
    if (raw) drained.push({ raw, occurredAt: entry.timestamp });
  }
  return drained;
}
