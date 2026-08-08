const ADMIN_LOCALE = "en-US";
const ADMIN_TIME_ZONE = "America/Chicago";

export function formatAdminNumber(value: number): string {
  return new Intl.NumberFormat(ADMIN_LOCALE).format(value);
}

export function formatAdminDate(value: string | Date): string {
  return new Intl.DateTimeFormat(ADMIN_LOCALE, {
    dateStyle: "medium",
    timeZone: ADMIN_TIME_ZONE
  }).format(new Date(value));
}

export function formatAdminDateTime(value: string | Date): string {
  return new Intl.DateTimeFormat(ADMIN_LOCALE, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: ADMIN_TIME_ZONE
  }).format(new Date(value));
}
