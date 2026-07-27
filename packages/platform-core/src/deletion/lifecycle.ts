export const DELETION_STATES = ["requested", "restricted", "cooling_off", "eligible", "executing", "completed", "failed_manual_review"] as const;
export type DeletionState = (typeof DELETION_STATES)[number];
export type DeletionPlan = Readonly<{ idempotencyKey: string; ownerTeacherId: string; state: DeletionState; destructiveExecutionEnabled: false; actions: readonly string[] }>;

export function canTransitionDeletion(from: DeletionState, to: DeletionState): boolean {
  const transitions: Record<DeletionState, readonly DeletionState[]> = {
    requested: ["restricted"], restricted: ["cooling_off"], cooling_off: ["eligible"], eligible: ["executing"], executing: ["completed", "failed_manual_review"], completed: [], failed_manual_review: ["eligible"]
  };
  return transitions[from].includes(to);
}

export function planDeletion(ownerTeacherId: string, requestId: string, state: DeletionState): DeletionPlan | null {
  if (!/^[0-9a-f-]{36}$/i.test(ownerTeacherId) || !/^[0-9a-f-]{36}$/i.test(requestId)) return null;
  return Object.freeze({ idempotencyKey: `account-deletion:${requestId}`, ownerTeacherId, state, destructiveExecutionEnabled: false, actions: ["delete teacher classes", "delete teacher activities", "anonymize billing projection", "retain minimal audit receipt", "delete authentication identity only after provider approval"] });
}

