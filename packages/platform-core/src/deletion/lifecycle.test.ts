import { describe, expect, it } from "vitest";
import { canTransitionDeletion, planDeletion } from "./lifecycle";
describe("deletion lifecycle", () => {
  it("permits only staged transitions", () => { expect(canTransitionDeletion("requested", "restricted")).toBe(true); expect(canTransitionDeletion("requested", "completed")).toBe(false); });
  it("creates deterministic non-destructive plans", () => { const id="10000000-0000-0000-0000-000000000001"; expect(planDeletion(id,id,"eligible")).toEqual(planDeletion(id,id,"eligible")); expect(planDeletion(id,id,"eligible")?.destructiveExecutionEnabled).toBe(false); });
  it("rejects malformed ownership", () => expect(planDeletion("forged", "forged", "requested")).toBeNull());
});

