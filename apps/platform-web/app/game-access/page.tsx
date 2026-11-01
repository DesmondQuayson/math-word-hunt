import { redirect } from "next/navigation";

import { GameAccessStatus } from "@/components/consumer/game-access-status";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { getGameAccessView } from "@/lib/game-access/server";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Your access", robots: { index: false, follow: false, noarchive: true, nocache: true } };
export const dynamic = "force-dynamic";

export default async function GameAccessPage() {
  const view = await getGameAccessView();
  if (view.context.status === "anonymous" || view.context.status === "unconfigured") redirect("/sign-in?next=/game-access");
  return <Container className="page-stack" width="compact">
    <PageHeader eyebrow="My Account" title="Your access" description="Only your verified account, trial or subscription, checked on our server, can open MathNexa resources." />
    <GameAccessStatus decision={view.decision} />
  </Container>;
}
