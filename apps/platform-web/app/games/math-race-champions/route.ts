import { NextResponse } from "next/server";

import { MATH_RACE_CHAMPIONS_PLAY_ROUTE } from "@/lib/games/access-policy";

export const dynamic = "force-dynamic";

// /games/math-race-champions is the game's own address; the play route applies
// the access and availability rules.
export function GET(request: Request) {
  return NextResponse.redirect(new URL(MATH_RACE_CHAMPIONS_PLAY_ROUTE, request.url), 307);
}
