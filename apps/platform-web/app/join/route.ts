import { NextResponse } from "next/server";

import { renderMathBingoLivePlayerDocument } from "@/features/games/math-bingo-live/document";
import { renderMathRaceChampionsJoinDocument } from "@/features/games/math-race-champions/document";
import { renderPolygonShowdownJoinDocument } from "@/features/games/polygon-showdown/document";
import { createInternalDocumentResponse } from "@/lib/games/internal-registry";
import { isMathBingoLiveAvailable, normalizeRoomCode } from "@/lib/games/math-bingo-live/server";
import { isMathRaceChampionsAvailable, liveRoomGameForCode } from "@/lib/games/math-race-champions/server";
import { isPolygonShowdownAvailable } from "@/lib/games/polygon-showdown/server";

export const dynamic = "force-dynamic";

// mathnexa.com/join — where players type a live game's code or land from its
// QR code. No account, no cookie, no sign-in: the page asks only for the code
// and a display name. The code decides which game's screen answers: every open
// code belongs to exactly one live game. With no code, or a code that is not a
// Polygon Showdown or Math Race Champions room, this is the Math Bingo Live
// screen it has always been, and every Bingo code keeps working; a code typed
// there that belongs to another live game is sent back here with the code.
// While a game is a catalog DRAFT it is served only under its owner preview.
export async function GET(request: Request) {
  const code = normalizeRoomCode(new URL(request.url).searchParams.get("code"));
  const [polygonAvailable, raceAvailable] = await Promise.all([isPolygonShowdownAvailable(), isMathRaceChampionsAvailable()]);
  const owner = code && (polygonAvailable || raceAvailable) ? await liveRoomGameForCode(code) : null;
  if (owner === "polygon_showdown" && polygonAvailable) {
    return createInternalDocumentResponse(renderPolygonShowdownJoinDocument(), "'self'");
  }
  if (owner === "math_race_champions" && raceAvailable) {
    return createInternalDocumentResponse(renderMathRaceChampionsJoinDocument(), "'self'");
  }
  if (await isMathBingoLiveAvailable()) {
    return createInternalDocumentResponse(renderMathBingoLivePlayerDocument(), "'self'");
  }
  if (polygonAvailable) {
    return createInternalDocumentResponse(renderPolygonShowdownJoinDocument(), "'self'");
  }
  if (raceAvailable) {
    return createInternalDocumentResponse(renderMathRaceChampionsJoinDocument(), "'self'");
  }
  return new NextResponse("Not Found", { status: 404, headers: { "Cache-Control": "no-store" } });
}
