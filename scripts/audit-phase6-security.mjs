import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

function requireText(path, values) {
  const source = readFileSync(path, "utf8");
  for (const value of values) if (!source.includes(value)) throw new Error(`${path} is missing required Phase 6 copy: ${value}`);
  return source;
}

const tracked = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
const sourceFiles = tracked.filter((path) => /\.(?:ts|tsx|mjs|js|sql|json|example)$/.test(path));

const manifests = ["package.json", "apps/platform-web/package.json", "packages/platform-core/package.json"].map((path) => readFileSync(path, "utf8")).join("\n");
if (/"(?:@vercel\/analytics|posthog-js|mixpanel-browser|@segment\/|@amplitude\/|@fullstory\/|hotjar|clarity-js|resend|sendgrid|mailgun|postmark|nodemailer)"/i.test(manifests)) {
  throw new Error("Analytics, session-replay, third-party feedback, or real-email dependency detected.");
}

const schema = tracked.filter((path) => path.startsWith("supabase/migrations/") && path.endsWith(".sql")).map((path) => readFileSync(path, "utf8")).join("\n");
if (/\b(?:student_(?:name|email|id|identifier|work)|roster|iep_)\b/i.test(schema)) throw new Error("Student-oriented persistence field detected.");

const appSources = sourceFiles.filter((path) => path.startsWith("apps/platform-web/")).map((path) => [path, readFileSync(path, "utf8")]);
for (const [path, source] of appSources) {
  if (/name=["'](?:studentName|studentEmail|studentId|studentIdentifier|roster|iep|studentWork)["']/i.test(source)) throw new Error(`Prohibited student field detected: ${path}`);
}

const feedback = requireText("apps/platform-web/components/pilot/pilot-feedback-form.tsx", ["Nothing has been sent or saved.", "navigator.clipboard.writeText", "checkPilotText"]);
for (const forbidden of ["fetch(", "localStorage", "sessionStorage", "<input type=\"file\"", "action="]) if (feedback.includes(forbidden)) throw new Error(`Feedback form contains persistence/delivery behavior: ${forbidden}`);

requireText("apps/platform-web/components/pilot/pilot-status-banner.tsx", ["Pilot inactive", "Adult teachers only", "No student data", "No billing", "data-pilot-activation"]);
requireText("apps/platform-web/app/pilot/privacy/page.tsx", ["not legal advice", "No final retention duration"]);
requireText("apps/platform-web/app/pilot/support/page.tsx", ["Contact the pilot coordinator using the channel through which pilot access was provided", "No support address", "response-time guarantee"]);
requireText("apps/platform-web/app/forgot-password/page.tsx", ["External recovery delivery is not active", "does not promise that an email will be delivered"]);
requireText("apps/platform-web/app/sign-in/page.tsx", ["Teacher-only access", "do not reveal whether an account exists"]);

const pilotUi = tracked.filter((path) => path.startsWith("apps/platform-web/app/pilot/") || path.startsWith("apps/platform-web/components/pilot/")).map((path) => readFileSync(path, "utf8")).join("\n");
if (/mailto:|tel:|https?:\/\/(?!127\.0\.0\.1|localhost)/i.test(pilotUi)) throw new Error("Pilot UI contains an unapproved external contact or delivery destination.");

const serverPolicy = readFileSync("apps/platform-web/lib/pilot/server.ts", "utf8");
if (!serverPolicy.includes("MVH_PILOT_READINESS") || !serverPolicy.includes("MVH_PILOT_ACTIVATION") || /NEXT_PUBLIC_MVH_PILOT/.test(serverPolicy)) throw new Error("Pilot policy adapter is not server-only and fail-closed.");
const corePolicy = readFileSync("packages/platform-core/src/pilot/policy.ts", "utf8");
for (const provider of ["next/", "react", "supabase", "stripe", "vercel", "localStorage", "window."]) if (corePolicy.toLowerCase().includes(provider.toLowerCase())) throw new Error(`Provider/framework dependency detected in PilotPolicy: ${provider}`);
if (!corePolicy.includes('activation: "inactive"') || !corePolicy.includes("activationAllowed: false")) throw new Error("PilotPolicy does not enforce inactive/denied behavior.");

const example = readFileSync(".env.example", "utf8");
if (!example.includes("MVH_PILOT_READINESS=not-ready") || !example.includes("MVH_PILOT_ACTIVATION=inactive") || /NEXT_PUBLIC_MVH_PILOT/.test(example)) throw new Error("Pilot environment example is not server-only and default inactive.");

for (const path of sourceFiles.filter((path) => !/(?:\.test\.|^e2e\/|\/tests\/)/.test(path))) {
  const source = readFileSync(path, "utf8");
  if (/(?:sk|pk)_live_[A-Za-z0-9]{16,}|whsec_[A-Za-z0-9]{24,}/.test(source)) throw new Error(`Credential-like value found outside deterministic tests: ${path}`);
}

console.log(`Phase 6 security audit passed: ${tracked.length} files reviewed; no student persistence, feedback delivery, analytics/session replay, real email, live key, public pilot authority, or active pilot default detected.`);
