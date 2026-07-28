import { describe, expect, it } from "vitest";

import { createPilotEvent, parsePilotCorrelationId } from "./operations";

describe("pilot operational evidence", () => {
  it("accepts only safe opaque correlation IDs", () => {
    expect(parsePilotCorrelationId("pilotrun_1234")).toBe("pilotrun_1234");
    expect(parsePilotCorrelationId("teacher@example.test")).toBeNull();
    expect(parsePilotCorrelationId("short")).toBeNull();
  });

  it("creates a low-cardinality event with no provider or personal field", () => {
    expect(createPilotEvent({ code: "pilot.fixture.cleaned", correlationId: "pilotrun_1234", result: "complete", route: "teacher", environment: "local" })).toEqual({
      category: "pilot",
      severity: "info",
      code: "pilot.fixture.cleaned",
      correlationId: "pilotrun_1234",
      detail: { result: "complete", route: "teacher", environment: "local" }
    });
  });

  it("rejects an unsafe correlation ID", () => {
    expect(createPilotEvent({ code: "pilot.incident.stop", correlationId: "teacher@example.test", result: "stopped", route: "support", environment: "preview" })).toBeNull();
  });
});
