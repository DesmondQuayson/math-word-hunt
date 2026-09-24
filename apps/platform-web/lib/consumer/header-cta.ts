import type { GameAccessView } from "@/lib/game-access/server";

/**
 * The one header call to action, decided from the server-verified access view
 * only. Nothing here reads referrers, cookies or browser state: whether a
 * visitor may be offered the free trial is the existing entitlement decision
 * (`nextAction === "start-checkout"` means the account has never redeemed its
 * one trial). This function only chooses words and a destination; every
 * destination re-checks access on the server before it shows or starts
 * anything.
 */
export type HeaderCta = Readonly<{
  kind: "start-trial" | "subscriber" | "subscribe" | "manage" | "trial-status";
  label: string;
  href: string;
}>;

/** Where "Start free trial" begins for someone without an account. */
export const START_TRIAL_SIGN_UP_HREF = "/sign-up?next=/subscription" as const;
/** The existing subscription page: it holds the approved terms and the Stripe hand-off. */
export const START_TRIAL_SUBSCRIPTION_HREF = "/subscription" as const;
/** Where an entitled visitor continues. */
export const SUBSCRIBER_DESTINATION = "/games" as const;

type HeaderAccessView = Readonly<{
  context: Readonly<{ status: GameAccessView["context"]["status"] }>;
  decision: Readonly<Pick<GameAccessView["decision"], "allowed" | "reason" | "nextAction">>;
  source: GameAccessView["source"];
}>;

export function resolveHeaderCta(view: HeaderAccessView): HeaderCta | null {
  // Already inside MathNexa: school access or a live trial / subscription /
  // renewal grace. Never offer these accounts another trial.
  if (view.source === "school-access" || view.decision.allowed) {
    return { kind: "subscriber", label: "Start learning", href: SUBSCRIBER_DESTINATION };
  }
  const status = view.context.status;
  if (status === "anonymous" || status === "unconfigured") {
    return { kind: "start-trial", label: "Start free trial", href: START_TRIAL_SIGN_UP_HREF };
  }
  // The subscription page sends an unconfirmed account to email confirmation
  // first and then returns it to the same trial path.
  if (status === "unconfirmed" || status === "missing-account") {
    return { kind: "start-trial", label: "Start free trial", href: START_TRIAL_SUBSCRIPTION_HREF };
  }
  if (status !== "active") return null;
  switch (view.decision.nextAction) {
    case "start-checkout":
      return { kind: "start-trial", label: "Start free trial", href: START_TRIAL_SUBSCRIPTION_HREF };
    case "wait-for-activation":
      return { kind: "trial-status", label: "Trial status", href: START_TRIAL_SUBSCRIPTION_HREF };
    case "manage-subscription":
      // The one trial is used. A payment problem or an unverifiable renewal is
      // managed, not re-subscribed; an ended trial or subscription may
      // subscribe again through the same page, which itself refuses a second
      // Checkout while a live subscription exists.
      return view.decision.reason === "payment-past-due" || view.decision.reason === "subscription-verification-unavailable"
        ? { kind: "manage", label: "Manage subscription", href: START_TRIAL_SUBSCRIPTION_HREF }
        : { kind: "subscribe", label: "Subscribe", href: START_TRIAL_SUBSCRIPTION_HREF };
    default:
      return null;
  }
}
