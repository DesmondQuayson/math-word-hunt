import { parseAuthEmailDeliveryState, type AuthEmailDeliveryState } from "../email/delivery-state";

export const PLATFORM_ENVIRONMENTS = ["local", "preview", "production"] as const;
export type PlatformEnvironment = (typeof PLATFORM_ENVIRONMENTS)[number];
export type DeliveryMode = AuthEmailDeliveryState;
export type MonitoringMode = "console" | "disabled";
export type DeletionMode = "dry-run" | "disabled";

export type EnvironmentRegistry = Readonly<{
  identity: PlatformEnvironment;
  applicationOrigin: string;
  dataProjectIdentity: string;
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
}>;

export type EnvironmentInput = Readonly<{ appEnvironment?: string | undefined; applicationOrigin?: string | undefined; dataProjectIdentity?: string | undefined; paymentMode?: string | undefined; emailDelivery?: string | undefined; monitoringMode?: string | undefined; fixturePolicy?: string | undefined; deletionMode?: string | undefined }>;

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
  const projectRef = input.dataProjectIdentity?.trim();
  const paymentMode = exact(input.paymentMode, ["test", "disabled"]) as "test" | "disabled" | null;
  const emailDelivery = parseAuthEmailDeliveryState(input.emailDelivery);
  const monitoring = exact(input.monitoringMode, ["console", "disabled"]) as MonitoringMode | null;
  const fixturePolicy = exact(input.fixturePolicy, ["allowed", "forbidden"]) as "allowed" | "forbidden" | null;
  const deletionMode = exact(input.deletionMode, ["dry-run", "disabled"]) as DeletionMode | null;
  if (!identity || !applicationOrigin || !projectRef || !/^[a-z0-9-]{3,64}$/.test(projectRef) || !paymentMode || !emailDelivery || !monitoring || !fixturePolicy || !deletionMode) return null;
  if (identity === "production") return null; // Phase 4 never provisions production.
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
    sensitiveOperationsAllowed: true
  });
}
