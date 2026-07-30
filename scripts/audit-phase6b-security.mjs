import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

function source(path) { return readFileSync(path, "utf8"); }
function requireAll(path, values) {
  const text = source(path);
  for (const value of values) if (!text.includes(value)) throw new Error(path + " is missing required Phase 6B control: " + value);
  return text;
}

const tracked = execFileSync("git", ["-c", "core.excludesFile=NUL", "ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
const productionSources = tracked.filter((path) => /^(?:apps|packages|scripts|supabase\/migrations)\/.+\.(?:ts|tsx|js|mjs|sql)$/.test(path) && !/(?:\.test\.|^e2e\/)/.test(path));

const server = requireAll("apps/platform-web/lib/pilot/server.ts", [
  "MVH_PILOT_STATE", "MVH_PILOT_OWNER_GO", "MVH_PILOT_START_AT", "MVH_PILOT_END_AT",
  "MVH_PILOT_SUPPORT_CHANNEL", "MVH_PILOT_AUTH_EMAIL_VERIFIED", "MVH_PILOT_HUMAN_ACCESS"
]);
if (/NEXT_PUBLIC_MVH_PILOT|cookies\(|localStorage|searchParams/.test(server)) throw new Error("Browser-controlled pilot activation authority detected.");

const activation = requireAll("packages/platform-core/src/pilot/activation.ts", [
  "pilot_activation_configuration_missing", "pilot_environment_unsupported", "transactionalAuthEmailVerified",
  "activationAllowed: false", "activationAllowed: true", "pilot_prerequisite_missing"
]);
for (const provider of ["next/", "react", "supabase", "stripe", "vercel", "window.", "localStorage"]) {
  if (activation.toLowerCase().includes(provider.toLowerCase())) throw new Error("Provider/framework dependency detected in activation contract: " + provider);
}

const email = requireAll("apps/platform-web/lib/email/server.ts", [
  "disabled", "local-capture", "transactional-configured", "transactional-verified", "If that teacher account exists"
]);
if (/recipient|smtp|password|secret|api.?key/i.test(email)) throw new Error("Email status copy contains provider credential or recipient concepts.");

const signUp = source("apps/platform-web/components/forms/auth-forms.tsx");
const profile = source("apps/platform-web/components/forms/teacher-data-forms.tsx");
if (/name="schoolLabel"|autoComplete="organization"|id="profile-school"/.test(signUp + "\n" + profile)) throw new Error("Organization-label input remains in a controlled-pilot form.");
requireAll("apps/platform-web/app/auth-actions.ts", ["School and organization labels are not accepted", "display_name: displayName"]);
requireAll("apps/platform-web/app/teacher-actions.ts", ["School and organization labels cannot be saved"]);
const repository = source("apps/platform-web/lib/repositories/teacher-profile.repository.ts");
const updateBody = repository.slice(repository.indexOf("async save("));
if (/school_or_organization_label\s*:/.test(updateBody)) throw new Error("Profile repository can still write an organization label.");

const migration = requireAll("supabase/migrations/20260729180000_phase6b_controlled_pilot.sql", [
  "reject_controlled_pilot_organization_label", "organization_labels_prohibited_during_controlled_pilot",
  "revoke update (school_or_organization_label)", "school_or_organization_label,\n    account_status"
]);
if (!migration.includes("requested_display_name")) throw new Error("Minimum profile provisioning was not retained.");

const callback = source("apps/platform-web/app/auth/callback/route.ts");
const redirect = source("apps/platform-web/lib/auth/safe-redirect.ts");
if (!callback.includes("safeInternalRedirect") || !redirect.includes("allowedDestinations") || !redirect.includes("allowedDestinations.has(value)")) throw new Error("Auth callback redirect allowlisting is absent.");

const runner = source("scripts/run-phase6b-e2e.mjs");
for (const value of ['BILLING_ENABLED: "false"', 'BILLING_CHECKOUT_ENABLED: "false"', 'BILLING_PORTAL_ENABLED: "false"', 'BILLING_WEBHOOK_ENABLED: "false"', 'BILLING_EMERGENCY_DEFAULT_DENY: "true"']) {
  if (!runner.includes(value)) throw new Error("Phase 6B runner is missing billing denial: " + value);
}
if (!runner.includes('MVH_EMAIL_DELIVERY: "local-capture"')) throw new Error("Local Phase 6B verification could send external email.");

const manifests = ["package.json", "apps/platform-web/package.json", "packages/platform-core/package.json"].map(source).join("\n");
if (/"(?:@vercel\/analytics|posthog-js|mixpanel-browser|@segment\/|@amplitude\/|@fullstory\/|hotjar|clarity-js|resend|sendgrid|mailgun|postmark|nodemailer)"/i.test(manifests)) {
  throw new Error("Analytics, session replay, or external email dependency detected.");
}

const schema = tracked.filter((path) => path.startsWith("supabase/migrations/") && path.endsWith(".sql")).map(source).join("\n");
if (/\b(?:student_(?:name|email|id|identifier|work)|roster|iep_)\b/i.test(schema)) throw new Error("Student persistence field detected.");

for (const path of productionSources) {
  const text = source(path);
  if (/(?:sk|pk)_live_[A-Za-z0-9]{16,}|whsec_[A-Za-z0-9]{24,}/.test(text)) throw new Error("Live credential-like value detected: " + path);
}

console.log("Phase 6B security audit passed: " + tracked.length + " files reviewed; activation is server-owned and fail-closed, Auth email states are truthful, organization-label writes are denied, and no billing, analytics, student persistence, or live credential was detected.");
