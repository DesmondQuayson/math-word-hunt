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

export async function requireProductAccess(destination: ProductDestination): Promise<GameAccessView> {
  const safeDestination = safeProductDestination(destination);
  const access = await getGameAccessView();
  if (access.context.status === "anonymous" || access.context.status === "unconfigured") {
    redirect(accessIntentHref(safeDestination));
  }
  if (access.context.status === "unconfirmed" || access.decision.reason === "email-confirmation-required") {
    redirect(confirmationRequiredHref(safeDestination));
  }
  if (!access.decision.allowed) {
    redirect(subscriptionReviewHref(safeDestination));
  }
  return access;
}
