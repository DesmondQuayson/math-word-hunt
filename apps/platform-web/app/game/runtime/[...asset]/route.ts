import { isProductionPlatformMode } from "@/lib/environment/production-platform";
import { getGameAccessView } from "@/lib/game-access/server";
import { isCanonicalAssetName, readCanonicalServerAsset } from "@/lib/game-access/canonical-assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ asset: string[] }> }) {
  if (!isProductionPlatformMode()) return Response.json({ error: "not-found" }, { status: 404 });
  const requested = (await params).asset;
  if (requested.length !== 1 || !isCanonicalAssetName(requested[0])) {
    return Response.json({ error: "not-found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  const access = await getGameAccessView();
  if (!access.decision.allowed) {
    return Response.json(
      { error: "game-access-denied", reason: access.decision.reason, nextAction: access.decision.nextAction },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }
  const asset = await readCanonicalServerAsset(requested[0]);
  return new Response(new Uint8Array(asset.body), {
    status: 200,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Type": asset.contentType,
      "Content-Security-Policy": "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; media-src 'none'; connect-src 'none'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer"
    }
  });
}
