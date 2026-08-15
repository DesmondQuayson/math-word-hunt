import { describe, expect, it } from "vitest";
import { CONTROLLED_PILOT_STATES } from "@math-vocabulary-hunt/platform-core";
import { formatPilotDate, getPilotStatusCopy } from "./copy";

describe("pilot status copy", () => {
  it.each(CONTROLLED_PILOT_STATES)("has truthful copy for %s", (state) => {
    const value = getPilotStatusCopy({ state } as never);
    expect(value.label.length).toBeGreaterThan(5);
    expect(value.detail).not.toMatch(/production|public/i);
  });
  it("formats approved dates in the operating timezone", () => expect(formatPilotDate("2026-09-01T19:00:00.000Z")).toMatch(/Sep 1, 2026/));
  it("does not fabricate a missing date", () => expect(formatPilotDate(null)).toBeNull());
});
