import Link from "next/link";

import { GameCatalogThumbnail } from "@/components/games/game-catalog-thumbnail";
import { Container } from "@/components/layout/container";
import { requireProductAccess } from "@/lib/access/server";
import { gamePlayHref, loadPublicGameCatalog } from "@/lib/games/catalog";

export const metadata = { title: "Games" };
export const dynamic = "force-dynamic";

export default async function GamesPage() {
  await requireProductAccess("/games");
  const catalog = await loadPublicGameCatalog();
  return <Container className="game-catalog page-stack" width="wide">
    <header className="game-catalog-hero">
      <p className="eyebrow">Choose a game</p>
      <h1>Pick a challenge.</h1>
      <p>Teacher-ready games. One subscription. Play in seconds.</p>
    </header>
    {catalog.games.length ? <div className="game-card-grid">{catalog.games.map((game) => <article key={game.id}>
      <div className="game-card-thumbnail" data-game={game.stableKey}>
        <GameCatalogThumbnail stableKey={game.stableKey} thumbnailReference={game.thumbnailReference} title={game.title} />
      </div>
      <div className="game-card-content">
        <p className="game-path">{game.difficulty} · {game.recommendedGradeMin && game.recommendedGradeMax ? `Grades ${game.recommendedGradeMin}–${game.recommendedGradeMax}` : "Flexible classroom use"}</p>
        <h2>{game.title}</h2>
        <p>{game.description}</p>
        {game.skills.length ? <ul className="game-tag-list" aria-label="Skills">{game.skills.map((skill) => <li key={skill}>{skill}</li>)}</ul> : null}
        <Link className="button button-primary" href={gamePlayHref(game)}>Play</Link>
      </div>
    </article>)}</div> : catalog.state === "ready" ? <div className="public-resource-empty"><strong>No games have been published yet</strong><p>Your subscription is active. Published games will appear here without another Checkout.</p></div> : <div className="public-resource-empty" role="status"><strong>Games are temporarily unavailable</strong><p>Your subscription remains active. Refresh this page, or contact support if the catalog does not return.</p><Link className="button button-secondary" href="/games">Refresh</Link></div>}
  </Container>;
}
