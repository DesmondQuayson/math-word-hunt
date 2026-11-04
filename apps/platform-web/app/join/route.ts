import { NextResponse } from "next/server";

import { renderMathBingoLivePlayerDocument } from "@/features/games/math-bingo-live/document";
import { createInternalDocumentResponse } from "@/lib/games/internal-registry";
import { isMathBingoLiveAvailable } from "@/lib/games/math-bingo-live/server";

export const dynamic = "force-dynamic";

// mathnexa.com/join — where students type the game code from the teacher's
// screen. No account, no cookie, no sign-in: the page asks only for the code
// and a display name. While Math Bingo Live is a catalog DRAFT this route is
// served only under the local owner preview.
export async function GET() {
  if (!(await isMathBingoLiveAvailable())) {
    return new NextResponse("Not Found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  return createInternalDocumentResponse(renderMathBingoLivePlayerDocument(), "'self'");
}
