import { NextResponse } from "next/server";

import { requireProductAccess } from "@/lib/access/server";
import { loadExternalGameLaunchRecord, loadPublicGame } from "@/lib/games/catalog";
import {
  createNumberCrossLaunchUrl,
  externalGameLaunchAction,
  ProtectedGameLaunchConfigurationError
} from "@/lib/games/protected-launch";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ resourceId: string }> }) {
  await requireProductAccess("/games");
  const identifier = (await params).resourceId;
  const externalGame = await loadExternalGameLaunchRecord(identifier);
  if (externalGame) {
    const action = externalGameLaunchAction(externalGame, "play");
    if (action === "maintenance") {
      return NextResponse.redirect(new URL(`/games/${externalGame.slug}/maintenance`, request.url), 303);
    }
    if (action === "not-found") {
      return new NextResponse("Not Found", { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    if (action === "protected-number-cross") {
      try {
        const destination = await createNumberCrossLaunchUrl({ game: externalGame, purpose: "play" });
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
    return NextResponse.redirect(externalGame.launch.url, 303);
  }
  const game = await loadPublicGame(identifier);
  if (!game) return new NextResponse("Not Found", { status: 404, headers: { "Cache-Control": "no-store" } });
  if (game.launch.type === "canonical") return NextResponse.redirect(new URL(game.launch.route, request.url), 303);
  if (game.launch.type !== "external_https") return NextResponse.redirect(new URL(`/games/${game.slug}`, request.url), 303);
  return new NextResponse("Not Found", { status: 404, headers: { "Cache-Control": "no-store" } });
}
