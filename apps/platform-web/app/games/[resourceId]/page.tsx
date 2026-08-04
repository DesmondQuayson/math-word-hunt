import Link from "next/link";
import { notFound } from "next/navigation";
import { GameAccessStatus } from "@/components/consumer/game-access-status";
import { Container } from "@/components/layout/container";
import { loadPublicGame } from "@/lib/games/catalog";
import { createGameAssetTicket } from "@/lib/games/ticket";
import { requireProductAccess } from "@/lib/access/server";
export const dynamic="force-dynamic";
export default async function GameDetail({params}:{params:Promise<{resourceId:string}>}){const access=await requireProductAccess("/games");const game=await loadPublicGame((await params).resourceId);if(!game)notFound();const ticket=access.decision.allowed&&access.context.userId?createGameAssetTicket({audience:"subscriber",packageId:game.packageId,principalId:access.context.userId}):null;return <Container className="game-detail page-stack" width="wide"><header><p className="eyebrow">{game.grade} / {game.topic} / {game.lesson}</p><h1>{game.title}</h1><p>{game.description}</p></header>{access.decision.allowed&&ticket?<section aria-labelledby="game-frame-title"><h2 id="game-frame-title">Ready to play</h2><p>The game runs in a restricted frame and cannot access MathNexa account data.</p><iframe data-testid="package-game-frame" title={game.title} src={`/games/${game.id}/runtime?ticket=${encodeURIComponent(ticket)}`} sandbox="allow-scripts" allow="camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'; payment 'none'; usb 'none'; fullscreen 'none'" referrerPolicy="no-referrer" /></section>:<GameAccessStatus decision={access.decision}/>}<Link className="button button-secondary" href="/games">Back to games</Link></Container>}
