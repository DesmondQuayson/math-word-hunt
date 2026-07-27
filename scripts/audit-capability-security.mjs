import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const trackedAndNew = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" })
  .split(/\r?\n/).filter(Boolean);
const read = (path) => readFileSync(path, "utf8");

const coreCapabilityFiles = trackedAndNew.filter((path) => path.startsWith("packages/platform-core/src/capabilities/") && path.endsWith(".ts") && !path.endsWith(".test.ts"));
for (const path of coreCapabilityFiles) {
  const source = read(path);
  for (const [label, pattern] of [
    ["Stripe coupling", /stripe|price_[a-z0-9]|customer\.subscription/i],
    ["Supabase coupling", /supabase|postgrest/i],
    ["React or Next coupling", /from\s+["'](?:react|next(?:\/[^"']*)?)["']/i],
    ["browser state authority", /localStorage|sessionStorage|\bdocument\b|\bwindow\b/i]
  ]) if (pattern.test(source)) throw new Error(`${label} found in provider-independent capability core: ${path}`);
}

const serverAdapter = read("apps/platform-web/lib/capabilities/server.ts");
if (!serverAdapter.startsWith('import "server-only";')) throw new Error("Capability adapter must remain server-only");
for (const path of trackedAndNew.filter((candidate) => candidate.startsWith("apps/platform-web/") && /\.(?:ts|tsx)$/.test(candidate))) {
  const source = read(path);
  if (/^["']use client["'];/m.test(source) && /(?:@\/lib\/capabilities\/server|lib\/capabilities\/server)/.test(source)) {
    throw new Error(`Client module imports the server capability adapter: ${path}`);
  }
}

for (const path of ["apps/platform-web/lib/repositories/class.repository.ts", "apps/platform-web/lib/repositories/activity.repository.ts"]) {
  const source = read(path);
  if (/from\(["']teacher_(?:classes|activities)["']\)\.insert\(/.test(source)) throw new Error(`Constrained repository contains a direct insert bypass: ${path}`);
}

const actionSource = `${read("apps/platform-web/app/teacher-actions.ts")}\n${read("apps/platform-web/app/billing-actions.ts")}`;
for (const action of ["createClassAction", "archiveClassAction", "updateClassAction", "createActivityAction", "updateActivityAction", "archiveActivityAction", "startCheckoutAction", "openBillingPortalAction"]) {
  const start = actionSource.indexOf(`function ${action}`);
  if (start < 0 || actionSource.slice(start, start + 1800).indexOf("authorizeOwnedCapability") < 0) throw new Error(`Server mutation is missing centralized capability authorization: ${action}`);
}

for (const path of trackedAndNew.filter((candidate) => candidate.startsWith("apps/platform-web/app/") && candidate.endsWith(".tsx"))) {
  const source = read(path);
  if (/\b(?:isPro|hasPremium)\b/.test(source)) throw new Error(`Scattered plan authorization marker found: ${path}`);
  if (/localStorage|sessionStorage/.test(source) && /capabilit|entitlement|plan/i.test(source)) throw new Error(`Browser-controlled access state found: ${path}`);
}

console.log(`Capability security audit passed: ${coreCapabilityFiles.length} core definitions plus server actions, repositories, routes, and client boundaries inspected.`);
