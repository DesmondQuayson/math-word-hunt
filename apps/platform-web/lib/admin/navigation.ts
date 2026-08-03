export const ADMIN_SECTIONS = [
  ["dashboard", "Dashboard", "Overview"],
  ["games", "Games", "Packages"],
  ["map-prep", "MAP Prep", "External destination"],
  ["homework", "Homework", "PDF library"],
  ["quizzes", "Quizzes", "PDF library"],
  ["users", "Users", "Accounts"],
  ["subscriptions", "Subscriptions", "Billing operations"],
  ["analytics", "Analytics", "Aggregate signals"],
  ["media-library", "Media Library", "Protected assets"],
  ["cms", "CMS", "Structured pages"],
  ["settings", "Settings", "Server controls"],
  ["audit-log", "Audit Log", "Immutable events"]
] as const;

export type AdminSectionKey = (typeof ADMIN_SECTIONS)[number][0];

export function isAdminSectionKey(value: unknown): value is AdminSectionKey {
  return typeof value === "string" && ADMIN_SECTIONS.some(([key]) => key === value);
}
