import "server-only";

import { createServiceSupabaseClient } from "@/lib/supabase/service";

export type AdminGameItem = Readonly<{
  id: string;
  catalogId: string | null;
  packageId: string | null;
  resourceId: string | null;
  stableKey: string;
  slug: string;
  title: string;
  description: string;
  launchType: "canonical" | "hosted_package" | "external_https" | "internal";
  status: string;
  version: string;
  displayOrder: number;
  thumbnailReference: string;
  recommendedGradeMin: number | null;
  recommendedGradeMax: number | null;
  skills: readonly string[];
  topics: readonly string[];
  tags: readonly string[];
  difficulty: string;
  externalUrl: string | null;
  allowedHost: string | null;
  lockVersion: number;
  packageLockVersion: number;
  assetCount: number;
  updatedAt: string;
  history: readonly Readonly<{ id: string; versionNumber: number; status: string; launchType: string; createdAt: string }>[];
  packageHistory: readonly Readonly<{ id: string; version: string; status: string; createdAt: string }>[];
}>;

export type AdminGamePackageSnapshot = Readonly<{
  state: "ready" | "unavailable";
  games: readonly AdminGameItem[];
}>;

function strings(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export async function loadAdminGamePackages(): Promise<AdminGamePackageSnapshot> {
  const client = createServiceSupabaseClient();
  if (!client) return { state: "unavailable", games: [] };
  const [catalog, catalogVersions, packages] = await Promise.all([
    client.from("game_catalog_entries").select("id,resource_id,package_id,stable_key,slug,title,description,launch_type,external_url,external_allowed_host,thumbnail_reference,recommended_grade_min,recommended_grade_max,skills,topics,tags,difficulty,status,display_order,version,lock_version,updated_at").order("display_order").order("title"),
    client.from("game_catalog_entry_versions").select("id,catalog_entry_id,version_number,snapshot,created_at").order("version_number", { ascending: false }),
    client.from("game_packages").select("id,resource_id,resource_version_number,game_id,package_version,publication_state,entry_file,source_package_id,created_at").order("created_at", { ascending: false })
  ]);
  if (catalog.error || catalogVersions.error || packages.error) return { state: "unavailable", games: [] };
  const resourceIds = [...new Set((packages.data ?? []).map((item) => item.resource_id))];
  const packageIds = (packages.data ?? []).map((item) => item.id);
  const [resources, versions, assets] = await Promise.all([
    resourceIds.length ? client.from("content_resources").select("id,lock_version").in("id", resourceIds) : Promise.resolve({ data: [], error: null }),
    resourceIds.length ? client.from("content_resource_versions").select("resource_id,version_number,title,description,tags,content_manifest").in("resource_id", resourceIds) : Promise.resolve({ data: [], error: null }),
    packageIds.length ? client.from("game_package_assets").select("package_id").in("package_id", packageIds) : Promise.resolve({ data: [], error: null })
  ]);
  if (resources.error || versions.error || assets.error) return { state: "unavailable", games: [] };
  const catalogPackageIds = new Set((catalog.data ?? []).flatMap((item) => item.package_id ? [item.package_id] : []));
  const catalogItems: AdminGameItem[] = (catalog.data ?? []).map((item) => ({
    id: item.id,
    catalogId: item.id,
    packageId: item.package_id,
    resourceId: item.resource_id,
    stableKey: item.stable_key,
    slug: item.slug,
    title: item.title,
    description: item.description,
    launchType: item.launch_type as AdminGameItem["launchType"],
    status: item.status,
    version: item.version,
    displayOrder: item.display_order,
    thumbnailReference: item.thumbnail_reference,
    recommendedGradeMin: item.recommended_grade_min,
    recommendedGradeMax: item.recommended_grade_max,
    skills: strings(item.skills),
    topics: strings(item.topics),
    tags: strings(item.tags),
    difficulty: item.difficulty,
    externalUrl: item.external_url,
    allowedHost: item.external_allowed_host,
    lockVersion: Number(item.lock_version),
    packageLockVersion: Number((resources.data ?? []).find((resource) => resource.id === item.resource_id)?.lock_version ?? 0),
    assetCount: (assets.data ?? []).filter((asset) => asset.package_id === item.package_id).length,
    updatedAt: item.updated_at,
    history: (catalogVersions.data ?? []).filter((version) => version.catalog_entry_id === item.id).map((version) => ({
      id: version.id,
      versionNumber: version.version_number,
      status: typeof version.snapshot === "object" && version.snapshot && "status" in version.snapshot ? String(version.snapshot.status) : "draft",
      launchType: typeof version.snapshot === "object" && version.snapshot && "launch_type" in version.snapshot ? String(version.snapshot.launch_type) : "unknown",
      createdAt: version.created_at
    })),
    packageHistory: (packages.data ?? []).filter((entry) => entry.resource_id === item.resource_id).map((entry) => ({
      id: entry.id, version: entry.package_version, status: entry.publication_state, createdAt: entry.created_at
    }))
  }));
  const draftPackages: AdminGameItem[] = (packages.data ?? []).filter((item) => !catalogPackageIds.has(item.id)).map((item) => {
    const version = (versions.data ?? []).find((entry) => entry.resource_id === item.resource_id && entry.version_number === item.resource_version_number);
    const manifest = version?.content_manifest && typeof version.content_manifest === "object" && !Array.isArray(version.content_manifest) ? version.content_manifest as Record<string, unknown> : {};
    return {
      id: item.id,
      catalogId: null,
      packageId: item.id,
      resourceId: item.resource_id,
      stableKey: item.game_id,
      slug: item.game_id,
      title: version?.title ?? item.game_id,
      description: version?.description ?? "",
      launchType: "hosted_package" as const,
      status: item.publication_state,
      version: item.package_version,
      displayOrder: typeof manifest.display_order === "number" ? manifest.display_order : 1,
      thumbnailReference: "package:thumbnail.png",
      recommendedGradeMin: typeof manifest.recommended_grade_min === "number" ? manifest.recommended_grade_min : null,
      recommendedGradeMax: typeof manifest.recommended_grade_max === "number" ? manifest.recommended_grade_max : null,
      skills: strings(manifest.skills),
      topics: strings(manifest.topics),
      tags: strings(version?.tags),
      difficulty: typeof manifest.difficulty === "string" ? manifest.difficulty : "core",
      externalUrl: null,
      allowedHost: null,
      lockVersion: 0,
      packageLockVersion: Number((resources.data ?? []).find((resource) => resource.id === item.resource_id)?.lock_version ?? 0),
      assetCount: (assets.data ?? []).filter((asset) => asset.package_id === item.id).length,
      updatedAt: item.created_at,
      history: [],
      packageHistory: (packages.data ?? []).filter((entry) => entry.resource_id === item.resource_id).map((entry) => ({
        id: entry.id, version: entry.package_version, status: entry.publication_state, createdAt: entry.created_at
      }))
    };
  });
  return { state: "ready", games: [...catalogItems, ...draftPackages] };
}
