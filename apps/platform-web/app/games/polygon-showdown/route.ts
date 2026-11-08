import { NextResponse } from "next/server";

import { POLYGON_SHOWDOWN_PLAY_ROUTE } from "@/lib/games/access-policy";

export const dynamic = "force-dynamic";

// /games/polygon-showdown is the game's own address; the play route applies
// the access and availability rules.
export function GET(request: Request) {
  return NextResponse.redirect(new URL(POLYGON_SHOWDOWN_PLAY_ROUTE, request.url), 307);
}
