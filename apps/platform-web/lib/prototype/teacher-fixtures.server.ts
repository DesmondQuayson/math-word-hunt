import "server-only";

export type PrototypeClass = Readonly<{
  id: string;
  name: string;
  grade: "6" | "7" | "8";
  section: string | null;
  status: "active" | "archived";
  createdLabel: string;
  activityCount: number;
}>;

export type PrototypeActivity = Readonly<{
  id: string;
  title: string;
  curriculumLabel: string;
  mode: string;
  status: "draft" | "ready";
}>;

export type PrototypeSession = Readonly<{
  id: string;
  title: string;
  classLabel: string;
  status: "ready" | "completed" | "reconnect";
  teams: number;
  termsReviewed: number;
}>;

export type PrototypeReportRow = Readonly<{
  lesson: string;
  sessions: number;
  teams: number;
  correctPercent: number;
  reviewCategory: "Ready to revisit" | "Continue practice" | "Strong recall";
}>;

export type TeacherPrototypeData = Readonly<{
  teacherLabel: string;
  classes: readonly PrototypeClass[];
  activities: readonly PrototypeActivity[];
  sessions: readonly PrototypeSession[];
  reportRows: readonly PrototypeReportRow[];
}>;

export type TeacherPrototypeState = Readonly<
  | { enabled: false; data: null }
  | { enabled: true; data: TeacherPrototypeData }
>;

const ENABLED_VALUE = "enabled";

export function resolveTeacherPrototypeMode(
  nodeEnvironment: string | undefined,
  serverFlag: string | undefined
): boolean {
  return (
    (nodeEnvironment === "development" || nodeEnvironment === "test") &&
    serverFlag === ENABLED_VALUE
  );
}

const prototypeData: TeacherPrototypeData = Object.freeze({
  teacherLabel: "Demonstration teacher",
  classes: Object.freeze([
    Object.freeze({
      id: "algebra-foundations",
      name: "Algebra foundations",
      grade: "7" as const,
      section: "Period 2",
      status: "active" as const,
      createdLabel: "July 2026",
      activityCount: 2
    }),
    Object.freeze({
      id: "math-language-lab",
      name: "Math language lab",
      grade: "6" as const,
      section: "Block A",
      status: "active" as const,
      createdLabel: "July 2026",
      activityCount: 1
    })
  ]),
  activities: Object.freeze([
    Object.freeze({
      id: "rational-number-review",
      title: "Rational number language review",
      curriculumLabel: "Grade 7 · Rational numbers",
      mode: "Team vocabulary hunt",
      status: "ready" as const
    }),
    Object.freeze({
      id: "expression-warmup",
      title: "Expression vocabulary warm-up",
      curriculumLabel: "Grade 6 · Numeric and algebraic expressions",
      mode: "Combine Mode",
      status: "draft" as const
    })
  ]),
  sessions: Object.freeze([
    Object.freeze({
      id: "probability-team-hunt",
      title: "Probability team hunt",
      classLabel: "Algebra foundations",
      status: "ready" as const,
      teams: 4,
      termsReviewed: 18
    }),
    Object.freeze({
      id: "expressions-recap",
      title: "Expressions recap",
      classLabel: "Math language lab",
      status: "completed" as const,
      teams: 3,
      termsReviewed: 16
    })
  ]),
  reportRows: Object.freeze([
    Object.freeze({
      lesson: "Understand Rational Numbers",
      sessions: 2,
      teams: 7,
      correctPercent: 68,
      reviewCategory: "Ready to revisit" as const
    }),
    Object.freeze({
      lesson: "Generate Equivalent Expressions",
      sessions: 1,
      teams: 3,
      correctPercent: 81,
      reviewCategory: "Continue practice" as const
    }),
    Object.freeze({
      lesson: "Understand Experimental Probability",
      sessions: 2,
      teams: 8,
      correctPercent: 92,
      reviewCategory: "Strong recall" as const
    })
  ])
});

const disabledState: TeacherPrototypeState = Object.freeze({
  enabled: false,
  data: null
});

const enabledState: TeacherPrototypeState = Object.freeze({
  enabled: true,
  data: prototypeData
});

export function getTeacherPrototypeState(): TeacherPrototypeState {
  return resolveTeacherPrototypeMode(
    process.env.NODE_ENV,
    process.env.MVH_TEACHER_PROTOTYPE_MODE
  )
    ? enabledState
    : disabledState;
}

export function getPrototypeClassById(classId: string): PrototypeClass | null {
  const state = getTeacherPrototypeState();
  if (!state.enabled) return null;
  return state.data.classes.find((classRecord) => classRecord.id === classId) ?? null;
}
