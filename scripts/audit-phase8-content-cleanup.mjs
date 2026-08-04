import { readFileSync } from "node:fs";

import {
  PHASE8_MANAGED_BUCKET_IDS,
  buildFallbackBucketDeleteSql,
  buildTargetedCleanupSql
} from "./phase8-content-cleanup-contract.mjs";

const runner = readFileSync("scripts/run-phase8-content-staging.mjs", "utf8");
const wrapper = readFileSync("scripts/invoke-phase8-content-staging.ps1", "utf8");
const auditRunId = "a".repeat(32);
const targeted = buildTargetedCleanupSql(auditRunId, {
  projectRef: "gcmuhzxkwvfireyrearl",
  runId: auditRunId,
  startedAt: "2026-08-04T12:00:00.000Z",
  frozenAt: "2026-08-04T12:10:00.000Z",
  auditRows: [{ id: "11111111-1111-4111-8111-111111111111", target: "22222222-2222-4222-8222-222222222222" }]
});
const fallback = buildFallbackBucketDeleteSql();

function requireMatch(value, pattern, message) {
  if (!pattern.test(value)) throw new Error(message);
}

function rejectMatch(value, pattern, message) {
  if (pattern.test(value)) throw new Error(message);
}

requireMatch(runner, /gcmuhzxkwvfireyrearl/, "Hosted cleanup must remain pinned to isolated staging Supabase.");
requireMatch(runner, /mathnexa-platform-staging/, "Hosted cleanup must remain pinned to isolated staging Vercel.");
rejectMatch(runner, /hdtnbuowvdjwnkdqtdbv|mathnexa-platform-production/, "Hosted cleanup must not name Production resources.");
rejectMatch(wrapper, /SUPABASE_PRODUCTION|STRIPE_|RESEND_/, "Cleanup wrapper must not load Production, billing, or email credentials.");
rejectMatch(targeted, /delete from public\.(billing_|products|commercial_)/i, "Targeted cleanup must never delete billing, product, or commercial rows.");
rejectMatch(targeted, /delete from auth\.users/i, "Database cleanup must leave Auth deletion to the scoped Admin API.");
rejectMatch(targeted, /delete from public\.admin_audit_log where admin_user_id/i, "Audit cleanup must never use actor-only deletion.");
requireMatch(targeted, /delete from public\.admin_audit_log audit using phase8_cleanup_audits/, "Audit cleanup must use the exact captured ID allowlist.");
requireMatch(targeted, /phase8_cleanup_audit_allowlist_mismatch/, "Audit cleanup must fail closed on ambiguous rows.");
requireMatch(targeted, /allowed\.actor_bound and audit\.admin_user_id in/, "Targetless audit cleanup must require the exact synthetic actor.");
requireMatch(targeted, /not allowed\.actor_bound and audit\.admin_user_id is null/, "Entity-bound audit cleanup must preserve null-actor isolation.");
rejectMatch(fallback, /delete from storage\.objects/i, "Fallback must require object cleanup before bucket-definition repair.");
rejectMatch(fallback, /delete from storage\.buckets\s*;/i, "Fallback bucket deletion must always be allowlisted.");
for (const id of PHASE8_MANAGED_BUCKET_IDS) requireMatch(fallback, new RegExp(`'${id}'`), `Fallback is missing ${id}.`);
requireMatch(runner, /supabase_migrations\.schema_migrations/, "Hosted cleanup must verify the migration ledger.");
requireMatch(runner, /where version = '20260804020000'/, "Hosted cleanup must require the complete Phase 8 migration.");
requireMatch(runner, /for \(const bucketId of PHASE8_MANAGED_BUCKET_IDS\)/, "Hosted fallback must iterate only the managed bucket allowlist.");
requireMatch(runner, /admin\.storage\.deleteBucket\(bucketId\)/, "Hosted fallback must use the provider-supported Storage API.");
requireMatch(runner, /item\.meta\?\.candidateTree === candidateTree/, "Hosted runner must reuse only an exact candidate-tree deployment.");
requireMatch(runner, /assertUnchangedFingerprint/, "Hosted cleanup must preserve sanitized unrelated-data fingerprints.");
requireMatch(runner, /targetedCleanup\(runId/, "Hosted cleanup must be bound to a unique run ID.");
requireMatch(runner, /cleanupToZero/, "Hosted cleanup must prove empty managed buckets.");

console.log("Phase 8 content cleanup security audit passed: staging pinning, run scoping, allowlisted fallback, unrelated-data fingerprints, and billing/Production exclusions are enforced.");
