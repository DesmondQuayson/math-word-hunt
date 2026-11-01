import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { GameSummaryCards } from "@/components/public/game-summary-cards";
import { ProductLanding } from "@/components/public/product-landing";
import { LinkButton } from "@/components/ui/link-button";
import { isProductionPlatformMode } from "@/lib/environment/production-platform";
import { SCHOOL_ACCESS_DURATION_SECONDS } from "@/lib/school-access/session";
import { loadGameCatalogSummary, type GameSummary } from "@/lib/seo/catalog-summaries";
import { platformProductLabel } from "@/lib/seo/platform-positioning";
import { PRODUCT_PAGE_PATHS } from "@/lib/seo/product-pages";
import { publicPageMetadata } from "@/lib/seo/public-pages";

const PATH = PRODUCT_PAGE_PATHS.mathGames;

// The game list is read from the live catalog on request (as /games and the
// homepage do), never at build time.
export const dynamic = "force-dynamic";

/** Shown only when the catalog cannot be read: the free game is always offered. */
const MATH_TUG_OF_WAR_FALLBACK: GameSummary = Object.freeze({
  stableKey: "math-tug-of-war",
  thumbnailReference: "",
  title: "Math Tug of War",
  description: "Solve the math. Pull the rope. Beat the other side!",
  grades: null,
  skills: [],
  freeToPlay: true
});

export function generateMetadata(): Metadata {
  return isProductionPlatformMode() ? publicPageMetadata(PATH) : {};
}

/** Public page for Math Games (the gated /games catalog): the published games, from the live catalog. */
export default async function MathGamesPage() {
  if (!isProductionPlatformMode()) notFound();
  const summary = await loadGameCatalogSummary();
  const games = summary.available ? summary.games : [MATH_TUG_OF_WAR_FALLBACK];
  const label = platformProductLabel("/games");
  return <ProductLanding
    path={PATH}
    eyebrow={label}
    title="Math games for the classroom"
    description="Games for whole-class play on a shared screen or smart board, and for quick practice. Every game is included with a MathNexa subscription, and Math Tug of War is free with any MathNexa account."
    actions={<>
      <LinkButton href="/games">Open {label}</LinkButton>
      <LinkButton href={PRODUCT_PAGE_PATHS.mathTugOfWar} variant="secondary">Math Tug of War</LinkButton>
    </>}
    access="subscription"
    schoolAccessHours={SCHOOL_ACCESS_DURATION_SECONDS / 3600}
  >
    {games.length ? <section aria-labelledby="games-list">
      <h2 id="games-list">{summary.available ? "Games you can play" : "Play for free"}</h2>
      <GameSummaryCards games={games} />
    </section> : null}
  </ProductLanding>;
}
