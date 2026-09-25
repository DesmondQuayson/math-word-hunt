import "server-only";

import { redirect } from "next/navigation";

import {
  accessIntentHref,
  confirmationRequiredHref,
  safeProductDestination,
  subscriptionReviewHref,
  type ProductDestination
} from "@/lib/auth/access-intent";
import { getGameAccessView, type GameAccessView } from "@/lib/game-access/server";
import { hasMathNexaModuleAccess, type MathNexaProductModule } from "@math-vocabulary-hunt/platform-core";

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
