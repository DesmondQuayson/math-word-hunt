import { getPublicEnvironmentView, getServerEnvironment } from "@/lib/environment/server";
export const dynamic = "force-dynamic";
export function GET() {
  const environment = getPublicEnvironmentView();
  const ready = getServerEnvironment() !== null;
  return Response.json({ status: ready ? "ready" : "configuration-required", environment: environment.identity, build: environment.buildId }, { status: ready ? 200 : 503, headers: { "Cache-Control":"no-store" } });
}

