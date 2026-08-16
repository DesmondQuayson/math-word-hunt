import { NextResponse } from "next/server";

import { inspectAdminAccess } from "@/lib/admin/session";
import { createCrossCalcV2PreviewResponse } from "@/lib/games/internal-registry";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await inspectAdminAccess();
  if (access.state !== "authorized") {
    return new NextResponse("Not Found", {
      status: 404,
      headers: { "Cache-Control": "private, no-store, max-age=0" }
    });
  }
  return createCrossCalcV2PreviewResponse();
}
