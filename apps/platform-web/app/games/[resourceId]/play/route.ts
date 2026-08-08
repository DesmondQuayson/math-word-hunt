import { NextResponse } from "next/server";

import { requireProductAccess } from "@/lib/access/server";
import { loadInternalGameLaunchRecord } from "@/lib/games/catalog";
import { createInternalGameResponse, isInternalGameRegistered } from "@/lib/games/internal-registry";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ resourceId: string }> }) {
  await requireProductAccess("/games");
  const game = await loadInternalGameLaunchRecord((await params).resourceId);
  if (!game || !isInternalGameRegistered(game.stableKey) || game.status === "draft" || game.status === "archived") {
    return new NextResponse("Not Found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  if (game.status === "maintenance") {
    return NextResponse.redirect(new URL(`/games/${game.slug}/maintenance`, request.url), 303);
  }
  return createInternalGameResponse(game.stableKey);
}
