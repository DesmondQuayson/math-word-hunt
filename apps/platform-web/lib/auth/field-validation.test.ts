import { describe, expect, it } from "vitest";

import { confirmationError, currentPasswordError, emailError, FIELD_MESSAGES, newPasswordError } from "./field-validation";

describe("account field validation (presentation only)", () => {
  it("uses plain messages for email", () => {
    expect(emailError("")).toBe("Email is required.");
    expect(emailError("   ")).toBe("Email is required.");
    expect(emailError("not-an-email")).toBe("Please enter a valid email address.");
    expect(emailError(`${"a".repeat(250)}@x.io`)).toBe(FIELD_MESSAGES.emailInvalid);
    expect(emailError(" parent@example.com ")).toBeUndefined();
  });

  it("mirrors the server password policy exactly (8–128, a letter and a number)", () => {
    expect(newPasswordError("")).toBe("Password is required.");
    expect(newPasswordError("abc1234")).toBe("Password must be at least 8 characters.");
    expect(newPasswordError(`a1${"x".repeat(127)}`)).toBe("Password must be 128 characters or fewer.");
    expect(newPasswordError("abcdefgh")).toBe("Password must include at least one letter and one number.");
    expect(newPasswordError("12345678")).toBe("Password must include at least one letter and one number.");
    expect(newPasswordError("abcdefg1")).toBeUndefined();
    expect(newPasswordError(`a1${"x".repeat(126)}`)).toBeUndefined();
  });

  it("checks only presence when signing in", () => {
    expect(currentPasswordError("")).toBe("Password is required.");
    expect(currentPasswordError("x")).toBeUndefined();
  });

  it("checks confirmation", () => {
    expect(confirmationError("abcdefg1", "")).toBe("Please confirm your password.");
    expect(confirmationError("abcdefg1", "abcdefg2")).toBe("Passwords must match.");
    expect(confirmationError("abcdefg1", "abcdefg1")).toBeUndefined();
  });
});
