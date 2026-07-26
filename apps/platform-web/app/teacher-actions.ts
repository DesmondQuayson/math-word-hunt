"use server";

import {
  parseActivityDefinition,
  parseClassRecord,
  type ActivityGameMode,
  type ClassGrade
} from "@math-vocabulary-hunt/platform-core";
import { revalidatePath } from "next/cache";

import { resolveTeacherContext } from "@/lib/auth/teacher-context";
import { createServerRepositories } from "@/lib/repositories/server-repositories";
import type { TeacherFormState } from "@/lib/teacher/form-state";

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function unavailable(message = "Sign in with an active local teacher account to continue."): TeacherFormState {
  return { status: "error", message };
}

async function activeResources() {
  const [context, repositories] = await Promise.all([resolveTeacherContext(), createServerRepositories()]);
  if (context.status !== "active" || !context.profile || !repositories) return null;
  return { context, repositories };
}

export async function createClassAction(_previous: TeacherFormState, formData: FormData): Promise<TeacherFormState> {
  const resources = await activeResources();
  if (!resources) return unavailable();
  const now = new Date().toISOString();
  const parsed = parseClassRecord({
    classId: crypto.randomUUID(),
    ownerTeacherId: resources.context.userId,
    className: field(formData, "className"),
    grade: field(formData, "grade") || null,
    periodOrSection: field(formData, "section") || null,
    status: "active",
    archivedAt: null,
    createdAt: now,
    updatedAt: now
  });
  if (!parsed.ok) return { status: "error", message: parsed.error.message, fieldErrors: parsed.error.field ? { [parsed.error.field]: parsed.error.message } : undefined };
  const saved = await resources.repositories.classes.save(parsed.value);
  if (!saved.ok) return { status: "error", message: saved.error.message };
  revalidatePath("/teacher/classes");
  return { status: "success", message: "Class saved to the local teacher account." };
}

export async function archiveClassAction(formData: FormData): Promise<void> {
  const resources = await activeResources();
  const classId = field(formData, "classId");
  if (!resources || !classId) return;
  await resources.repositories.classes.archive(resources.context.userId, classId);
  revalidatePath("/teacher/classes");
  revalidatePath(`/teacher/classes/${classId}`);
}

const allowedTopics = new Set(["g6-expressions", "g7-rational", "g7-probability"]);
const allowedLessons = new Set(["g6-3-6", "g7-1-2", "g7-7-3", "g7-7-4"]);

export async function createActivityAction(_previous: TeacherFormState, formData: FormData): Promise<TeacherFormState> {
  const resources = await activeResources();
  if (!resources) return unavailable();
  const grade = field(formData, "grade");
  const topicId = field(formData, "topic");
  const lessonId = field(formData, "lesson");
  const classId = field(formData, "classId") || null;
  const fieldErrors: Record<string, string> = {};
  if (!allowedTopics.has(topicId)) fieldErrors.topicId = "Choose an available curriculum topic.";
  if (!allowedLessons.has(lessonId)) fieldErrors.lessonId = "Choose an available lesson.";
  if ((topicId.startsWith("g6-") || lessonId.startsWith("g6-")) && grade !== "6") fieldErrors.grade = "Grade must match the selected content.";
  if ((topicId.startsWith("g7-") || lessonId.startsWith("g7-")) && grade !== "7") fieldErrors.grade = "Grade must match the selected content.";
  if (classId) {
    const classRecord = await resources.repositories.classes.getById(resources.context.userId, classId);
    if (!classRecord.ok || classRecord.value.status !== "active") fieldErrors.classId = "Choose one of your active classes.";
  }
  if (Object.keys(fieldErrors).length > 0) return { status: "error", message: "Check the activity information.", fieldErrors };

  const now = new Date().toISOString();
  const parsed = parseActivityDefinition({
    activityId: crypto.randomUUID(),
    ownerTeacherId: resources.context.userId,
    classId,
    grade: grade as ClassGrade,
    topicId,
    lessonId,
    gameMode: "team-hunt" as ActivityGameMode,
    timeLimitMinutes: Number(field(formData, "timeLimit")),
    teamCount: Number(field(formData, "teamCount")),
    combineMode: formData.get("combineMode") === "on",
    status: "draft",
    createdAt: now,
    updatedAt: now
  });
  if (!parsed.ok) return { status: "error", message: parsed.error.message, fieldErrors: parsed.error.field ? { [parsed.error.field]: parsed.error.message } : undefined };
  const saved = await resources.repositories.activities.save(parsed.value);
  if (!saved.ok) return { status: "error", message: saved.error.message };
  revalidatePath("/teacher/activities");
  return { status: "success", message: "Activity draft saved to the local teacher account." };
}

export async function updateProfileAction(_previous: TeacherFormState, formData: FormData): Promise<TeacherFormState> {
  const resources = await activeResources();
  if (!resources) return unavailable("Only an active teacher account can update profile information.");
  const parsed = {
    ...resources.context.profile,
    displayName: field(formData, "displayName"),
    organizationLabel: field(formData, "schoolLabel") || null,
    updatedAt: new Date().toISOString()
  };
  const saved = await resources.repositories.profiles.save(parsed);
  if (!saved.ok) return { status: "error", message: saved.error.message };
  revalidatePath("/account");
  revalidatePath("/teacher");
  return { status: "success", message: "Profile updated." };
}

export async function requestAccountDeletionAction(_previous: TeacherFormState): Promise<TeacherFormState> {
  void _previous;
  const resources = await activeResources();
  if (!resources) return unavailable("Only an active teacher account can create a deletion request.");
  const created = await resources.repositories.deletionRequests.create(resources.context.userId);
  if (!created.ok) return { status: "error", message: created.error.message };
  revalidatePath("/account");
  revalidatePath("/teacher");
  return { status: "success", message: "Deletion request recorded. No account data was permanently deleted." };
}
