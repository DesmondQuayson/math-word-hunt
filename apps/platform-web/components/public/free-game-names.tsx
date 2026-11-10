import Link from "next/link";
import { Fragment } from "react";

import { freeGameEntryRoute } from "@/lib/games/free-game-entry";
import type { GameSummary } from "@/lib/seo/catalog-summaries";
import { listSeparator } from "@/lib/seo/free-games-statement";
import { productPageForGame } from "@/lib/seo/product-pages";

/**
 * The free games' names listed in words ("A, B and C"), for the sentences on
 * Help and About. Each name links to the game's public page when it has one
 * (Math Tug of War), otherwise to its free play route, which takes a
 * signed-out visitor through sign in and back to the game. A game with
 * neither is named without a link.
 */
export function FreeGameNames({ games }: Readonly<{ games: readonly Pick<GameSummary, "stableKey" | "title">[] }>) {
  return <>
    {games.map((game, index) => {
      const href = productPageForGame(game.stableKey) ?? freeGameEntryRoute(game.stableKey);
      return <Fragment key={game.stableKey}>
        {listSeparator(index, games.length)}
        {href ? <Link href={href}>{game.title}</Link> : game.title}
      </Fragment>;
    })}
  </>;
}
