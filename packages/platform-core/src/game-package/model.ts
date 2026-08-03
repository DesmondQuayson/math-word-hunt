export const GAME_PACKAGE_SCHEMA_VERSION = "1.0" as const;
export const MATHNEXA_RUNTIME_VERSION = "1.0.0" as const;

export type GamePackageManifest = Readonly<{
  packageSchemaVersion: typeof GAME_PACKAGE_SCHEMA_VERSION;
  gameId: string;
  version: string;
  title: string;
  description: string;
  grade: number;
  topic: string;
  lesson: string;
  entryFile: string;
  thumbnail: string;
  assetInventory: readonly string[];
  integrityHashes: Readonly<Record<string, string>>;
  minimumMathNexaRuntimeVersion: string;
}>;

export type GamePackageAsset = Readonly<{ path: string; bytes: Uint8Array }>;
export type GamePackageInspection = Readonly<{
  decision: "accepted" | "quarantined";
  manifest: GamePackageManifest | null;
  metadata: Readonly<Record<string, unknown>> | null;
  findings: readonly string[];
}>;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEMVER = /^(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})$/;
const SHA256 = /^[a-f0-9]{64}$/;
const ALLOWED_EXTENSIONS = new Set(["html", "js", "mjs", "css", "json", "png", "jpg", "jpeg", "webp", "gif", "mp3", "ogg", "wav", "m4a", "woff", "woff2"]);

export function normalizeGameAssetPath(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 1 || value.length > 240 || value !== value.normalize("NFC")) return null;
  if (value.includes("\\") || value.includes("\0") || value.startsWith("/") || /^[a-z]:/i.test(value) || /[\u0000-\u001f\u007f]/.test(value)) return null;
  const parts = value.split("/");
  if (parts.some((part) => !part || part === "." || part === ".." || part.length > 96)) return null;
  if (!parts.every((part) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(part))) return null;
  return parts.join("/");
}

export function compareGamePackageVersions(left: string, right: string): number | null {
  const a = SEMVER.exec(left); const b = SEMVER.exec(right);
  if (!a || !b) return null;
  for (let index = 1; index <= 3; index += 1) {
    const difference = Number(a[index]) - Number(b[index]);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

function text(value: unknown, maximum: number): string | null {
  return typeof value === "string" && value === value.trim() && value.length >= 1 && value.length <= maximum ? value : null;
}

export function parseGamePackageManifest(value: unknown): GamePackageManifest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const exactKeys = ["package_schema_version", "game_id", "version", "title", "description", "grade", "topic", "lesson", "entry_file", "thumbnail", "asset_inventory", "integrity_hashes", "minimum_mathnexa_runtime_version"];
  if (Object.keys(source).sort().join("|") !== [...exactKeys].sort().join("|")) return null;
  const gameId = typeof source.game_id === "string" && SLUG.test(source.game_id) && source.game_id.length <= 64 ? source.game_id : null;
  const version = typeof source.version === "string" && SEMVER.test(source.version) ? source.version : null;
  const title = text(source.title, 160); const description = text(source.description, 4000);
  const grade = Number.isInteger(source.grade) && Number(source.grade) >= 1 && Number(source.grade) <= 9 ? Number(source.grade) : null;
  const topic = text(source.topic, 120); const lesson = text(source.lesson, 160);
  const entryFile = normalizeGameAssetPath(source.entry_file); const thumbnail = normalizeGameAssetPath(source.thumbnail);
  const minimum = typeof source.minimum_mathnexa_runtime_version === "string" && SEMVER.test(source.minimum_mathnexa_runtime_version) ? source.minimum_mathnexa_runtime_version : null;
  if (!gameId || !version || !title || !description || !grade || !topic || !lesson || !entryFile || !thumbnail || !minimum) return null;
  if (!entryFile.startsWith("game/") || !entryFile.endsWith(".html") || thumbnail !== "thumbnail.png") return null;
  if (!Array.isArray(source.asset_inventory) || source.asset_inventory.length < 3 || source.asset_inventory.length > 255) return null;
  const inventory = source.asset_inventory.map(normalizeGameAssetPath);
  if (inventory.some((path) => !path)) return null;
  const paths = inventory as string[];
  if (new Set(paths.map((path) => path.toLocaleLowerCase("en-US"))).size !== paths.length || !paths.includes(entryFile) || !paths.includes(thumbnail) || !paths.includes("metadata.json")) return null;
  if (!source.integrity_hashes || typeof source.integrity_hashes !== "object" || Array.isArray(source.integrity_hashes)) return null;
  const hashes = source.integrity_hashes as Record<string, unknown>;
  if (Object.keys(hashes).length !== paths.length || paths.some((path) => typeof hashes[path] !== "string" || !SHA256.test(hashes[path] as string))) return null;
  if (Object.keys(hashes).some((path) => !paths.includes(path))) return null;
  if (paths.some((path) => {
    const extension = path.split(".").at(-1)?.toLowerCase() ?? "";
    return !ALLOWED_EXTENSIONS.has(extension) || /(^|\/)(?:package\.json|node_modules)(?:\/|$)/i.test(path);
  })) return null;
  return Object.freeze({ packageSchemaVersion: GAME_PACKAGE_SCHEMA_VERSION, gameId, version, title, description, grade, topic, lesson,
    entryFile, thumbnail, assetInventory: Object.freeze(paths), integrityHashes: Object.freeze(Object.fromEntries(paths.map((path) => [path, hashes[path] as string]))), minimumMathNexaRuntimeVersion: minimum });
}

function inspectTextAsset(path: string, bytes: Uint8Array): string[] {
  if (!/\.(?:html|js|mjs|css|json)$/i.test(path)) return [];
  let source: string;
  try { source = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return ["invalid-utf8-text-asset"]; }
  if (source.length > 5_000_000) return ["oversized-text-asset"];
  const findings: string[] = [];
  if (/\beval\s*\(|\bnew\s+Function\b|WebAssembly|SharedArrayBuffer|serviceWorker|sendBeacon|document\.cookie|\b(?:localStorage|sessionStorage)\b/i.test(source)) findings.push("dynamic-or-privileged-code");
  if (/https?:\/\/|wss?:\/\/|javascript\s*:/i.test(source)) findings.push("external-network-reference");
  if (/\.html$/i.test(path)) {
    if (/<(?:iframe|object|embed|base|form)\b/i.test(source)) findings.push("prohibited-html-element");
    if (/<script\b(?![^>]*\bsrc\s*=)[^>]*>/i.test(source) || /\son[a-z]+\s*=/i.test(source)) findings.push("inline-executable-html");
  }
  return findings;
}

export async function inspectGamePackage(input: Readonly<{ manifestJson: unknown; metadataJson: unknown; assets: readonly GamePackageAsset[] }>): Promise<GamePackageInspection> {
  const findings: string[] = [];
  const manifest = parseGamePackageManifest(input.manifestJson);
  if (!manifest) return Object.freeze({ decision: "quarantined", manifest: null, metadata: null, findings: Object.freeze(["invalid-manifest"]) });
  const metadata = input.metadataJson && typeof input.metadataJson === "object" && !Array.isArray(input.metadataJson) ? input.metadataJson as Record<string, unknown> : null;
  if (!metadata || JSON.stringify(metadata).length > 16_384 || ["scripts", "hooks", "postinstall", "preinstall"].some((key) => key in (metadata ?? {}))) findings.push("invalid-metadata");
  const byPath = new Map(input.assets.map((asset) => [normalizeGameAssetPath(asset.path), asset.bytes]));
  if (byPath.has(null) || byPath.size !== input.assets.length || byPath.size !== manifest.assetInventory.length) findings.push("asset-inventory-mismatch");
  const crypto = globalThis.crypto?.subtle;
  if (!crypto) findings.push("sha256-unavailable");
  for (const path of manifest.assetInventory) {
    const bytes = byPath.get(path);
    if (!bytes || bytes.byteLength < 1 || bytes.byteLength > 20 * 1024 * 1024) { findings.push(`missing-or-oversized:${path}`); continue; }
    if (crypto) {
      const copy = new ArrayBuffer(bytes.byteLength); new Uint8Array(copy).set(bytes);
      const digest = [...new Uint8Array(await crypto.digest("SHA-256", copy))].map((value) => value.toString(16).padStart(2,"0")).join("");
      if (digest !== manifest.integrityHashes[path]) findings.push(`checksum-mismatch:${path}`);
    }
    findings.push(...inspectTextAsset(path, bytes).map((finding) => `${finding}:${path}`));
  }
  const runtimeComparison = compareGamePackageVersions(manifest.minimumMathNexaRuntimeVersion, MATHNEXA_RUNTIME_VERSION);
  if (runtimeComparison !== null && runtimeComparison > 0) findings.push("runtime-version-too-new");
  return Object.freeze({ decision: findings.length ? "quarantined" : "accepted", manifest, metadata: metadata ? Object.freeze(metadata) : null, findings: Object.freeze(findings) });
}
