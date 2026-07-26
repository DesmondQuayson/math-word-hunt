import { describe, expect, it } from "vitest";

import {
  ACTIVITY_CURRICULUM_OPTIONS,
  CURRICULUM_INVENTORY,
  CURRICULUM_STATUS_ITEMS
} from "./curriculum-summary.js";

describe("curriculum summary adapter", () => {
  it("matches the documented canonical inventory", () => {
    expect(CURRICULUM_INVENTORY).toMatchObject({
      grades: ["6", "7", "8"],
      terms: 506,
      playableLessons: 170,
      missingLessons: 8,
      thinLessons: 13,
      unresolvedReferences: 0,
      teacherReviewComplete: false
    });
  });

  it("keeps unavailable curriculum out of selectable activity options", () => {
    const unavailable = ACTIVITY_CURRICULUM_OPTIONS.topics.find(
      (topic) => topic.value === "g6-area-volume"
    );
    expect(unavailable?.disabled).toBe(true);
    expect(CURRICULUM_STATUS_ITEMS.map((item) => item.status)).toEqual([
      "ready",
      "thin",
      "coming-soon",
      "review-pending"
    ]);
  });
});
