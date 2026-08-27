import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { GameAccessStatus } from "@/components/consumer/game-access-status";
import { Container } from "@/components/layout/container";
import { requireProductAccess } from "@/lib/access/server";
import { loadPublicGame } from "@/lib/games/catalog";
import { getInternalGameRegistration } from "@/lib/games/internal-registry";
import { createGameAssetTicket } from "@/lib/games/ticket";

export const dynamic = "force-dynamic";

export default async function GameDetail({ params }: { params: Promise<{ resourceId: string }> }) {
  const access = await requireProductAccess("/games");
  const game = await loadPublicGame((await params).resourceId);
  if (!game) notFound();
  if (game.launch.type === "canonical") redirect(game.launch.route);
  if (game.launch.type === "external_https") redirect(`/games/${game.slug}/launch`);
  if (game.launch.type === "internal") {
    const registration = getInternalGameRegistration(game.launch.key);
    if (!registration) notFound();
    redirect(registration.route);
  }
  const ticket = access.decision.allowed && access.principal
    ? createGameAssetTicket({ audience: "subscriber", packageId: game.launch.packageId, principalId: access.principal.id })
    : null;
  // Gameplay is the hero: compact chrome above the frame, supporting notes
  // below it, and an always-visible way back at the top.
  return <Container className="game-detail page-stack" width="wide">
    <header className="game-detail-header">
      <Link className="game-detail-back" href="/games"><span aria-hidden="true">←</span> Back to Games</Link>
      <h1>{game.title}</h1>
    </header>
    {access.decision.allowed && ticket ? <>
      <iframe data-testid="package-game-frame" title={game.title} src={`/games/${game.slug}/runtime?ticket=${encodeURIComponent(ticket)}`} sandbox="allow-scripts" allow="camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'; payment 'none'; usb 'none'; fullscreen 'none'" referrerPolicy="no-referrer" />
      <p className="game-detail-note">{game.description} The game runs in a restricted frame and cannot access MathNexa account data.</p>
    </> : <GameAccessStatus decision={access.decision} />}
  </Container>;
}
