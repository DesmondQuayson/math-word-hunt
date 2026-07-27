export const OBSERVABILITY_CATEGORIES = ["authentication", "authorization", "capability", "billing", "database", "deletion", "environment", "health"] as const;
export type ObservabilityCategory = (typeof OBSERVABILITY_CATEGORIES)[number];
export type SafeEvent = Readonly<{ category: ObservabilityCategory; severity: "info" | "warning" | "error" | "critical"; code: string; correlationId: string; detail?: Readonly<Record<string, string | number | boolean | null>> }>;
const forbidden = /(password|token|secret|authorization|cookie|email|service.?role)/i;
export function createSafeEvent(event: SafeEvent): SafeEvent | null {
  if (!/^[a-z0-9][a-z0-9._-]{2,79}$/.test(event.code) || !/^[a-zA-Z0-9_-]{8,80}$/.test(event.correlationId)) return null;
  if (event.detail && Object.entries(event.detail).some(([key, value]) => forbidden.test(key) || (typeof value === "string" && /[\r\n]/.test(value)))) return null;
  return event.detail
    ? Object.freeze({ ...event, detail: Object.freeze({ ...event.detail }) })
    : Object.freeze({ category: event.category, severity: event.severity, code: event.code, correlationId: event.correlationId });
}
