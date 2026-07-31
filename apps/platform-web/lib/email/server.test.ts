import { describe, expect, it } from "vitest";

import { getAuthEmailExperience } from "./server";

describe("Auth email experience", () => {
  it.each([
    [undefined, "disabled", "unavailable"],
    ["local-capture", "local-capture", "captured locally"],
    ["transactional-configured", "transactional-configured", "not verified"],
    ["transactional-verified", "transactional-verified", "are verified"]
  ])("reports %s truthfully", (value, state, phrase) => {
    const result = getAuthEmailExperience({ MVH_EMAIL_DELIVERY: value });
    expect(result.state).toBe(state);
    expect(`${result.title} ${result.description}`).toContain(phrase);
  });
  it("uses generic recovery responses in every state", () => {
    for (const state of ["disabled", "local-capture", "transactional-configured", "transactional-verified"]) {
      expect(getAuthEmailExperience({ MVH_EMAIL_DELIVERY: state }).recoveryResponse).toMatch(/^If that teacher account exists,/);
    }
  });
  it("uses general-account copy without teacher or pilot claims for consumer identity", () => {
    for (const state of ["disabled", "local-capture", "transactional-configured", "transactional-verified"]) {
      const experience = getAuthEmailExperience({ MVH_EMAIL_DELIVERY: state }, "consumer");
      expect(`${experience.description} ${experience.recoveryResponse}`).not.toMatch(/teacher|pilot/i);
      expect(experience.recoveryResponse).toMatch(/^If that account exists,/);
    }
  });
});
