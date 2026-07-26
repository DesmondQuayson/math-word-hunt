export const CURRICULUM_INVENTORY = Object.freeze({
  grades: Object.freeze(["6", "7", "8"] as const),
  terms: 506,
  playableLessons: 170,
  missingLessons: 8,
  thinLessons: 13,
  unresolvedReferences: 0,
  teacherReviewComplete: false
});

export type CurriculumStatusKey =
  | "ready"
  | "thin"
  | "coming-soon"
  | "review-pending";

export const CURRICULUM_STATUS_ITEMS = Object.freeze([
  Object.freeze({
    id: "grades-6-8",
    title: "Grades 6–8 lesson library",
    status: "ready" as const,
    description: "170 lessons have resolvable vocabulary and a playable grid path."
  }),
  Object.freeze({
    id: "thin-lessons",
    title: "13 thin lessons",
    status: "thin" as const,
    description: "Use Combine Mode to create a fuller grid from two or more lessons."
  }),
  Object.freeze({
    id: "grade-6-topic-7",
    title: "Grade 6 area, surface area, and volume",
    status: "coming-soon" as const,
    description: "Eight lesson records have no vocabulary terms and remain unavailable."
  }),
  Object.freeze({
    id: "teacher-review",
    title: "Definitions and examples",
    status: "review-pending" as const,
    description: "Technical checks pass, but curriculum definitions still require teacher review."
  })
]);

export const ACTIVITY_CURRICULUM_OPTIONS = Object.freeze({
  grades: Object.freeze([
    Object.freeze({ value: "6", label: "Grade 6" }),
    Object.freeze({ value: "7", label: "Grade 7" }),
    Object.freeze({ value: "8", label: "Grade 8" })
  ]),
  topics: Object.freeze([
    Object.freeze({ value: "g6-expressions", label: "Grade 6 · Numeric and Algebraic Expressions" }),
    Object.freeze({ value: "g7-rational", label: "Grade 7 · Rational Numbers" }),
    Object.freeze({ value: "g7-probability", label: "Grade 7 · Probability" }),
    Object.freeze({ value: "g6-area-volume", label: "Grade 6 · Area, Surface Area, and Volume (coming soon)", disabled: true })
  ]),
  lessons: Object.freeze([
    Object.freeze({ value: "g6-3-6", label: "6-3-6 · Generate Equivalent Expressions" }),
    Object.freeze({ value: "g7-1-2", label: "7-1-2 · Understand Rational Numbers (thin)" }),
    Object.freeze({ value: "g7-7-3", label: "7-7-3 · Understand Experimental Probability" }),
    Object.freeze({ value: "g7-7-4", label: "7-7-4 · Use Probability Models (thin)" })
  ])
});
