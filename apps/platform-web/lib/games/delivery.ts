import "server-only";

import { normalizeGameAssetPath } from "@math-vocabulary-hunt/platform-core";

import { createServiceSupabaseClient } from "@/lib/supabase/service";

const BASE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "Cross-Origin-Resource-Policy": "cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), clipboard-read=(), clipboard-write=(), fullscreen=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN"
} as const;

function gameCsp(request:Request,assetPath:string):string{const url=new URL(request.url),suffix=`/${assetPath}`;let configured:URL;try{configured=new URL(process.env.MVH_APPLICATION_ORIGIN??"")}catch{return "default-src 'none'; frame-ancestors 'none'"}if(!url.pathname.endsWith(suffix)||configured.pathname!=="/"||configured.search||configured.hash||configured.username||configured.password||!(["https:"].includes(configured.protocol)||(configured.protocol==="http:"&&["127.0.0.1","localhost"].includes(configured.hostname))))return "default-src 'none'; frame-ancestors 'none'";const assetBase=`${configured.origin}${url.pathname.slice(0,-assetPath.length)}`;return [
  "default-src 'none'",
  `script-src ${assetBase}`,
  `style-src ${assetBase} 'unsafe-inline'`,
  `img-src ${assetBase} data: blob:`,
  `media-src ${assetBase} blob:`,
  `font-src ${assetBase}`,
  "connect-src 'none'",
  "frame-src 'none'",
  "child-src 'none'",
  "worker-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'self'",
  "manifest-src 'none'"
].join("; ")}

export type GamePackageDelivery = Readonly<{
  id: string;
  resourceId: string;
  entryFile: string;
  publicationState: string;
}>;

export async function loadGamePackageDelivery(packageId: string): Promise<GamePackageDelivery | null> {
  if (!/^[0-9a-f-]{36}$/i.test(packageId)) return null;
  const client = createServiceSupabaseClient();
  if (!client) return null;
  const result = await client.from("game_packages").select("id,resource_id,entry_file,publication_state").eq("id", packageId).maybeSingle();
  if (result.error || !result.data) return null;
  return { id: result.data.id, resourceId: result.data.resource_id, entryFile: result.data.entry_file, publicationState: result.data.publication_state };
}

export async function deliverPrivateGameAsset(request: Request, packageId: string, requestedPath: string): Promise<Response> {
  const assetPath = normalizeGameAssetPath(requestedPath);
  if (!assetPath) return new Response("Not Found", { status: 404, headers: BASE_HEADERS });
  const client = createServiceSupabaseClient();
  if (!client) return new Response("Not Found", { status: 404, headers: BASE_HEADERS });
  const asset = await client.from("game_package_assets").select("object_path,mime_type,byte_size").eq("package_id", packageId).eq("asset_path", assetPath).maybeSingle();
  if (asset.error || !asset.data) return new Response("Not Found", { status: 404, headers: BASE_HEADERS });
  if (asset.data.mime_type === "text/html" && request.headers.get("sec-fetch-dest") !== "iframe") {
    return new Response("Not Found", { status: 404, headers: BASE_HEADERS });
  }
  const signed = await client.storage.from("game-packages").createSignedUrl(asset.data.object_path, 30);
  if (signed.error) return new Response("Not Found", { status: 404, headers: BASE_HEADERS });
  const stored = await fetch(signed.data.signedUrl, { cache: "no-store", redirect: "error" });
  if (!stored.ok || Number(stored.headers.get("content-length") ?? asset.data.byte_size) !== asset.data.byte_size) {
    return new Response("Not Found", { status: 404, headers: BASE_HEADERS });
  }
  const headers: Record<string, string> = { ...BASE_HEADERS, "Content-Type": asset.data.mime_type };
  if (asset.data.mime_type === "text/html") headers["Content-Security-Policy"] = gameCsp(request,assetPath);
  return new Response(stored.body, { status: 200, headers });
}
