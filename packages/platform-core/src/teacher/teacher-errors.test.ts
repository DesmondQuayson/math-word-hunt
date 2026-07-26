import { describe, expect, it } from "vitest";

import {
  denyTeacherOperation,
  teacherFailure,
  teacherSuccess
} from "./teacher-errors.js";

describe("teacher contract results", () => {
  it("represents successful serialization-safe values", () => {
    expect(teacherSuccess({ count: 2 })).toEqual({ ok: true, value: { count: 2 } });
  });

  it("represents explicit validation failures", () => {
    expect(teacherFailure("validation", "Enter a class name.", "className")).toEqual({
      ok: false,
      error: { code: "validation", message: "Enter a class name.", field: "className" }
    });
  });

  it("denies unknown authority by default", () => {
    expect(denyTeacherOperation()).toMatchObject({
      ok: false,
      error: { code: "unauthorized" }
    });
  });
});
