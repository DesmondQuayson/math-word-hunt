import { NextResponse } from "next/server";

import { requireGamePlayAccess } from "@/lib/access/server";
import { createInternalGameResponse } from "@/lib/games/internal-registry";
import { GAME_KEY, isPolygonShowdownAvailable } from "@/lib/games/polygon-showdown/server";

export const dynamic = "force-dynamic";

// Polygon Showdown. Free for any signed-in MathNexa account
// (lib/games/access-policy.ts); anonymous visitors are sent to sign in and
// brought back here. While the game is a catalog DRAFT this route is served
// only under the local owner preview (lib/games/polygon-showdown/server.ts).
export async function GET() {
  await requireGamePlayAccess(GAME_KEY);
  if (!(await isPolygonShowdownAvailable())) {
    return new NextResponse("Not Found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  return createInternalGameResponse(GAME_KEY);
}
