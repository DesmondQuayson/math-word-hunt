import { parseAuthEmailDeliveryState, type AuthEmailDeliveryState } from "../email/delivery-state";

export const PLATFORM_ENVIRONMENTS = ["local", "preview", "production-public", "production-platform"] as const;
export type PlatformEnvironment = (typeof PLATFORM_ENVIRONMENTS)[number];
export type DeliveryMode = AuthEmailDeliveryState;
export type MonitoringMode = "console" | "disabled";
export type DeletionMode = "dry-run" | "disabled";

export type EnvironmentRegistry = Readonly<{
  identity: PlatformEnvironment;
  applicationOrigin: string;
  dataProjectIdentity: string | null;
  paymentMode: "test" | "disabled";
  billingAvailable: boolean;
  emailDelivery: DeliveryMode;
  monitoring: MonitoringMode;
  fixturePolicy: "allowed" | "forbidden";
  deletionMode: DeletionMode;
  supportContactVisible: boolean;
  previewBanner: boolean;
  searchIndexingAllowed: boolean;
  sensitiveOperationsAllowed: boolean;
  authenticationAvailable: boolean;
  teacherToolsAvailable: boolean;
  consumerAccountsAvailable: boolean;
  gameEntitlementRequired: boolean;
  accountModel: "none" | "legacy-teacher" | "consumer";
  pilotAvailable: boolean;
  invitationsAvailable: boolean;
}>;

export type EnvironmentInput = Readonly<{
  appEnvironment?: string | undefined;
  applicationOrigin?: string | undefined;
  dataProjectIdentity?: string | undefined;
  paymentMode?: string | undefined;
  emailDelivery?: string | undefined;
  monitoringMode?: string | undefined;
  fixturePolicy?: string | undefined;
  deletionMode?: string | undefined;
  restrictedProviderConfigurationPresent?: boolean | undefined;
  billingEnabled?: string | undefined;
  pilotState?: string | undefined;
  invitationsEnabled?: string | undefined;
  identityModel?: string | undefined;
  productionDataProjectIdentity?: string | undefined;
  previewDataProjectIdentity?: string | undefined;
  identityProviderConfigurationPresent?: boolean | undefined;
  previewCredentialCollision?: boolean | undefined;
  allowInsecureLoopback?: boolean | undefined;
}>;

function exact(value: string | undefined, allowed: readonly string[]) {
  return value !== undefined && allowed.includes(value) ? value : null;
}

function origin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) return null;
    return parsed.origin;
  } catch { return null; }
}

export function parseEnvironmentRegistry(input: EnvironmentInput): EnvironmentRegistry | null {
  const identity = exact(input.appEnvironment, PLATFORM_ENVIRONMENTS) as PlatformEnvironment | null;
  const applicationOrigin = origin(input.applicationOrigin);
  const projectRef = input.dataProjectIdentity?.trim() || null;
  const paymentMode = exact(input.paymentMode, ["test", "disabled"]) as "test" | "disabled" | null;
  const emailDelivery = parseAuthEmailDeliveryState(input.emailDelivery);
  const monitoring = exact(input.monitoringMode, ["console", "disabled"]) as MonitoringMode | null;
  const fixturePolicy = exact(input.fixturePolicy, ["allowed", "forbidden"]) as "allowed" | "forbidden" | null;
  const deletionMode = exact(input.deletionMode, ["dry-run", "disabled"]) as DeletionMode | null;
  if (!identity || !applicationOrigin || !paymentMode || !emailDelivery || !monitoring || !fixturePolicy || !deletionMode) return null;
  if (identity === "production-public") {
    const validPublicContract = applicationOrigin.startsWith("https://") &&
      projectRef === null &&
      paymentMode === "disabled" &&
      emailDelivery === "disabled" &&
      fixturePolicy === "forbidden" &&
      deletionMode === "disabled" &&
      input.restrictedProviderConfigurationPresent !== true &&
      input.billingEnabled === "false" &&
      input.pilotState === "inactive" &&
      input.invitationsEnabled === "false";
    if (!validPublicContract) return null;
    return Object.freeze({
      identity,
      applicationOrigin,
      dataProjectIdentity: null,
      paymentMode,
      billingAvailable: false,
      emailDelivery,
      monitoring,
      fixturePolicy,
      deletionMode,
      supportContactVisible: false,
      previewBanner: false,
      searchIndexingAllowed: true,
      sensitiveOperationsAllowed: false,
      authenticationAvailable: false,
      teacherToolsAvailable: false,
      consumerAccountsAvailable: false,
      gameEntitlementRequired: false,
      accountModel: "none",
      pilotAvailable: false,
      invitationsAvailable: false
    });
  }
  if (identity === "production-platform") {
    const productionRef = input.productionDataProjectIdentity?.trim() || null;
    const previewRef = input.previewDataProjectIdentity?.trim() || null;
    const localRehearsalOrigin = input.allowInsecureLoopback === true &&
      /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(applicationOrigin);
    const validPlatformContract = (applicationOrigin.startsWith("https://") || localRehearsalOrigin) &&
      projectRef !== null &&
      productionRef === projectRef &&
      previewRef !== null &&
      previewRef !== projectRef &&
      input.identityModel === "consumer-v1" &&
      input.identityProviderConfigurationPresent === true &&
      input.previewCredentialCollision !== true &&
      paymentMode === "disabled" &&
      emailDelivery !== "disabled" &&
      fixturePolicy === "forbidden" &&
      deletionMode === "dry-run" &&
      input.billingEnabled === "false" &&
      input.pilotState === "inactive" &&
      input.invitationsEnabled === "false";
    if (!validPlatformContract) return null;
    return Object.freeze({
      identity,
      applicationOrigin,
      dataProjectIdentity: projectRef,
      paymentMode,
      billingAvailable: false,
      emailDelivery,
      monitoring,
      fixturePolicy,
      deletionMode,
      supportContactVisible: false,
      previewBanner: false,
      searchIndexingAllowed: false,
      sensitiveOperationsAllowed: true,
      authenticationAvailable: true,
      teacherToolsAvailable: false,
      consumerAccountsAvailable: true,
      gameEntitlementRequired: true,
      accountModel: "consumer",
      pilotAvailable: false,
      invitationsAvailable: false
    });
  }
  if (!projectRef || !/^[a-z0-9-]{3,64}$/.test(projectRef)) return null;
  if (identity === "preview" && (paymentMode !== "test" || fixturePolicy !== "allowed" || deletionMode !== "dry-run")) return null;
  if (identity === "local" && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(applicationOrigin)) return null;
  return Object.freeze({
    identity,
    applicationOrigin,
    dataProjectIdentity: projectRef,
    paymentMode,
    billingAvailable: identity === "preview" && paymentMode === "test",
    emailDelivery,
    monitoring,
    fixturePolicy,
    deletionMode,
    supportContactVisible: false,
    previewBanner: identity === "preview",
    searchIndexingAllowed: false,
    sensitiveOperationsAllowed: true,
    authenticationAvailable: true,
    teacherToolsAvailable: true,
    consumerAccountsAvailable: false,
    gameEntitlementRequired: false,
    accountModel: "legacy-teacher",
    pilotAvailable: identity === "preview",
    invitationsAvailable: false
  });
}
