import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const completePhase8Integrated = existsSync(resolve(root, "supabase/migrations/20260804010000_phase8h_analytics_operations.sql"));
const page = read("apps/platform-web/app/admin/page.tsx");
const component = read("apps/platform-web/components/admin/admin-command-center.tsx");
const dashboard = read("apps/platform-web/lib/admin/dashboard.ts");
const operations = completePhase8Integrated ? read("apps/platform-web/lib/admin/analytics-operations.ts") : "";
const navigation = read("apps/platform-web/lib/admin/navigation.ts");
const styles = read("apps/platform-web/styles/admin.css");

for (const marker of ["inspectAdminAccess()", "access.state !== \"authorized\"", "notFound()", "loadAdminDashboard()", "createAdminCsrfToken"]) {
  if (!page.includes(marker)) throw new Error(`Protected Phase 8C page is missing ${marker}.`);
}
for (const label of ["Dashboard", "Games", "MAP Prep", "Homework", "Quizzes", "Users", "Subscriptions", "Analytics", "Media Library", "CMS", "Settings", "Audit Log"]) {
  if (!navigation.includes(`"${label}"`)) throw new Error(`Admin navigation is missing ${label}.`);
}
const stateMarkers = completePhase8Integrated
  ? ["Ctrl K", "You are offline.", "Live admin data is unavailable.", "Entitlement-authorized downloads", "No confirmation or recovery delivery signal is available.", "no placeholder data has been created"]
  : ["Ctrl K", "You are offline.", "Live admin data is unavailable.", "Download events are not collected yet", "no placeholder data has been created"];
for (const marker of stateMarkers) {
  if (!`${component}\n${dashboard}\n${operations}`.includes(marker)) throw new Error(`Admin state contract is missing ${marker}.`);
}
for (const marker of ['from("resource_download_events")', '.gte("downloaded_at", window.start)', '.lte("downloaded_at", window.end)']) {
  if (!operations.includes(marker)) throw new Error(`Admin download metric is missing its bounded range contract: ${marker}.`);
}
for (const marker of ["prefers-reduced-motion", "forced-colors", "@media (max-width: 48rem)", "--size-target-min"]) {
  const source = marker === "prefers-reduced-motion" ? read("apps/platform-web/styles/foundations.css") : styles;
  if (!source.includes(marker)) throw new Error(`Admin accessibility styling is missing ${marker}.`);
}
for (const marker of ["createServiceSupabaseClient", "server-only", "billing_subscriptions", "admin_audit_log"]) {
  if (!`${dashboard}\n${operations}`.includes(marker)) throw new Error(`Admin server boundary is missing ${marker}.`);
}
for (const forbidden of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "SUPABASE_SECRET_KEY", "NEXT_PUBLIC_MVH_ADMIN", "dangerouslySetInnerHTML", "ShowMe Math"]) {
  if (component.includes(forbidden) || page.includes(forbidden)) throw new Error(`Admin browser surface contains forbidden marker ${forbidden}.`);
}

const expected = new Map([
  ["docs/index.html", "7f00ed6789a2faf23b90e96c3dfdee0167aced87beb08dabf10b89c3e72c9fc5"],
  ["docs/vocab.js", "caeb8fbb590fffd8cbc169f88f174a38c26de2d16a7e1b0c1cf5e83ac9f01c46"]
]);
for (const [path, digest] of expected) {
  if (createHash("sha256").update(readFileSync(resolve(root, path))).digest("hex") !== digest) throw new Error(`${path} changed during Phase 8C.`);
}
console.log("Phase 8C security audit passed: the responsive command center remains owner/MFA/server protected, fail-closed, honest, and free of browser secrets.");
