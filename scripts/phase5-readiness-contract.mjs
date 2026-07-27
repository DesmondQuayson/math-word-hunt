const approval = "owner-approved";

function value(source, name) {
  return typeof source[name] === "string" ? source[name].trim() : "";
}

function validPreviewUrl(raw) {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash && url.hostname !== "preview.example.invalid" && !/(^|\.)(localhost|127\.0\.0\.1)$/.test(url.hostname);
  } catch {
    return false;
  }
}

function isPlaceholder(raw) {
  return !raw || /replace-with|example\.invalid|unconfigured/i.test(raw);
}

export function evaluatePhase5Readiness(source = process.env) {
  const errors = [];
  const pending = [];
  const ready = [];
  const hostedApproval = value(source, "PHASE5_HOSTED_APPROVAL") === approval;
  const hostedChecks = value(source, "PHASE5_HOSTED_CHECKS_ENABLED") === "true";
  const readOnlyApproval = value(source, "PHASE5_HOSTED_READ_ONLY_APPROVAL") === approval;
  const externalMutations = value(source, "PHASE5_EXTERNAL_MUTATIONS");
  const previewUrl = value(source, "MVH_PREVIEW_URL");

  if (externalMutations && externalMutations !== "false") errors.push("PHASE5_EXTERNAL_MUTATIONS must remain false; this repository does not authorize provider mutation.");
  if (hostedChecks && !hostedApproval) errors.push("Hosted checks cannot be enabled without PHASE5_HOSTED_APPROVAL=owner-approved.");
  if (readOnlyApproval && !hostedApproval) errors.push("Read-only hosted approval cannot exist without the owner hosted approval.");
  if (hostedApproval && value(source, "PHASE5_PREVIEW_CLASSIFICATION") !== "isolated-preview") errors.push("An approved hosted run must be classified as isolated-preview.");
  if ((hostedApproval || hostedChecks || readOnlyApproval) && !validPreviewUrl(previewUrl)) errors.push("An approved hosted run requires an exact HTTPS non-local MVH_PREVIEW_URL origin.");

  const liveSignals = [
    ["MVH_APP_ENVIRONMENT", "production"], ["BILLING_ENVIRONMENT", "production"],
    ["MVH_STRIPE_MODE", "live"], ["STRIPE_MODE", "live"],
    ["MVH_EMAIL_DELIVERY", "deliver"], ["MVH_DELETION_MODE", "execute"]
  ];
  for (const [name, unsafe] of liveSignals) if (value(source, name) === unsafe) errors.push(`${name}=${unsafe} is prohibited in Phase 5.`);
  if (/^(?:sk|pk)_live_/.test(value(source, "STRIPE_SECRET_KEY")) || /^(?:sk|pk)_live_/.test(value(source, "STRIPE_PUBLISHABLE_KEY"))) errors.push("Stripe live credentials are prohibited in Phase 5.");

  if (!hostedApproval) pending.push("Owner approval for any hosted resource or hosted validation"); else ready.push("Owner hosted-preview approval recorded in the process environment");
  if (!hostedChecks) pending.push("Read-only hosted checks are disabled"); else ready.push("Hosted checks enabled");
  if (!readOnlyApproval) pending.push("Separate owner approval for read-only hosted checks"); else ready.push("Read-only hosted-check approval recorded");
  if (!validPreviewUrl(previewUrl)) pending.push("Exact restricted HTTPS preview origin"); else ready.push("Preview origin has a safe URL shape");

  const requiredHosted = [
    ["SUPABASE_URL", "Hosted Supabase URL"], ["SUPABASE_PUBLISHABLE_KEY", "Hosted Supabase publishable key"],
    ["SUPABASE_SECRET_KEY", "Hosted Supabase server secret"], ["MVH_SUPABASE_PROJECT_REF", "Isolated preview project identity"],
    ["VERCEL_AUTOMATION_BYPASS_SECRET", "Owner-controlled Vercel automation bypass"]
  ];
  for (const [name, label] of requiredHosted) {
    if (isPlaceholder(value(source, name))) pending.push(label); else ready.push(`${label} is present (value not displayed)`);
  }

  const stripeNames = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRODUCT_TEACHER_PRO", "STRIPE_PRICE_TEACHER_PRO_MONTHLY", "STRIPE_PRICE_TEACHER_PRO_ANNUAL", "STRIPE_PORTAL_CONFIGURATION_ID"];
  if (stripeNames.every((name) => !isPlaceholder(value(source, name))) && value(source, "STRIPE_MODE") === "test") ready.push("Stripe test lifecycle inputs are present (values not displayed)");
  else pending.push("Complete owner-approved Stripe sandbox/test lifecycle inputs");

  const status = errors.length ? "blocked" : hostedApproval && hostedChecks && readOnlyApproval && validPreviewUrl(previewUrl) ? "ready" : "pending";
  return Object.freeze({ status, ready: Object.freeze(ready), pending: Object.freeze(pending), errors: Object.freeze(errors) });
}

export function formatPhase5Readiness(result) {
  const lines = [`Phase 5 hosted readiness: ${result.status.toUpperCase()}`];
  for (const message of result.ready) lines.push(`READY: ${message}`);
  for (const message of result.pending) lines.push(`PENDING: ${message}`);
  for (const message of result.errors) lines.push(`BLOCKED: ${message}`);
  return lines.join("\n");
}
