import "server-only";

import { renderNumberCrossDocument } from "@/features/games/number-cross/document";
import { renderNumberLogicDocument } from "@/features/games/number-logic/document";

export type InternalGameRegistration = Readonly<{
  stableKey: string;
  route: `/games/${string}/play`;
  assetBase: `/internal-games/${string}/`;
  connectSource: "'none'" | "'self'";
  renderDocument: () => string;
}>;

const INTERNAL_GAMES = Object.freeze({
  "number-cross": Object.freeze({
    stableKey: "number-cross",
    route: "/games/number-cross/play",
    assetBase: "/internal-games/number-cross/",
    connectSource: "'none'",
    renderDocument: renderNumberCrossDocument
  }),
  "number-logic": Object.freeze({
    stableKey: "number-logic",
    route: "/games/number-logic/play",
    assetBase: "/internal-games/number-logic/",
    connectSource: "'self'",
    renderDocument: renderNumberLogicDocument
  })
} satisfies Record<string, InternalGameRegistration>);

export function internalGameKeys(): readonly string[] {
  return Object.freeze(Object.keys(INTERNAL_GAMES));
}

export function getInternalGameRegistration(stableKey: string): InternalGameRegistration | null {
  return Object.prototype.hasOwnProperty.call(INTERNAL_GAMES, stableKey)
    ? INTERNAL_GAMES[stableKey as keyof typeof INTERNAL_GAMES]
    : null;
}

export function isInternalGameRegistered(stableKey: string): boolean {
  return getInternalGameRegistration(stableKey) !== null;
}

const INTERNAL_GAME_BASE_HEADERS = Object.freeze({
  "Cache-Control": "private, no-store, max-age=0",
  "Content-Type": "text/html; charset=utf-8",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), clipboard-read=(), clipboard-write=(), fullscreen=(self)",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-Robots-Tag": "noindex, nofollow"
});

function internalGameHeaders(registration: InternalGameRegistration): Readonly<Record<string, string>> {
  return Object.freeze({
    ...INTERNAL_GAME_BASE_HEADERS,
    "Content-Security-Policy": [
      "default-src 'none'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "media-src 'self' blob:",
      "font-src 'self'",
      `connect-src ${registration.connectSource}`,
      "frame-src 'none'",
      "child-src 'none'",
      "worker-src 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'none'",
      "frame-ancestors 'none'",
      "manifest-src 'none'"
    ].join("; ")
  });
}

export function createInternalGameResponse(stableKey: string): Response {
  const registration = getInternalGameRegistration(stableKey);
  if (!registration) return new Response("Not Found", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(registration.renderDocument(), { status: 200, headers: internalGameHeaders(registration) });
}
