import { assertUniqueKeys } from "../catalog/types";
import { CAPABILITY_KEYS, isCapabilityKey, type CapabilityKey } from "./keys";

export type CapabilityCategory = "public" | "workspace" | "account-management" | "billing" | "informational";
export type CapabilityAvailability = "available" | "sandbox-only" | "unavailable";
export type CapabilityAllowance = "included" | "not-included";
export type CapabilityLifecycle = "operational" | "informational" | "demonstration" | "planned";
export type UsageLimitUnit = "active-classes" | "active-activity-drafts";

export type CapabilityDefinition = Readonly<{
  key: CapabilityKey;
  category: CapabilityCategory;
  availability: CapabilityAvailability;
  free: CapabilityAllowance;
  pro: CapabilityAllowance;
  usageLimit: Readonly<{ unit: UsageLimitUnit; free: number; pro: number }> | null;
  title: string;
  description: string;
  unavailableReason: string | null;
  upgradeEligible: boolean;
  lifecycle: CapabilityLifecycle;
  operational: boolean;
}>;

const categories = new Set<CapabilityCategory>(["public", "workspace", "account-management", "billing", "informational"]);
const availabilities = new Set<CapabilityAvailability>(["available", "sandbox-only", "unavailable"]);
const allowances = new Set<CapabilityAllowance>(["included", "not-included"]);
const lifecycles = new Set<CapabilityLifecycle>(["operational", "informational", "demonstration", "planned"]);
const limitUnits = new Set<UsageLimitUnit>(["active-classes", "active-activity-drafts"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === [...expected].sort()[index]);
}

function parseLimit(value: unknown): CapabilityDefinition["usageLimit"] | undefined {
  if (value === null) return null;
  if (!isRecord(value) || !exactKeys(value, ["unit", "free", "pro"]) || !limitUnits.has(value.unit as UsageLimitUnit)) return undefined;
  if (!Number.isSafeInteger(value.free) || !Number.isSafeInteger(value.pro) || Number(value.free) < 0 || Number(value.pro) < Number(value.free)) return undefined;
  return Object.freeze({ unit: value.unit as UsageLimitUnit, free: Number(value.free), pro: Number(value.pro) });
}

export function parseCapabilityDefinition(value: unknown): CapabilityDefinition | null {
  if (!isRecord(value) || !exactKeys(value, [
    "key", "category", "availability", "free", "pro", "usageLimit", "title", "description",
    "unavailableReason", "upgradeEligible", "lifecycle", "operational"
  ])) return null;
  const limit = parseLimit(value.usageLimit);
  if (!isCapabilityKey(value.key) || !categories.has(value.category as CapabilityCategory) ||
      !availabilities.has(value.availability as CapabilityAvailability) ||
      !allowances.has(value.free as CapabilityAllowance) || !allowances.has(value.pro as CapabilityAllowance) ||
      limit === undefined || typeof value.title !== "string" || !value.title.trim() ||
      typeof value.description !== "string" || !value.description.trim() ||
      (value.unavailableReason !== null && (typeof value.unavailableReason !== "string" || !value.unavailableReason.trim())) ||
      typeof value.upgradeEligible !== "boolean" || !lifecycles.has(value.lifecycle as CapabilityLifecycle) ||
      typeof value.operational !== "boolean") return null;
  if (value.availability === "unavailable" && value.unavailableReason === null) return null;
  if (value.operational && value.lifecycle !== "operational") return null;
  if (!value.operational && value.lifecycle === "operational") return null;
  return Object.freeze({
    key: value.key,
    category: value.category as CapabilityCategory,
    availability: value.availability as CapabilityAvailability,
    free: value.free as CapabilityAllowance,
    pro: value.pro as CapabilityAllowance,
    usageLimit: limit,
    title: value.title,
    description: value.description,
    unavailableReason: value.unavailableReason as string | null,
    upgradeEligible: value.upgradeEligible,
    lifecycle: value.lifecycle as CapabilityLifecycle,
    operational: value.operational
  });
}

export function defineCapabilityRegistry(values: readonly unknown[]): readonly CapabilityDefinition[] {
  const parsed = values.map(parseCapabilityDefinition);
  if (parsed.some((value) => value === null)) throw new Error("Malformed capability definition");
  const definitions = parsed as CapabilityDefinition[];
  assertUniqueKeys(definitions.map((definition) => definition.key), "capability");
  if (definitions.length !== CAPABILITY_KEYS.length || !CAPABILITY_KEYS.every((key) => definitions.some((definition) => definition.key === key))) {
    throw new Error("Capability registry is incomplete");
  }
  return Object.freeze(definitions);
}

export const CAPABILITY_REGISTRY = defineCapabilityRegistry([
  { key: "game.launch.canonical", category: "public", availability: "available", free: "included", pro: "included", usageLimit: null, title: "Launch the current game", description: "Open the preserved v7 classroom game without an account.", unavailableReason: null, upgradeEligible: false, lifecycle: "operational", operational: true },
  { key: "curriculum.view", category: "public", availability: "available", free: "included", pro: "included", usageLimit: null, title: "View curriculum readiness", description: "Review current lesson availability, thin lessons, and Combine Mode guidance.", unavailableReason: null, upgradeEligible: false, lifecycle: "operational", operational: true },
  { key: "teacher.preview", category: "public", availability: "available", free: "included", pro: "included", usageLimit: null, title: "Preview the teacher workspace", description: "Explore clearly labeled demonstration structure without persistence.", unavailableReason: null, upgradeEligible: false, lifecycle: "demonstration", operational: false },
  { key: "class.view", category: "workspace", availability: "available", free: "included", pro: "included", usageLimit: null, title: "View saved classes", description: "View teacher-owned, privacy-minimized class records.", unavailableReason: null, upgradeEligible: false, lifecycle: "operational", operational: true },
  { key: "class.create", category: "workspace", availability: "available", free: "included", pro: "included", usageLimit: { unit: "active-classes", free: 2, pro: 25 }, title: "Create a class", description: "Save a teacher-owned class label without a student roster.", unavailableReason: null, upgradeEligible: true, lifecycle: "operational", operational: true },
  { key: "class.edit", category: "workspace", availability: "available", free: "included", pro: "included", usageLimit: null, title: "Edit a class", description: "Safely update an existing owned class, including after downgrade.", unavailableReason: null, upgradeEligible: false, lifecycle: "operational", operational: true },
  { key: "class.archive", category: "workspace", availability: "available", free: "included", pro: "included", usageLimit: null, title: "Archive a class", description: "Archive an existing class and release active-class capacity.", unavailableReason: null, upgradeEligible: false, lifecycle: "operational", operational: true },
  { key: "activity.view", category: "workspace", availability: "available", free: "included", pro: "included", usageLimit: null, title: "View activity drafts", description: "View teacher-owned activity planning drafts.", unavailableReason: null, upgradeEligible: false, lifecycle: "operational", operational: true },
  { key: "activity.create", category: "workspace", availability: "available", free: "included", pro: "included", usageLimit: { unit: "active-activity-drafts", free: 3, pro: 100 }, title: "Create an activity draft", description: "Save a supported curriculum and classroom-settings draft.", unavailableReason: null, upgradeEligible: true, lifecycle: "operational", operational: true },
  { key: "activity.edit", category: "workspace", availability: "available", free: "included", pro: "included", usageLimit: null, title: "Edit an activity draft", description: "Safely update an existing owned draft, including after downgrade.", unavailableReason: null, upgradeEligible: false, lifecycle: "operational", operational: true },
  { key: "activity.archive", category: "workspace", availability: "available", free: "included", pro: "included", usageLimit: null, title: "Archive an activity draft", description: "Archive an existing draft and release active-draft capacity.", unavailableReason: null, upgradeEligible: false, lifecycle: "operational", operational: true },
  { key: "activity.attach_to_class", category: "workspace", availability: "available", free: "included", pro: "included", usageLimit: null, title: "Attach a draft to a class", description: "Associate a draft with one of the teacher's active classes.", unavailableReason: null, upgradeEligible: false, lifecycle: "operational", operational: true },
  { key: "account.manage", category: "account-management", availability: "available", free: "included", pro: "included", usageLimit: null, title: "Manage teacher account", description: "Manage approved profile, security, and deletion-request controls.", unavailableReason: null, upgradeEligible: false, lifecycle: "operational", operational: true },
  { key: "billing.checkout", category: "billing", availability: "sandbox-only", free: "included", pro: "not-included", usageLimit: null, title: "Start test Checkout", description: "Start an approved hosted Checkout only in a configured test sandbox.", unavailableReason: "Production pricing and payment acceptance are not approved.", upgradeEligible: false, lifecycle: "operational", operational: true },
  { key: "billing.portal", category: "billing", availability: "sandbox-only", free: "included", pro: "included", usageLimit: null, title: "Manage test billing", description: "Open the hosted customer portal for a verified billing customer.", unavailableReason: "The portal is available only in a configured test sandbox.", upgradeEligible: false, lifecycle: "operational", operational: true },
  { key: "managed_session.view_placeholder", category: "informational", availability: "unavailable", free: "not-included", pro: "not-included", usageLimit: null, title: "Managed live sessions", description: "Review an informational outline of a possible future managed-session workflow.", unavailableReason: "Managed live sessions, remote joining, and persistence are not implemented.", upgradeEligible: false, lifecycle: "planned", operational: false },
  { key: "managed_session.create", category: "workspace", availability: "unavailable", free: "not-included", pro: "not-included", usageLimit: null, title: "Create a managed session", description: "Create and persist a remotely managed classroom session.", unavailableReason: "Managed-session infrastructure is not implemented.", upgradeEligible: false, lifecycle: "planned", operational: false },
  { key: "report.view_placeholder", category: "informational", availability: "unavailable", free: "not-included", pro: "not-included", usageLimit: null, title: "Aggregate reports", description: "Review an informational outline of possible future aggregate reporting.", unavailableReason: "No session or report data is persisted.", upgradeEligible: false, lifecycle: "planned", operational: false }
]);

export const CAPABILITIES_BY_KEY = Object.freeze(Object.fromEntries(CAPABILITY_REGISTRY.map((definition) => [definition.key, definition])) as Record<CapabilityKey, CapabilityDefinition>);
