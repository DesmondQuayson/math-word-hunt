import { redirect } from "next/navigation";

import { GameAccessStatus } from "@/components/consumer/game-access-status";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { getGameAccessView } from "@/lib/game-access/server";

export const metadata = { title: "Game access" };
export const dynamic = "force-dynamic";

export default async function GameAccessPage() {
  const view = await getGameAccessView();
  if (view.context.status === "anonymous" || view.context.status === "unconfigured") redirect("/sign-in?next=/game-access");
  return <Container className="page-stack" width="compact">
    <PageHeader eyebrow="Server-owned decision" title="Game-access status" description="Only verified account and entitlement data evaluated with server time can permit launch." />
    <GameAccessStatus decision={view.decision} />
  </Container>;
}
