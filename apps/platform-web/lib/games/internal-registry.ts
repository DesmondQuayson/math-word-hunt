import "server-only";

import { renderCrossCalcDocument } from "@/features/games/crosscalc/document";
import { renderCrossCalcV2Document, renderCrossCalcV2PreviewDocument } from "@/features/games/crosscalc-v2/document";
import { renderMathBingoLiveHostDocument } from "@/features/games/math-bingo-live/document";
import { renderMathTugOfWarDocument } from "@/features/games/math-tug-of-war/document";
import { renderNumberCrossDocument } from "@/features/games/number-cross/document";
import { renderNumberLogicDocument } from "@/features/games/number-logic/document";
import { renderPolygonShowdownDocument } from "@/features/games/polygon-showdown/document";

/** Per-visitor facts a game document may use (never secrets, never identity). */
export type InternalGameDocumentOptions = Readonly<{
  /** The visitor may open the Math Games shelf (MathNexa all-access). */
  mathGamesAccess?: boolean;
}>;

export type InternalGameRegistration = Readonly<{
  stableKey: string;
  /** Where the catalog opens the game: a /play document, or a live game's /host screen. */
  route: `/games/${string}/play` | `/games/${string}/host`;
  assetBase: `/internal-games/${string}/`;
  connectSource: "'none'" | "'self'";
  renderDocument: (options?: InternalGameDocumentOptions) => string;
}>;

const INTERNAL_GAMES = Object.freeze({
  "crosscalc": Object.freeze({
    stableKey: "crosscalc",
    route: "/games/crosscalc/play",
    assetBase: "/internal-games/crosscalc/",
    connectSource: "'self'",
    renderDocument: renderCrossCalcDocument
  }),
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
  }),
  // Online Match talks to the same-origin /api/games/math-tug-of-war/online.
  "math-tug-of-war": Object.freeze({
    stableKey: "math-tug-of-war",
    route: "/games/math-tug-of-war/play",
    assetBase: "/internal-games/math-tug-of-war/",
    connectSource: "'self'",
    renderDocument: renderMathTugOfWarDocument
  }),
  // A live classroom game: the catalog opens the teacher's host screen, whose
  // route (app/games/math-bingo-live/host) applies the account and catalog
  // availability rules. Students never use the catalog; they join at /join.
  "math-bingo-live": Object.freeze({
    stableKey: "math-bingo-live",
    route: "/games/math-bingo-live/host",
    assetBase: "/internal-games/math-bingo-live/",
    connectSource: "'self'",
    renderDocument: renderMathBingoLiveHostDocument
  }),
  // Solo for signed-in accounts, and a live Showdown whose creator plays from
  // the same screen; guests join at /join with a code and a display name.
  "polygon-showdown": Object.freeze({
    stableKey: "polygon-showdown",
    route: "/games/polygon-showdown/play",
    assetBase: "/internal-games/polygon-showdown/",
    connectSource: "'self'",
    renderDocument: renderPolygonShowdownDocument
  })
} satisfies Record<string, InternalGameRegistration>);

const CROSSCALC_V2_PREVIEW = Object.freeze({
  connectSource: "'self'" as const,
  renderDocument: renderCrossCalcV2PreviewDocument
});

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

function internalGameHeaders(registration: Pick<InternalGameRegistration, "connectSource">): Readonly<Record<string, string>> {
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

/**
 * A same-origin game document under the internal-game headers (strict CSP,
 * no framing, no caching, noindex). For game documents that are not a
 * catalog /play route, such as the Math Bingo Live host and join pages.
 */
export function createInternalDocumentResponse(html: string, connectSource: InternalGameRegistration["connectSource"]): Response {
  return new Response(html, { status: 200, headers: internalGameHeaders({ connectSource }) });
}

export function createInternalGameResponse(stableKey: string, version?: string, options?: InternalGameDocumentOptions): Response {
  const registration = getInternalGameRegistration(stableKey);
  if (!registration) return new Response("Not Found", { status: 404, headers: { "Cache-Control": "no-store" } });
  if (stableKey === "crosscalc" && version !== undefined && !["0.1.0", "0.2.0"].includes(version)) {
    return new Response("Not Found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  if (stableKey === "crosscalc" && version === "0.2.0") {
    return new Response(renderCrossCalcV2Document(), { status: 200, headers: internalGameHeaders(CROSSCALC_V2_PREVIEW) });
  }
  return new Response(registration.renderDocument(options), { status: 200, headers: internalGameHeaders(registration) });
}

export function createCrossCalcV2PreviewResponse(isPublished: boolean | null = null): Response {
  return new Response(renderCrossCalcV2PreviewDocument(isPublished), {
    status: 200,
    headers: internalGameHeaders(CROSSCALC_V2_PREVIEW)
  });
}
