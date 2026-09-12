import { getDeployedSourceRevision } from "@/lib/environment/build-identity";
import { getOperationalStatus } from "@/lib/environment/operational-status";
import { getPublicEnvironmentView, getServerEnvironment } from "@/lib/environment/server";
export const dynamic = "force-dynamic";
// searchIndexing and payments come from the same server-owned contract the
// status page renders, so the two surfaces cannot disagree (BS-02). `build` is
// the deployed source revision, resolved per deployment rather than from a
// hand-set identifier that went stale (BS-08).
export function GET() {
  const environment = getPublicEnvironmentView();
  const operational = getOperationalStatus();
  const ready = getServerEnvironment() !== null;
  return Response.json({ status: ready ? "ready" : "configuration-required", environment: environment.identity, build: getDeployedSourceRevision(), searchIndexing: operational.searchIndexing, payments: operational.payments }, { status: ready ? 200 : 503, headers: { "Cache-Control":"no-store" } });
}
