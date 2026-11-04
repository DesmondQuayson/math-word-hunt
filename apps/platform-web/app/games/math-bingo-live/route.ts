import { NextResponse } from "next/server";

import { MATH_BINGO_LIVE_HOST_ROUTE } from "@/lib/games/access-policy";

export const dynamic = "force-dynamic";

// /games/math-bingo-live is the game's own address; the game itself starts on
// the host screen, which applies the access and availability rules.
export function GET(request: Request) {
  return NextResponse.redirect(new URL(MATH_BINGO_LIVE_HOST_ROUTE, request.url), 307);
}
