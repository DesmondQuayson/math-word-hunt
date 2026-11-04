import { NextResponse } from "next/server";

import { renderMathBingoLiveHostDocument } from "@/features/games/math-bingo-live/document";
import { requireGamePlayAccess } from "@/lib/access/server";
import { createInternalDocumentResponse } from "@/lib/games/internal-registry";
import { GAME_KEY, isMathBingoLiveAvailable } from "@/lib/games/math-bingo-live/server";

export const dynamic = "force-dynamic";

// The Math Bingo Live host screen. Free to host for any signed-in MathNexa
// account (lib/games/access-policy.ts); anonymous visitors are sent to sign
// in and brought back here. While the game is a catalog DRAFT this route is
// served only under the local owner preview (lib/games/math-bingo-live/server.ts).
export async function GET() {
  await requireGamePlayAccess(GAME_KEY);
  if (!(await isMathBingoLiveAvailable())) {
    return new NextResponse("Not Found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  return createInternalDocumentResponse(renderMathBingoLiveHostDocument(), "'self'");
}
