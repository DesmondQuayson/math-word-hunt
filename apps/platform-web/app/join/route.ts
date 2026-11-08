import { NextResponse } from "next/server";

import { renderMathBingoLivePlayerDocument } from "@/features/games/math-bingo-live/document";
import { renderPolygonShowdownJoinDocument } from "@/features/games/polygon-showdown/document";
import { createInternalDocumentResponse } from "@/lib/games/internal-registry";
import { isMathBingoLiveAvailable, normalizeRoomCode } from "@/lib/games/math-bingo-live/server";
import { isPolygonShowdownAvailable, liveRoomGameForCode } from "@/lib/games/polygon-showdown/server";

export const dynamic = "force-dynamic";

// mathnexa.com/join — where players type a live game's code or land from its
// QR code. No account, no cookie, no sign-in: the page asks only for the code
// and a display name. The code decides which game's screen answers. With no
// code, or a code that is not a Polygon Showdown room, this is the Math Bingo
// Live screen it has always been, and every Bingo code keeps working; a code
// typed there that belongs to a Showdown is sent back here with the code.
// While a game is a catalog DRAFT it is served only under its local owner preview.
export async function GET(request: Request) {
  const code = normalizeRoomCode(new URL(request.url).searchParams.get("code"));
  const polygonAvailable = await isPolygonShowdownAvailable();
  if (code && polygonAvailable && (await liveRoomGameForCode(code)) === "polygon_showdown") {
    return createInternalDocumentResponse(renderPolygonShowdownJoinDocument(), "'self'");
  }
  if (await isMathBingoLiveAvailable()) {
    return createInternalDocumentResponse(renderMathBingoLivePlayerDocument(), "'self'");
  }
  if (polygonAvailable) {
    return createInternalDocumentResponse(renderPolygonShowdownJoinDocument(), "'self'");
  }
  return new NextResponse("Not Found", { status: 404, headers: { "Cache-Control": "no-store" } });
}
