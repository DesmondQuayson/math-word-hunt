import { NextResponse } from "next/server";

import { requireProductAccess } from "@/lib/access/server";
import { loadPublicGame } from "@/lib/games/catalog";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ resourceId: string }> }) {
  await requireProductAccess("/games");
  const game = await loadPublicGame((await params).resourceId);
  if (!game) return new NextResponse("Not Found", { status: 404, headers: { "Cache-Control": "no-store" } });
  if (game.launch.type === "canonical") return NextResponse.redirect(new URL(game.launch.route, request.url), 303);
  if (game.launch.type !== "external_https") return NextResponse.redirect(new URL(`/games/${game.slug}`, request.url), 303);
  return NextResponse.redirect(game.launch.url, 303);
}
