import type { CapabilityDecision } from "@math-vocabulary-hunt/platform-core";

export function capabilityDecisionMessage(decision: CapabilityDecision): string {
  switch (decision.reason) {
    case "denied_signed_out": return "Sign in with an active teacher account to continue.";
    case "denied_suspended": return "This account is suspended. Protected teacher operations are unavailable.";
    case "denied_deletion_requested": return "A deletion request is pending. New teacher-data writes are unavailable.";
    case "denied_limit_reached": return decision.limit?.unit === "active-classes"
      ? "Your active class limit has been reached. Existing work is safe; archive a class to restore capacity or review Teacher Pro in the test sandbox."
      : "Your active activity-draft limit has been reached. Existing work is safe; review Teacher Pro in the test sandbox for more capacity.";
    case "denied_wrong_owner": return "That record is unavailable or belongs to another teacher.";
    case "denied_unavailable": return "This product capability is not available yet.";
    case "denied_environment": return "This capability is not enabled in the current environment.";
    case "denied_manual_review": return "Access remains limited while support reviews the account state.";
    case "denied_no_entitlement": return "The current plan does not include this capability.";
    case "denied_malformed_state": return "Access could not be verified safely. No change was made.";
    case "allowed": return "Allowed.";
  }
}
