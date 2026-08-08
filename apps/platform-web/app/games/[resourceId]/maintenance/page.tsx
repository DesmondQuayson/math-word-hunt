import Link from "next/link";
import { notFound } from "next/navigation";

import { Container } from "@/components/layout/container";
import { requireProductAccess } from "@/lib/access/server";
import { loadExternalGameLaunchRecord, loadInternalGameLaunchRecord } from "@/lib/games/catalog";

export const metadata = { title: "Game maintenance" };
export const dynamic = "force-dynamic";

export default async function GameMaintenance({ params }: { params: Promise<{ resourceId: string }> }) {
  await requireProductAccess("/games");
  const identifier = (await params).resourceId;
  const game = await loadInternalGameLaunchRecord(identifier) ?? await loadExternalGameLaunchRecord(identifier);
  if (!game || game.status !== "maintenance") notFound();
  return <Container className="page-stack" width="compact">
    <header>
      <p className="eyebrow">Temporarily unavailable</p>
      <h1>{game.title} is undergoing maintenance</h1>
      <p>No launch authorization was issued. Please return to the game library and try again later.</p>
    </header>
    <Link className="button button-primary" href="/games">Back to games</Link>
  </Container>;
}
