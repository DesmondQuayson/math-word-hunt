import {
  DRAIN_SIGNATURE_HEADER,
  DRAIN_VERIFY_HEADER,
  MAXIMUM_DRAIN_BODY_BYTES,
  drainSecretConfigured,
  extractSecurityLines,
  parseDrainPayload,
  verifyDrainSignature
} from "@/lib/observability/security-drain";
import { ingestSecurityEvents } from "@/lib/observability/security-sink";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } as const;
const VERIFY_TOKEN_SHAPE = /^[A-Za-z0-9_-]{1,200}$/;

function notFound(): Response {
  return Response.json({ error: "not-found" }, { status: 404, headers: NO_STORE });
}

/**
 * Endpoint-ownership verification. When a log drain is created, the platform
 * calls the endpoint with a token and expects it echoed back. The token is
 * the caller's own header value, reflected as plain text; nothing else.
 */
function verificationEcho(request: Request): Response | null {
  const token = request.headers.get(DRAIN_VERIFY_HEADER);
  if (!token || !VERIFY_TOKEN_SHAPE.test(token)) return null;
  return new Response(token, {
    status: 200,
    headers: { ...NO_STORE, "Content-Type": "text/plain; charset=utf-8", [DRAIN_VERIFY_HEADER]: token }
  });
}

async function readBoundedBody(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAXIMUM_DRAIN_BODY_BYTES) return null;
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAXIMUM_DRAIN_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Vercel log-drain receiver.
 *
 * Fails closed in every environment: no configured drain secret means the
 * route does not exist, and a delivery whose signature does not verify is
 * refused before its body is parsed. Accepted deliveries are filtered down to
 * the structured security lines, normalized and redacted again, and stored
 * idempotently — a redelivered batch cannot double-count.
 */
export async function POST(request: Request) {
  const secret = drainSecretConfigured();
  if (!secret) return notFound();
  const echo = verificationEcho(request);
  if (echo) return echo;
  const body = await readBoundedBody(request);
  if (body === null) return Response.json({ error: "payload-too-large" }, { status: 413, headers: NO_STORE });
  if (!verifyDrainSignature(body, request.headers.get(DRAIN_SIGNATURE_HEADER), secret)) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }
  const lines = extractSecurityLines(parseDrainPayload(body));
  const outcome = await ingestSecurityEvents(
    lines.map((line) => ({ raw: line.raw, occurredAt: line.occurredAt })),
    { ingestSource: "log-drain" }
  );
  // A store failure answers 503 so the platform retries the delivery; the
  // event ids make that retry safe.
  return Response.json(
    { received: outcome.received, normalized: outcome.normalized, stored: outcome.stored, alerts: outcome.alerts.length, failure: outcome.failure },
    { status: outcome.failure ? 503 : 200, headers: NO_STORE }
  );
}

export function GET(request: Request) {
  if (!drainSecretConfigured()) return notFound();
  return verificationEcho(request) ?? Response.json({ error: "method-not-allowed" }, { status: 405, headers: { ...NO_STORE, Allow: "POST" } });
}
