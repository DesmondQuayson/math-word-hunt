import { NextResponse } from "next/server";

import { inspectAdminAccess } from "@/lib/admin/session";
import { loadExternalGameLaunchRecord } from "@/lib/games/catalog";
import {
  createNumberCrossLaunchUrl,
  externalGameLaunchAction,
  ProtectedGameLaunchConfigurationError
} from "@/lib/games/protected-launch";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ catalogId: string }> }) {
  const access = await inspectAdminAccess();
  if (access.state !== "authorized") return new NextResponse("Not Found", { status: 404 });
  const game = await loadExternalGameLaunchRecord((await params).catalogId);
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
