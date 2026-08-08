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
  const ticket = access.decision.allowed && access.context.userId
    ? createGameAssetTicket({ audience: "subscriber", packageId: game.launch.packageId, principalId: access.context.userId })
    : null;
  return <Container className="game-detail page-stack" width="wide">
    <header><p className="eyebrow">Standalone game</p><h1>{game.title}</h1><p>{game.description}</p></header>
    {access.decision.allowed && ticket ? <section aria-labelledby="game-frame-title"><h2 id="game-frame-title">Ready to play</h2><p>The game runs in a restricted frame and cannot access MathNexa account data.</p><iframe data-testid="package-game-frame" title={game.title} src={`/games/${game.slug}/runtime?ticket=${encodeURIComponent(ticket)}`} sandbox="allow-scripts" allow="camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'; payment 'none'; usb 'none'; fullscreen 'none'" referrerPolicy="no-referrer" /></section> : <GameAccessStatus decision={access.decision} />}
    <Link className="button button-secondary" href="/games">Back to games</Link>
  </Container>;
}
