import { describe, expect, it } from "vitest";

import { checkPilotText, planningLabelError } from "./content-safety";

describe("pilot content safety", () => {
  it("allows general teacher planning labels", () => {
    expect(planningLabelError("Period 2 Algebra")).toBeNull();
    expect(checkPilotText("The launch button did not open the game.", 200)).toEqual({ safe: true, value: "The launch button did not open the game." });
  });

  it.each(["Student name: Example", "Grade 7 roster", "IEP review", "teacher@example.test", "password reset token"])("rejects obvious prohibited content: %s", (value) => {
    expect(checkPilotText(value, 200).safe).toBe(false);
  });

  it("normalizes controls and enforces the maximum length", () => {
    expect(checkPilotText("  safe\u0000 text  ", 9)).toEqual({ safe: true, value: "safe text" });
    expect(checkPilotText("abcdefghijkl", 5)).toEqual({ safe: true, value: "abcde" });
  });
});
