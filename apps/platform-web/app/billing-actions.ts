"use server";

import { redirect } from "next/navigation";

import { resolveTeacherContext } from "@/lib/auth/teacher-context";
import { parseCheckoutIntent } from "@/lib/billing/contracts";
import { tryGetBillingConfiguration } from "@/lib/billing/config";
import { createBillingProvider } from "@/lib/billing/provider-factory";
import { createBillingRepository, createHostedCheckout, createHostedPortal } from "@/lib/billing/service";

export async function startCheckoutAction(formData: FormData) {
  const config = tryGetBillingConfiguration();
  if (!config?.enabled) redirect("/pricing?billing=unavailable");
  try {
    const intent = parseCheckoutIntent({ planKey: formData.get("planKey"), returnDestination: formData.get("returnDestination") });
    const context = await resolveTeacherContext();
    if (context.status === "anonymous" || context.status === "unconfigured") redirect(`/sign-in?next=${encodeURIComponent(intent.returnDestination)}`);
    const repository = createBillingRepository();
    if (!repository) throw new Error("unavailable");
    const result = await createHostedCheckout({ context, config, provider: createBillingProvider(config), repository, ...intent });
    redirect(result.url);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    redirect("/pricing?billing=unavailable");
  }
}

export async function openBillingPortalAction() {
  const config = tryGetBillingConfiguration();
  if (!config?.enabled) redirect("/account?billing=unavailable");
  try {
    const context = await resolveTeacherContext();
    const repository = createBillingRepository();
    if (!repository) throw new Error("unavailable");
    const result = await createHostedPortal({ context, config, provider: createBillingProvider(config), repository });
    redirect(result.url);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    redirect("/account?billing=unavailable");
  }
}

