import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const nativeRoot = join(root, "apps/platform-web/public/internal-games/number-logic");

function assert(condition, message) {
  if (!condition) throw new Error(`Number Logic integration audit failed: ${message}`);
}

function files(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

const renderer = readFileSync(join(root, "apps/platform-web/features/games/number-logic/document.ts"), "utf8");
const registry = readFileSync(join(root, "apps/platform-web/lib/games/internal-registry.ts"), "utf8");
const migration = readFileSync(join(root, "supabase/migrations/20260809100000_number_logic_internal_game.sql"), "utf8");
const bundle = readFileSync(join(nativeRoot, "assets/index-Dk-vovPM.js"), "utf8");

assert(registry.includes('"number-logic"'), "trusted registry key is absent");
assert(renderer.includes('<base href="${ASSET_BASE}"'), "fixed same-origin asset base is absent");
assert(!renderer.includes("iframe"), "renderer contains an iframe");
assert(!renderer.includes("http://") && !renderer.includes("https://"), "renderer contains a remote destination");
assert(migration.includes("'internal','builtin:number-logic'"), "catalog launch is not internal");
assert(migration.includes("'mixed','draft',31,'0.1.0'"), "catalog is not the approved 0.1.0 Draft");
assert((migration.match(/insert into public\.game_catalog_entries/g) ?? []).length === 1, "migration creates more than one catalog row");
assert(!bundle.includes("localhost"), "bundle contains a localhost reference");
assert(!bundle.includes("MATHNEXA_GAME_LAUNCH_SECRET"), "bundle contains a secret contract");

for (const path of files(nativeRoot)) {
  const extension = extname(path).toLowerCase();
  assert([".js", ".css", ".mp3"].includes(extension), `unapproved asset ${relative(nativeRoot, path)}`);
  assert(!/[.]map$|[.]zip$|[.]png$|[.]jpe?g$/i.test(path), `development or worksheet artifact ${relative(nativeRoot, path)}`);
}

for (const path of files(join(root, "apps/platform-web/.next/static"))) {
  const content = readFileSync(path);
  assert(!content.includes(Buffer.from("mathnexa:number-logic-progress:1")), `homepage/client chunk eagerly contains Number Logic: ${path}`);
}

console.log("Number Logic integration audit passed: one Internal Draft, fixed native route, no iframe/remote launch, approved asset types, no source artifacts, and no eager client bundle reference.");
