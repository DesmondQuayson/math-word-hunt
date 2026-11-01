import Link from "next/link";

import { GameCatalogThumbnail } from "@/components/games/game-catalog-thumbnail";
import type { GameSummary } from "@/lib/seo/catalog-summaries";
import { PRODUCT_PAGE_PATHS } from "@/lib/seo/product-pages";

/**
 * The published games on the public Math Games page, in the Math Games card
 * style (styles/games.css). Display fields only. No card links into a game:
 * the page's own button opens the gated catalog, and Math Tug of War links to
 * its public page.
 */
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
        {game.stableKey === "math-tug-of-war"
          ? <Link className="button button-secondary" href={PRODUCT_PAGE_PATHS.mathTugOfWar}>About Math Tug of War</Link>
          : null}
      </div>
    </article>)}
  </div>;
}
