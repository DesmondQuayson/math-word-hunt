import { NextResponse } from "next/server";

import { inspectAdminAccess } from "@/lib/admin/session";
import { loadExternalGameLaunchRecord, loadInternalGameLaunchRecord } from "@/lib/games/catalog";
import {
  createCrossCalcV2PreviewResponse,
  createInternalGameResponse,
  isInternalGameRegistered
} from "@/lib/games/internal-registry";
import {
  createNumberCrossLaunchUrl,
  externalGameLaunchAction,
  ProtectedGameLaunchConfigurationError
} from "@/lib/games/protected-launch";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ catalogId: string }> }) {
  const access = await inspectAdminAccess();
  if (access.state !== "authorized") return new NextResponse("Not Found", { status: 404 });
  const catalogId = (await params).catalogId;
  const internalGame = await loadInternalGameLaunchRecord(catalogId);
  if (internalGame) {
    if (internalGame.status === "archived" || !isInternalGameRegistered(internalGame.stableKey)) {
      return new NextResponse("Not Found", { status: 404 });
    }
    const requestedVersion = new URL(request.url).searchParams.get("version");
    if (requestedVersion !== null) {
      if (internalGame.stableKey === "crosscalc" && requestedVersion === "0.2.0") {
        return createCrossCalcV2PreviewResponse(internalGame.version === "0.2.0");
      }
      return new NextResponse("Not Found", { status: 404 });
    }
    return createInternalGameResponse(internalGame.stableKey, internalGame.version);
  }
  const game = await loadExternalGameLaunchRecord(catalogId);
  if (!game) return new NextResponse("Not Found", { status: 404 });
  const action = externalGameLaunchAction(game, "admin-preview");
  if (action === "not-found" || action === "maintenance") return new NextResponse("Not Found", { status: 404 });
  if (action === "protected-number-cross") {
    try {
      const destination = await createNumberCrossLaunchUrl({ game, purpose: "admin-preview" });
      const response = NextResponse.redirect(destination, 303);
      response.headers.set("Cache-Control", "private, no-store, max-age=0");
      response.headers.set("Referrer-Policy", "no-referrer");
      return response;
    } catch (error) {
      if (error instanceof ProtectedGameLaunchConfigurationError) {
        return new NextResponse("Game temporarily unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
      }
      throw error;
    }
  }
  return NextResponse.redirect(game.launch.url, 303);
}
