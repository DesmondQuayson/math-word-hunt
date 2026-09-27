import "server-only";

import { redirect } from "next/navigation";

import {
  accessIntentHref,
  confirmationRequiredHref,
  isFreeGameDestination,
  safeProductDestination,
  subscriptionReviewHref,
  type ProductDestination
} from "@/lib/auth/access-intent";
import { getGameAccessView, type GameAccessView } from "@/lib/game-access/server";
import { hasMathNexaModuleAccess, type MathNexaProductModule } from "@math-vocabulary-hunt/platform-core";
import { freeGamePlayRoute, gameAccessPolicy } from "@/lib/games/access-policy";

// The Worksheet Generator is part of the ShowMe Math (Online Math Prep)
// application, so its entry checks the same product module as /map-prep. The
// MathNexa all-access entitlement grants every module together; no new module
// or entitlement rule is introduced for it.
const destinationModule: Readonly<Record<ProductDestination, MathNexaProductModule>> = {
  "/games": "games",
  "/homework": "homework",
  "/quizzes": "quizzes",
  "/map-prep": "map_prep",
  "/worksheets": "map_prep"
};

export async function requireProductAccess(destination: ProductDestination): Promise<GameAccessView> {
  const safeDestination = safeProductDestination(destination);
  const access = await getGameAccessView();
  if (hasMathNexaModuleAccess(access.decision, destinationModule[safeDestination])) return access;
  if (access.context.status === "anonymous" || access.context.status === "unconfigured") {
    redirect(accessIntentHref(safeDestination));
  }
  if (access.context.status === "unconfirmed" || access.decision.reason === "email-confirmation-required") {
    redirect(confirmationRequiredHref(safeDestination));
  }
  redirect(subscriptionReviewHref(safeDestination));
}

/**
 * May this visitor play an "authenticated-free" game? Any confirmed, active
 * MathNexa account, or a school access session. Never anonymous, never an
 * unconfirmed or suspended account; no subscription or trial required.
 */
export function isSignedInFreePlayer(access: GameAccessView): boolean {
  if (!access.principal) return false;
  if (access.source === "school-access") return true;
  const context = access.context;
  return context.status === "active" && context.account.accountStatus === "active" && context.account.emailConfirmedAt !== null;
}

/** Whether this visitor may play the game, under the game's own access policy. */
export function canPlayGame(access: GameAccessView, stableKey: string): boolean {
  return gameAccessPolicy(stableKey) === "authenticated-free"
    ? isSignedInFreePlayer(access)
    : hasMathNexaModuleAccess(access.decision, "games") && access.principal !== null;
}

/**
 * Gate for a game's play route. Entitled games keep the exact Math Games rule
 * (requireProductAccess("/games")). Authenticated-free games need only a
 * signed-in account: anonymous visitors go to sign in / create account and
 * come back to the game; nobody is sent to pricing, checkout or a trial.
 */
export async function requireGamePlayAccess(stableKey: string): Promise<GameAccessView> {
  const route = freeGamePlayRoute(stableKey);
  if (!route || !isFreeGameDestination(route)) return requireProductAccess("/games");
  const access = await getGameAccessView();
  if (isSignedInFreePlayer(access)) return access;
  if (access.context.status === "anonymous" || access.context.status === "unconfigured") redirect(accessIntentHref(route));
  if (access.context.status === "unconfirmed") redirect(confirmationRequiredHref(route));
  // Suspended, pending deletion or missing account records keep their
  // account-level rules; the account page explains them.
  redirect("/account");
}
