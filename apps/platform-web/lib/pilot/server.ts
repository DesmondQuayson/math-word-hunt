import "server-only";

import {
  evaluatePilotActivation,
  type PilotActivationPolicy
} from "@math-vocabulary-hunt/platform-core";

export function getPilotPolicy(source: Readonly<Record<string, string | undefined>> = process.env): PilotActivationPolicy {
  if (source.MVH_PILOT_STATE === undefined) return evaluatePilotActivation(undefined);
  const prerequisites = {
    ownerGoRecorded: source.MVH_PILOT_OWNER_GO,
    datesApproved: source.MVH_PILOT_DATES_APPROVED,
    supportChannelApproved: source.MVH_PILOT_SUPPORT_CHANNEL,
    transactionalAuthEmailVerified: source.MVH_PILOT_AUTH_EMAIL_VERIFIED,
    confirmationFlowVerified: source.MVH_PILOT_CONFIRMATION_FLOW,
    recoveryFlowVerified: source.MVH_PILOT_RECOVERY_FLOW,
    humanPreviewAccessApproved: source.MVH_PILOT_HUMAN_ACCESS,
    privacyPolicyApproved: source.MVH_PILOT_PRIVACY_POLICY,
    incidentOperatorAssigned: source.MVH_PILOT_INCIDENT_OPERATOR,
    rollbackOperatorAssigned: source.MVH_PILOT_ROLLBACK_OPERATOR
  };
  return evaluatePilotActivation({
    environment: source.MVH_APP_ENVIRONMENT,
    requestedState: source.MVH_PILOT_STATE,
    startAt: source.MVH_PILOT_START_AT,
    endAt: source.MVH_PILOT_END_AT,
    emailDelivery: source.MVH_EMAIL_DELIVERY,
    prerequisites
  });
}
