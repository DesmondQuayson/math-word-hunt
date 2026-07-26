import { describe, expect, it } from "vitest";

import {
  getTeacherPrototypeState,
  resolveTeacherPrototypeMode
} from "./teacher-fixtures.server.js";

describe("teacher prototype mode", () => {
  it("enables only for an exact server flag in development or test", () => {
    expect(resolveTeacherPrototypeMode("development", "enabled")).toBe(true);
    expect(resolveTeacherPrototypeMode("test", "enabled")).toBe(true);
    expect(resolveTeacherPrototypeMode("development", "true")).toBe(false);
    expect(resolveTeacherPrototypeMode("development", undefined)).toBe(false);
    expect(resolveTeacherPrototypeMode(undefined, "enabled")).toBe(false);
  });

  it("cannot enable in production even when the flag is present", () => {
    expect(resolveTeacherPrototypeMode("production", "enabled")).toBe(false);
  });

  it("defaults to an empty state in the unit-test process", () => {
    expect(getTeacherPrototypeState()).toEqual({ enabled: false, data: null });
  });
});
