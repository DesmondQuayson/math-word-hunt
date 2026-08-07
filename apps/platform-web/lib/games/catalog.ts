import "server-only";

import { parseGameLaunchTarget, type GameLaunchTarget } from "@math-vocabulary-hunt/platform-core";

import { createServiceSupabaseClient } from "@/lib/supabase/service";

export type PublicGame = Readonly<{
  id: string;
  resourceId: string | null;
  packageId: string | null;
  stableKey: string;
  slug: string;
  title: string;
  description: string;
  launch: GameLaunchTarget;
  thumbnailReference: string;
  recommendedGradeMin: number | null;
  recommendedGradeMax: number | null;
  skills: readonly string[];
  topics: readonly string[];
  tags: readonly string[];
  difficulty: string;
  version: string;
}>;

export type PublicGameCatalog = Readonly<{
  state: "ready" | "unavailable" | "canonical-entry-missing";
  games: readonly PublicGame[];
}>;

export type ExternalGameLaunchRecord = Omit<PublicGame, "launch"> & Readonly<{
  launch: Extract<GameLaunchTarget, { type: "external_https" }>;
  status: "draft" | "maintenance" | "published" | "archived";
}>;

function textArray(value: unknown): readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : [];
}

function reportCatalogFailure(code: "query-unavailable" | "canonical-entry-missing") {
  console.error(`mathnexa-game-catalog:${code}`);
}

export async function loadPublicGameCatalog(reconcileCanonical = true): Promise<PublicGameCatalog> {
  const client = createServiceSupabaseClient();
  if (!client) return { state: "unavailable", games: [] };
  const [entries, allowedHosts] = await Promise.all([
    client.from("game_catalog_entries").select("id,resource_id,package_id,stable_key,slug,title,description,launch_type,canonical_route,external_url,external_allowed_host,thumbnail_reference,recommended_grade_min,recommended_grade_max,skills,topics,tags,difficulty,display_order,version").eq("status", "published").order("display_order").order("title"),
    client.from("game_external_allowed_hosts").select("hostname").eq("enabled", true)
  ]);
  if (entries.error || allowedHosts.error || !entries.data) {
    reportCatalogFailure("query-unavailable");
    return { state: "unavailable", games: [] };
  }
  const hosts = (allowedHosts.data ?? []).map((row) => row.hostname);
  const packageIds = entries.data.flatMap((row) => row.launch_type === "hosted_package" && row.package_id ? [row.package_id] : []);
  const packages = packageIds.length
    ? await client.from("game_packages").select("id,resource_id,publication_state").in("id", packageIds).eq("publication_state", "published")
    : { data: [], error: null };
  if (packages.error) {
    reportCatalogFailure("query-unavailable");
    return { state: "unavailable", games: [] };
  }
  const games = entries.data.flatMap((row): PublicGame[] => {
    const launch = parseGameLaunchTarget(
      row.launch_type === "canonical"
        ? { type: "canonical", route: row.canonical_route }
        : row.launch_type === "hosted_package"
          ? { type: "hosted_package", packageId: row.package_id }
          : { type: "external_https", url: row.external_url, host: row.external_allowed_host },
      hosts
    );
    if (!launch) return [];
    const packageRow = launch.type === "hosted_package" ? (packages.data ?? []).find((item) => item.id === launch.packageId) : null;
    if (launch.type === "hosted_package" && (!packageRow || packageRow.resource_id !== row.resource_id)) return [];
    return [{
      id: row.id,
      resourceId: row.resource_id,
      packageId: row.package_id,
      stableKey: row.stable_key,
      slug: row.slug,
      title: row.title,
      description: row.description,
      launch,
      thumbnailReference: row.thumbnail_reference,
      recommendedGradeMin: row.recommended_grade_min,
      recommendedGradeMax: row.recommended_grade_max,
      skills: textArray(row.skills),
      topics: textArray(row.topics),
      tags: textArray(row.tags),
      difficulty: row.difficulty,
      version: row.version
    }];
  });
  if (!games.some((game) => game.stableKey === "math-vocabulary-hunt" && game.launch.type === "canonical")) {
    reportCatalogFailure("canonical-entry-missing");
    if (reconcileCanonical) {
      const reconciled = await client.rpc("reconcile_canonical_game_catalog_entry");
      if (!reconciled.error && reconciled.data === true) return loadPublicGameCatalog(false);
    }
    return { state: "canonical-entry-missing", games };
  }
  return { state: "ready", games };
}

export async function loadPublicGames(): Promise<readonly PublicGame[]> {
  return (await loadPublicGameCatalog()).games;
}

export async function loadPublicGame(identifier: string): Promise<PublicGame | null> {
  if (!/^(?:[0-9a-f-]{36}|[a-z0-9]+(?:-[a-z0-9]+)*)$/i.test(identifier)) return null;
  return (await loadPublicGames()).find((game) => game.slug === identifier || game.resourceId === identifier || game.id === identifier) ?? null;
}

export async function loadExternalGameLaunchRecord(identifier: string): Promise<ExternalGameLaunchRecord | null> {
  if (!/^(?:[0-9a-f-]{36}|[a-z0-9]+(?:-[a-z0-9]+)*)$/i.test(identifier)) return null;
  const client = createServiceSupabaseClient();
  if (!client) return null;
  let query = client.from("game_catalog_entries")
    .select("id,resource_id,package_id,stable_key,slug,title,description,launch_type,external_url,external_allowed_host,thumbnail_reference,recommended_grade_min,recommended_grade_max,skills,topics,tags,difficulty,status,version")
    .eq("launch_type", "external_https");
  query = /^[0-9a-f-]{36}$/i.test(identifier) ? query.eq("id", identifier) : query.eq("slug", identifier);
  const entry = await query.maybeSingle();
  if (entry.error || !entry.data || !["draft", "maintenance", "published", "archived"].includes(entry.data.status)) return null;
  const allowedHost = await client.from("game_external_allowed_hosts")
    .select("hostname").eq("hostname", entry.data.external_allowed_host).eq("enabled", true).maybeSingle();
  if (allowedHost.error || !allowedHost.data) return null;
  const launch = parseGameLaunchTarget({
    type: "external_https", url: entry.data.external_url, host: entry.data.external_allowed_host
  }, [allowedHost.data.hostname]);
  if (!launch || launch.type !== "external_https") return null;
  return {
    id: entry.data.id,
    resourceId: entry.data.resource_id,
    packageId: entry.data.package_id,
    stableKey: entry.data.stable_key,
    slug: entry.data.slug,
    title: entry.data.title,
    description: entry.data.description,
    launch,
    thumbnailReference: entry.data.thumbnail_reference,
    recommendedGradeMin: entry.data.recommended_grade_min,
    recommendedGradeMax: entry.data.recommended_grade_max,
    skills: textArray(entry.data.skills),
    topics: textArray(entry.data.topics),
    tags: textArray(entry.data.tags),
    difficulty: entry.data.difficulty,
    version: entry.data.version,
    status: entry.data.status as ExternalGameLaunchRecord["status"]
  };
}

export function gamePlayHref(game: PublicGame): string {
  if (game.launch.type === "canonical") return game.launch.route;
  if (game.launch.type === "external_https") return `/games/${game.slug}/launch`;
  return `/games/${game.slug}`;
}
