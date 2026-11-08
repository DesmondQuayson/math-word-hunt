import Link from "next/link";
import { notFound } from "next/navigation";

import { GameCatalogThumbnail } from "@/components/games/game-catalog-thumbnail";
import { Container } from "@/components/layout/container";
import { GAME_KEY, isLocalOwnerPreview, PLAY_ROUTE } from "@/lib/games/polygon-showdown/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export const metadata = { title: "Polygon Showdown catalog preview", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type CatalogRow = Readonly<{
  title: string;
  description: string;
  status: string;
  difficulty: string;
  recommended_grade_min: number | null;
  recommended_grade_max: number | null;
  skills: string[];
  topics: string[];
  thumbnail_reference: string;
  publication_metadata: Record<string, unknown>;
}>;

// The draft catalog card as players would see it, for the local owner review
// only. The route 404s on anything but a loopback owner preview.
export default async function PolygonShowdownCatalogPreview() {
  if (!isLocalOwnerPreview()) notFound();
  const client = createServiceSupabaseClient();
  const { data } = client
    ? await client.from("game_catalog_entries").select("title,description,status,difficulty,recommended_grade_min,recommended_grade_max,skills,topics,thumbnail_reference,publication_metadata").eq("stable_key", GAME_KEY).maybeSingle()
    : { data: null };
  const game = data as CatalogRow | null;
  if (!game) notFound();
  return <Container className="game-catalog page-stack" width="wide">
    <header className="game-catalog-hero">
      <p className="eyebrow">Local owner review</p>
      <h1>Catalog preview</h1>
      <p>Status: <strong>{game.status.toUpperCase()}</strong>. A draft is never listed in the catalog and is not published.</p>
    </header>
    <div className="game-card-grid"><article>
      <div className="game-card-thumbnail" data-game={GAME_KEY}>
        <GameCatalogThumbnail stableKey={GAME_KEY} thumbnailReference={game.thumbnail_reference} title={game.title} />
      </div>
      <div className="game-card-content">
        <p className="game-path"><span className="game-free-badge">Free to play</span>{" "}{String(game.publication_metadata.category ?? "")} · {game.recommended_grade_min && game.recommended_grade_max ? `Grades ${game.recommended_grade_min}–${game.recommended_grade_max}` : "Flexible classroom use"}</p>
        <h2>{game.title}</h2>
        <p>{game.description}</p>
        <ul className="game-tag-list" aria-label="Skills">{game.skills.map((skill) => <li key={skill}>{skill}</li>)}</ul>
        <Link className="button button-primary" href={PLAY_ROUTE}>Play for Free Now</Link>
      </div>
    </article></div>
  </Container>;
}
