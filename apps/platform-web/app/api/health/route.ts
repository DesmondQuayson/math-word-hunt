import { getOperationalStatus } from "@/lib/environment/operational-status";
import { getPublicEnvironmentView, getServerEnvironment } from "@/lib/environment/server";
export const dynamic = "force-dynamic";
// searchIndexing and payments come from the same server-owned contract the
// status page renders, so the two surfaces cannot disagree (BS-02).
export function GET() {
  const environment = getPublicEnvironmentView();
  const operational = getOperationalStatus();
  const ready = getServerEnvironment() !== null;
  return Response.json({ status: ready ? "ready" : "configuration-required", environment: environment.identity, build: environment.buildId, searchIndexing: operational.searchIndexing, payments: operational.payments }, { status: ready ? 200 : 503, headers: { "Cache-Control":"no-store" } });
}
