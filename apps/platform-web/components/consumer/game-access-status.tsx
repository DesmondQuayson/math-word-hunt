import { Notice } from "@/components/feedback/notice";
import { LinkButton } from "@/components/ui/link-button";
import type { GameAccessDecision } from "@math-vocabulary-hunt/platform-core";

const copy: Record<GameAccessDecision["reason"], { title: string; message: string; tone: "information" | "success" | "warning" }> = {
  "authentication-required": { title: "Sign in required", message: "Sign in to check game access.", tone: "information" },
  "email-confirmation-required": { title: "Confirm your email", message: "Game access remains unavailable until email confirmation is complete.", tone: "warning" },
  "checkout-required": { title: "Subscription setup required", message: "Add a payment method through Stripe Sandbox to start the one-time 24-hour trial. The server, not this page, activates access.", tone: "information" },
  "trial-activation-pending": { title: "Trial activation pending", message: "The server has not confirmed an active trial. No browser or redirect can grant access.", tone: "information" },
  "trial-access-active": { title: "Trial access active", message: "The server verified the trial window and permits game launch until the displayed access end.", tone: "success" },
  "trial-ended": { title: "Trial ended", message: "The one-time trial cannot be restarted or extended from the browser.", tone: "warning" },
  "subscription-access-active": { title: "Subscription active", message: "The server verified an active subscription period and permits game launch.", tone: "success" },
  "payment-past-due": { title: "Payment requires attention", message: "Game access is unavailable while the subscription is past due.", tone: "warning" },
  "renewal-grace-active": { title: "Renewal payment requires attention", message: "A verified renewal grace period is active. Update the payment method before the displayed grace end to avoid losing access.", tone: "warning" },
  "canceled-access-active": { title: "Cancellation scheduled", message: "Game access remains available only through the verified current period end.", tone: "information" },
  "subscription-ended": { title: "Subscription ended", message: "Game access is unavailable because the verified subscription period ended.", tone: "warning" },
  "account-suspended": { title: "Account suspended", message: "Game and subscription actions are unavailable. Contact support.", tone: "warning" },
  "account-deletion-pending": { title: "Deletion pending", message: "Game and subscription actions are unavailable while deletion is reviewed.", tone: "warning" },
  "malformed-entitlement": { title: "Access could not be verified", message: "Unknown or incomplete server data denies access. Contact support.", tone: "warning" }
};

export function GameAccessStatus({ decision }: { decision: GameAccessDecision }) {
  const content = copy[decision.reason];
  return <><Notice label="Game-access status" tone={content.tone} live><strong>{content.title}</strong><p>{content.message}</p>{decision.accessEndsAt ? <p>Access ends: <time dateTime={decision.accessEndsAt}>{new Date(decision.accessEndsAt).toLocaleString("en-US", { timeZone: "America/Chicago" })}</time></p> : null}</Notice>
    <div className="button-row">
      {decision.allowed ? <LinkButton href="/play">Continue to protected game gateway</LinkButton> : null}
      {decision.nextAction === "start-checkout" || decision.nextAction === "manage-subscription" ? <LinkButton href="/subscription" variant="secondary">Review subscription</LinkButton> : null}
      {decision.nextAction === "sign-in" ? <LinkButton href="/sign-in?next=/game-access">Sign in</LinkButton> : null}
      <LinkButton href="/account" variant="secondary">Account</LinkButton>
    </div>
  </>;
}
