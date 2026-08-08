import { describe, expect, it } from "vitest";

import { formatAdminDate, formatAdminDateTime, formatAdminNumber } from "./format";

describe("admin hydration-safe formatting", () => {
  it("uses a fixed locale and Central time zone for server and client rendering", () => {
    const instant = "2026-08-08T00:30:00.000Z";

    expect(formatAdminDate(instant)).toBe("Aug 7, 2026");
    expect(formatAdminDateTime(instant)).toBe("Aug 7, 2026, 7:30 PM");
    expect(formatAdminNumber(1234567)).toBe("1,234,567");
  });
});
