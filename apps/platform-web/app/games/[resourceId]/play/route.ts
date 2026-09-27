import { NextResponse } from "next/server";

import { hasMathNexaModuleAccess } from "@math-vocabulary-hunt/platform-core";

import { requireGamePlayAccess, requireProductAccess } from "@/lib/access/server";
import { freeGameKeyForSlug } from "@/lib/games/access-policy";
import { loadInternalGameLaunchRecord } from "@/lib/games/catalog";
import { createInternalGameResponse, isInternalGameRegistered } from "@/lib/games/internal-registry";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ resourceId: string }> }) {
  const slug = (await params).resourceId;
  // Access is decided before any catalog read. Games classified
  // "authenticated-free" (lib/games/access-policy.ts) need a signed-in
  // account; every other game keeps the Math Games entitlement rule.
  const freeGameKey = freeGameKeyForSlug(slug);
  const access = freeGameKey ? await requireGamePlayAccess(freeGameKey) : await requireProductAccess("/games");
  const game = await loadInternalGameLaunchRecord(slug);
  if (!game || !isInternalGameRegistered(game.stableKey) || game.status === "draft" || game.status === "archived"
    || (freeGameKey !== null && game.stableKey !== freeGameKey)) {
    return new NextResponse("Not Found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  if (game.status === "maintenance") {
    return NextResponse.redirect(new URL(`/games/${game.slug}/maintenance`, request.url), 303);
  }
  return createInternalGameResponse(game.stableKey, game.version, { mathGamesAccess: hasMathNexaModuleAccess(access.decision, "games") });
}
