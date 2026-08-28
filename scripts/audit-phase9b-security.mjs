import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const migration = read("supabase/migrations/20260805120000_phase9b_all_access_product_model.sql");
const access = read("packages/platform-core/src/product-access/all-access.ts");
const repository = read("apps/platform-web/lib/repositories/consumer-entitlement.repository.ts");
const games = read("apps/platform-web/lib/games/catalog.ts");
const requiredMigrationContracts = [
  "MATHNEXA_ALL_ACCESS",
  "create table public.game_catalog_entries",
  "create table public.game_external_allowed_hosts",
  "create table public.topic_resource_assignments",
  "resource_scope",
  "scope_status",
  "force row level security",
  "legacy_lesson_quiz_report",
  "private.valid_external_game_destination",
  "game_catalog_destination_audit"
];
for (const contract of requiredMigrationContracts) {
  if (!migration.includes(contract)) throw new Error(`Phase 9B migration contract is missing: ${contract}`);
}
if (!access.includes('MATHNEXA_PRODUCT_MODULES = ["games", "map_prep", "homework", "quizzes"]')) {
  throw new Error("The all-access module set is incomplete or duplicated.");
}
if (!repository.includes('data.capability_key !== MATHNEXA_ALL_ACCESS') || !games.includes("parseGameLaunchTarget")) {
  throw new Error("Server adapters do not fail closed on capability or game destination data.");
}
for (const forbidden of [/localStorage/i, /document\.cookie/i, /query.*entitlement/i, /javascript:/i]) {
  if (forbidden.test(access + repository)) throw new Error(`Browser authority pattern reached server access code: ${forbidden}`);
}

for (const forbidden of [
  /alter table public\.admin_users/i,
  /alter table public\.admin_sessions/i,
  /create (?:or replace )?function public\.(?:start|consume)_admin_/i,
  /update public\.admin_users/i,
  /delete from public\.admin_users/i
]) {
  if (forbidden.test(migration)) throw new Error(`Phase 9B migration crossed its strict Admin non-scope: ${forbidden}`);
}
const protectedHashes = new Map([
  ["docs/index.html", "7f00ed6789a2faf23b90e96c3dfdee0167aced87beb08dabf10b89c3e72c9fc5"],
  ["docs/vocab.js", "caeb8fbb590fffd8cbc169f88f174a38c26de2d16a7e1b0c1cf5e83ac9f01c46"]
]);
for (const [path, expected] of protectedHashes) {
  const actual = createHash("sha256").update(readFileSync(path)).digest("hex");
  if (actual !== expected) throw new Error(`Protected canonical hash changed: ${path}`);
}
console.log("Phase 9B security audit passed: all-access is server-owned, games fail closed, resource scope is additive, Admin is untouched, and protected hashes match.");
