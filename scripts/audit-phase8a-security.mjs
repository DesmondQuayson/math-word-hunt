import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
function read(path) { return readFileSync(resolve(root, path), "utf8"); }
function requireAll(path, markers) {
  const value = read(path);
  for (const marker of markers) if (!value.includes(marker)) throw new Error(`${path} is missing Phase 8A marker: ${marker}`);
  return value;
}

const migration = requireAll("supabase/migrations/20260802200000_phase8a_admin_security_foundation.sql", [
  "create table public.admin_users", "create table public.admin_sessions", "create table public.admin_audit_log",
  "force row level security", "admin_audit_log is append-only", "public.revoke_admin_access", "admin-assets"
]);
for (const role of ["public", "anon", "authenticated"]) {
  if (!migration.includes(`from public, anon, authenticated`)) throw new Error(`${role} admin privilege revocation is missing.`);
}
requireAll("apps/platform-web/lib/admin/session.ts", [
  "supabase.auth.getUser()", "getAuthenticatorAssuranceLevel", "findAdminByUserId", "findSessionByHash"
]);
requireAll("apps/platform-web/app/admin/actions.ts", [
  "validateAdminMutationCsrf", "consumeRateLimit", "challengeAndVerify", "admin.login.failure", "admin.mfa.failure"
]);
requireAll("apps/platform-web/app/admin/page.tsx", [
  'dynamic = "force-dynamic"', 'access.state !== "authorized"', "notFound()"
]);
requireAll("apps/platform-web/proxy.ts", [
  'pathname.startsWith("/admin/")', 'response.headers.set("Cache-Control", "no-store")',
  'response.headers.set("X-Robots-Tag", "noindex, nofollow")'
]);
requireAll("apps/platform-web/next.config.mjs", [
  'source: "/admin"', 'source: "/admin/:path*"',
  '{ key: "Cache-Control", value: "no-store" }',
  '{ key: "X-Robots-Tag", value: "noindex, nofollow" }'
]);
requireAll("scripts/revoke-admin-access.mjs", [
  "--confirm-hosted-ref", "MVH_ADMIN_REVOCATION_APPROVAL", "revoke_admin_access", "--execute"
]);

const adminRoots = ["apps/platform-web/app/admin", "apps/platform-web/lib/admin", "apps/platform-web/components/admin"];
for (const directory of adminRoots) {
  const pending = [resolve(root, directory)];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = resolve(current, entry.name);
      if (entry.isDirectory()) pending.push(path);
      else {
        const source = readFileSync(path, "utf8");
        for (const forbidden of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "NEXT_PUBLIC_MVH_ADMIN", "console.log(", "console.error("]) {
          if (source.includes(forbidden)) throw new Error(`${path} contains forbidden admin-shell marker ${forbidden}.`);
        }
      }
    }
  }
}

const completePhase8Integrated = [
  "supabase/migrations/20260803200000_phase8b_content_taxonomy_resources.sql",
  "supabase/migrations/20260803210000_phase8d_pdf_resource_security.sql",
  "supabase/migrations/20260803220000_phase8e_game_package_importer.sql",
  "supabase/migrations/20260803230000_phase8f_cms_media_legal.sql",
  "supabase/migrations/20260804000000_phase8g_users_subscriptions.sql",
  "supabase/migrations/20260804010000_phase8h_analytics_operations.sql"
].every((path) => existsSync(resolve(root, path)));
const forbiddenFunctionalRoutes = completePhase8Integrated
  ? ["map-prep", "homework", "quizzes", "subscriptions"]
  : ["games", "map-prep", "homework", "quizzes", "users", "subscriptions", "analytics", "media", "cms", "settings", "audit-log"];
for (const route of forbiddenFunctionalRoutes) {
  if (existsSync(resolve(root, "apps/platform-web/app/admin", route))) throw new Error(`Functional admin route unexpectedly exists: ${route}`);
}

const expected = new Map([
  ["docs/index.html", "10d0e49cd5decf316615a10f6bde37dc89796b2d8817eb1cf5d9ee25d263747e"],
  ["docs/vocab.js", "caeb8fbb590fffd8cbc169f88f174a38c26de2d16a7e1b0c1cf5e83ac9f01c46"]
]);
for (const [path, digest] of expected) {
  const actual = createHash("sha256").update(readFileSync(resolve(root, path))).digest("hex");
  if (actual !== digest) throw new Error(`${path} changed during Phase 8A.`);
}
console.log("Phase 8A security audit passed: server-only authorization, MFA, sessions, audit, revocation, storage, and scope boundaries are present.");
