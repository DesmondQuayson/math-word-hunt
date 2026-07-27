import "server-only";
import { parseEnvironmentRegistry, type EnvironmentRegistry } from "@math-vocabulary-hunt/platform-core";

export type PublicEnvironmentView = Readonly<{
  identity: "local" | "preview" | "unknown";
  previewBanner: boolean;
  indexable: false;
  operationalStatusVisible: boolean;
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
    deletionMode: source.MVH_DELETION_MODE
  });
}

export function getPublicEnvironmentView(source: NodeJS.ProcessEnv = process.env): PublicEnvironmentView {
  const config = getServerEnvironment(source);
  const identity = config?.identity === "preview" ? "preview" : config?.identity === "local" ? "local" : "unknown";
  const buildId = /^[a-zA-Z0-9._-]{1,80}$/.test(source.MVH_BUILD_ID ?? "") ? source.MVH_BUILD_ID! : "local-unversioned";
  return Object.freeze({ identity, previewBanner: config?.previewBanner ?? false, indexable: false, operationalStatusVisible: identity === "preview", buildId });
}
