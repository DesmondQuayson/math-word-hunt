import { describe, expect, it } from "vitest";

import { parseClassRecord } from "./class-record.js";

const activeClass = {
  classId: "class-1",
  ownerTeacherId: "teacher-1",
  className: "Period 2 math",
  grade: "7",
  periodOrSection: "Period 2",
  status: "active",
  archivedAt: null,
  createdAt: "2026-07-26T12:00:00Z",
  updatedAt: "2026-07-26T12:00:00Z"
};

describe("class record contract", () => {
  it("accepts a class without any student information", () => {
    expect(parseClassRecord(activeClass)).toMatchObject({ ok: true });
  });

  it("enforces archive semantics", () => {
    expect(parseClassRecord({ ...activeClass, status: "archived" })).toMatchObject({
      ok: false,
      error: { field: "archivedAt" }
    });
    expect(parseClassRecord({
      ...activeClass,
      status: "archived",
      archivedAt: "2026-07-27T12:00:00Z"
    })).toMatchObject({ ok: true });
  });

  it("rejects student identifiers and invalid grades", () => {
    expect(parseClassRecord({ ...activeClass, studentIds: ["student-1"] })).toMatchObject({ ok: false });
    expect(parseClassRecord({ ...activeClass, grade: "12" })).toMatchObject({
      ok: false,
      error: { field: "grade" }
    });
  });
});
