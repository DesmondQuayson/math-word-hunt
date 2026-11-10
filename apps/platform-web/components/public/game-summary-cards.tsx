import Link from "next/link";

import { GameCatalogThumbnail } from "@/components/games/game-catalog-thumbnail";
import { MATH_BINGO_LIVE_HOST_ROUTE } from "@/lib/games/access-policy";
import { freeGameEntryRoute } from "@/lib/games/free-game-entry";
import type { GameSummary } from "@/lib/seo/catalog-summaries";
import { PRODUCT_PAGE_PATHS } from "@/lib/seo/product-pages";

/**
 * The published games on the public Math Games page, in the Math Games card
 * style (styles/games.css). Display fields only. The page's own button opens
 * the gated catalog. Math Tug of War links to its public page, and Math Bingo
 * Live (free to host) links to its host screen and to /join for students (no
 * account). Every other free game (Polygon Showdown, and any game made free
 * later) gets Play Free, to its free play route (freeGameEntryRoute), which
 * sends a signed-out visitor through sign in and back to the game. A
 * subscription game has no button: the page's Open Math Games is its way in.
 */
function CardActions({ game }: Readonly<{ game: GameSummary }>) {
  if (game.stableKey === "math-tug-of-war") {
    return <Link className="button button-secondary" href={PRODUCT_PAGE_PATHS.mathTugOfWar}>About Math Tug of War</Link>;
  }
  if (game.stableKey === "math-bingo-live") {
    return <div className="button-row">
      <Link className="button button-primary" href={MATH_BINGO_LIVE_HOST_ROUTE}>Host a Free Game</Link>
      <Link className="button button-secondary" href="/join">Join with a code</Link>
    </div>;
  }
  const route = game.freeToPlay ? freeGameEntryRoute(game.stableKey) : null;
  // The game's name completes the accessible name ("Play Free Polygon Showdown"), as on the homepage cards.
  return route ? <Link className="button button-primary" href={route}>Play Free<span className="visually-hidden">{` ${game.title}`}</span></Link> : null;
}

export function GameSummaryCards({ games }: Readonly<{ games: readonly GameSummary[] }>) {
  return <div className="game-card-grid product-game-grid">
    {games.map((game) => <article key={game.stableKey} data-game={game.stableKey}>
      <div className="game-card-thumbnail">
        <GameCatalogThumbnail stableKey={game.stableKey} thumbnailReference={game.thumbnailReference} title={game.title} />
      </div>
      <div className="game-card-content">
        <p className="game-path">
          {game.freeToPlay ? <><span className="game-free-badge">Free</span>{" "}with a MathNexa account</> : "Included with a subscription"}
          {game.grades ? ` · ${game.grades}` : null}
        </p>
        <h3>{game.title}</h3>
        <p>{game.description}</p>
        {game.skills.length ? <ul className="game-tag-list" aria-label={`${game.title} skills`}>{game.skills.map((skill) => <li key={skill}>{skill}</li>)}</ul> : null}
        <CardActions game={game} />
      </div>
    </article>)}
  </div>;
}
