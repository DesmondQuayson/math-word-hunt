import { NextResponse } from "next/server";

import { requireGamePlayAccess } from "@/lib/access/server";
import { createInternalGameResponse } from "@/lib/games/internal-registry";
import { GAME_KEY, isMathRaceChampionsAvailable } from "@/lib/games/math-race-champions/server";

export const dynamic = "force-dynamic";

// Math Race Champions. Free for any signed-in MathNexa account or school
// session (lib/games/access-policy.ts); anonymous visitors are sent to sign in
// and brought back here. While the game is a catalog DRAFT this route is served
// only under an owner preview (lib/games/math-race-champions/server.ts).
export async function GET() {
  await requireGamePlayAccess(GAME_KEY);
  if (!(await isMathRaceChampionsAvailable())) {
    return new NextResponse("Not Found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  return createInternalGameResponse(GAME_KEY);
}
