import { NextResponse } from "next/server";

import { MATH_BINGO_LIVE_HOST_ROUTE } from "@/lib/games/access-policy";

export const dynamic = "force-dynamic";

// Every other internal game starts at /games/<slug>/play. Math Bingo Live
// starts on the host screen, which owns the account and availability rules,
// so this address only points there (instead of falling through to
// app/games/[resourceId]/play and serving the host document a second way).
export function GET(request: Request) {
  return NextResponse.redirect(new URL(MATH_BINGO_LIVE_HOST_ROUTE, request.url), 307);
}
