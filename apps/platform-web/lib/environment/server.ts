import "server-only";
import { parseEnvironmentRegistry, type EnvironmentRegistry } from "@math-vocabulary-hunt/platform-core";
import { hasRestrictedProviderConfiguration } from "./production-public";

export type PublicEnvironmentView = Readonly<{
  identity: "local" | "preview" | "production-public" | "unknown";
  previewBanner: boolean;
  indexable: boolean;
  operationalStatusVisible: boolean;
  publicProduction: boolean;
  buildId: string;
}>;

export function getServerEnvironment(source: NodeJS.ProcessEnv = process.env): EnvironmentRegistry | null {
  return parseEnvironmentRegistry({
    appEnvironment: source.MVH_APP_ENVIRONMENT,
    applicationOrigin: source.MVH_APPLICATION_ORIGIN,
    dataProjectIdentity: source.MVH_SUPABASE_PROJECT_REF,
    paymentMode: source.MVH_STRIPE_MODE,
    emailDelivery: source.MVH_EMAIL_DELIVERY,
    monitoringMode: source.MVH_MONITORING_MODE,
    fixturePolicy: source.MVH_FIXTURE_POLICY,
    deletionMode: source.MVH_DELETION_MODE,
    restrictedProviderConfigurationPresent: hasRestrictedProviderConfiguration(source),
    billingEnabled: source.BILLING_ENABLED,
    pilotState: source.MVH_PILOT_STATE,
    invitationsEnabled: source.MVH_INVITATIONS_ENABLED
  });
}

export function getPublicEnvironmentView(source: NodeJS.ProcessEnv = process.env): PublicEnvironmentView {
  const config = getServerEnvironment(source);
  const identity = config?.identity === "preview" ? "preview" : config?.identity === "local" ? "local" : config?.identity === "production-public" ? "production-public" : "unknown";
  const buildId = /^[a-zA-Z0-9._-]{1,80}$/.test(source.MVH_BUILD_ID ?? "") ? source.MVH_BUILD_ID! : "local-unversioned";
  return Object.freeze({ identity, previewBanner: config?.previewBanner ?? false, indexable: config?.searchIndexingAllowed ?? false, operationalStatusVisible: identity === "preview", publicProduction: identity === "production-public", buildId });
}
