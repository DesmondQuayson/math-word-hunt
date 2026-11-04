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

export function isSameOriginGameRequest(request: Request): boolean {
  if (request.headers.get("x-mathnexa-game") !== "math-bingo-live") return false;
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return false;
  return site === "same-origin" || isSameOriginAdminRequest(request.headers);
}

/** The parsed JSON object body, or a refusal to send instead. */
export async function readJsonBody(request: Request, maxBytes: number): Promise<Json | Response> {
  if (!isSameOriginGameRequest(request)) return refused("forbidden", 403);
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

export function isInteger(value: unknown, min: number, max: number): value is number {
  return Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
}
