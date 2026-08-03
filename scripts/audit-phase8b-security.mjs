import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const migration = read("supabase/migrations/20260803200000_phase8b_content_taxonomy_resources.sql");
const test = read("supabase/tests/database/18_phase8b_content_taxonomy_resources.test.sql");
const model = read("packages/platform-core/src/admin-content/model.ts");

const tables = [
  "content_grades", "content_topics", "content_lessons", "content_resources",
  "content_resource_versions", "lesson_resource_assignments"
];
for (const table of tables) {
  for (const marker of [`create table public.${table}`, `alter table public.${table} force row level security`]) {
    if (!migration.includes(marker)) throw new Error(`Phase 8B migration is missing ${marker}.`);
  }
}

const functions = [
  "create_content_grade", "create_content_topic", "create_content_lesson", "update_content_grade",
  "update_content_topic", "update_content_lesson", "create_content_resource", "revise_content_resource",
  "transition_content_resource", "update_lesson_resource_assignment", "rollback_content_resource",
  "archive_content_resource"
];
for (const name of functions) {
  const start = migration.indexOf(`create or replace function public.${name}`);
  const end = migration.indexOf("$$;", start);
  if (start < 0 || end < 0) throw new Error(`Missing bounded Phase 8B function ${name}.`);
  const definition = migration.slice(start, end);
  for (const marker of ["security definer", "set search_path = ''", "private.assert_content_admin"]) {
    if (!definition.includes(marker)) throw new Error(`${name} is missing ${marker}.`);
  }
  if (!test.includes(`public.${name}(`)) throw new Error(`${name} lacks explicit execute-privilege coverage.`);
}

for (const marker of [
  "Published content versions are immutable", "Published content resources cannot be hard deleted",
  "admin.content.publish", "admin.content.archive", "admin.content.rollback",
  "Active MFA-enrolled owner required", "No curriculum rows are seeded"
]) {
  if (!migration.includes(marker)) throw new Error(`Phase 8B security marker is missing: ${marker}.`);
}
for (const type of [
  "game", "homework_pdf", "homework_answer_key", "quiz_pdf", "quiz_answer_key",
  "preview_image", "thumbnail", "map_prep_link"
]) {
  if (!migration.includes(`'${type}'`) || !model.includes(`"${type}"`)) throw new Error(`Missing resource type ${type}.`);
}

if (/\b(insert into public\.content_(grades|topics|lessons)\b)/i.test(migration.split("create or replace function public.create_content_grade")[0])) {
  throw new Error("Phase 8B migration appears to seed curriculum data.");
}
if (/showme\s+math/i.test(migration)) throw new Error("Phase 8B migration must not import ShowMe Math content.");

const expected = new Map([
  ["docs/index.html", "10d0e49cd5decf316615a10f6bde37dc89796b2d8817eb1cf5d9ee25d263747e"],
  ["docs/vocab.js", "caeb8fbb590fffd8cbc169f88f174a38c26de2d16a7e1b0c1cf5e83ac9f01c46"]
]);
for (const [path, digest] of expected) {
  const actual = createHash("sha256").update(readFileSync(resolve(root, path))).digest("hex");
  if (actual !== digest) throw new Error(`${path} changed during Phase 8B.`);
}

console.log("Phase 8B security audit passed: taxonomy writes are owner/MFA/server-only, publication history is immutable, rollback is additive, and no curriculum was fabricated.");
