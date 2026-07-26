import "server-only";

import type { TeacherProfileRecord, UserId } from "@math-vocabulary-hunt/platform-core";

import { resolveTeacherContext } from "@/lib/auth/teacher-context";

export type TeacherSession = Readonly<{
  status: "unconfigured" | "anonymous" | "missing-profile" | "active" | "suspended" | "deletion-requested";
  teacher: null | Readonly<{ userId: UserId; email: string | null; profile: TeacherProfileRecord | null }>;
  message: string;
}>;

const anonymousTeacherSession: TeacherSession = Object.freeze({
  status: "anonymous",
  teacher: null,
  message: "Teacher accounts are not connected in this preview."
});

export async function getTeacherSession(): Promise<TeacherSession> {
  const context = await resolveTeacherContext();
  if (context.status === "unconfigured") return anonymousTeacherSession;
  if (context.status === "anonymous") {
    return { status: "anonymous", teacher: null, message: "Sign in with a local teacher account to use saved teacher data." };
  }
  if (!context.userId) return anonymousTeacherSession;
  return {
    status: context.status,
    teacher: { userId: context.userId, email: context.email, profile: context.profile },
    message: context.status === "active"
      ? "Signed in to the local teacher workspace."
      : context.status === "suspended"
        ? "This account is suspended. Protected teacher operations are unavailable."
        : context.status === "deletion-requested"
          ? "A deletion request is pending. New teacher-data writes are unavailable."
          : "The teacher profile is unavailable. Protected operations fail closed."
  };
}
