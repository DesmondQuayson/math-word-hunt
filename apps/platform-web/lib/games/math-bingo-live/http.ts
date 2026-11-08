import "server-only";

import { isSameOriginAdminRequest } from "@/lib/admin/security";

// Shared request discipline for the two Math Bingo Live endpoints: JSON
// only, small bodies, same-origin only (the game documents send a custom
// header plus Fetch Metadata, which a cross-site form or image cannot), and
// never cached or indexed.

export const NO_STORE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } as const;

export type Json = Record<string, unknown>;

export function reply(body: Json, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

export function refused(error: string, status: number): Response {
  return reply({ error }, status);
}

export function isSameOriginGameRequest(request: Request, game = "math-bingo-live"): boolean {
  if (request.headers.get("x-mathnexa-game") !== game) return false;
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return false;
  return site === "same-origin" || isSameOriginAdminRequest(request.headers);
}

/** The parsed JSON object body, or a refusal to send instead. */
export async function readJsonBody(request: Request, maxBytes: number, game = "math-bingo-live"): Promise<Json | Response> {
  if (!isSameOriginGameRequest(request, game)) return refused("forbidden", 403);
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return refused("unsupported-media-type", 415);
  const text = await request.text();
  if (text.length > maxBytes) return refused("payload-too-large", 413);
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return refused("invalid-request", 400);
    return parsed as Json;
  } catch {
    return refused("invalid-request", 400);
  }
}

/**
 * Where a request's time went, returned as a Server-Timing header (durations
 * only, no data): database calls, the host's sign-in check, and the whole
 * handler. Lets a load test tell the database apart from the platform.
 */
export type RequestTiming = { db: number; calls: number; access: number; startedAt: number };

export function startTiming(): RequestTiming {
  return { db: 0, calls: 0, access: 0, startedAt: performance.now() };
}

export async function timed<T>(timing: RequestTiming, key: "db" | "access", work: () => PromiseLike<T>): Promise<T> {
  const started = performance.now();
  try {
    return await work();
  } finally {
    timing[key] += performance.now() - started;
    if (key === "db") timing.calls += 1;
  }
}

export function withServerTiming(response: Response, timing: RequestTiming): Response {
  const entries = [`db;dur=${timing.db.toFixed(1)};desc="${timing.calls}"`, `app;dur=${(performance.now() - timing.startedAt).toFixed(1)}`];
  if (timing.access > 0) entries.splice(1, 0, `access;dur=${timing.access.toFixed(1)}`);
  try {
    response.headers.set("Server-Timing", entries.join(", "));
  } catch {
    // An immutable response (none today) simply goes without the header.
  }
  return response;
}

export function isInteger(value: unknown, min: number, max: number): value is number {
  return Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
}
