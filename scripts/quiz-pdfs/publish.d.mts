import type { QuizManifest, QuizTopicMap } from "./manifest.mjs";
import type { ExistingGrade, ExistingTopic, GradePlan, QuizPlan, TopicPlan } from "./plan.mjs";
type Client = { from: (...args: unknown[]) => unknown; rpc: (...args: unknown[]) => unknown; storage: unknown; auth: unknown };
export type ExistingTopicQuiz = Readonly<{
  assignmentId: string; topicId: string; resourceId: string; slug: string; sortOrder: number; resourceType: string; publicationState: string;
  currentVersion: number; publishedVersion: number | null; lockVersion: number; resourceScope: string; scopeStatus: string; versionState: string | null;
  title: string | null; fileId: string | null; fileSha256: string | null; fileBytes: number | null; fileState: string | null; fileName: string | null; originalFilename: string | null;
}>;
export type QuizPublishPlan = Readonly<{
  grades: readonly (GradePlan & Readonly<{ manifest: QuizManifest["grades"][number]; topics: readonly (TopicPlan & Readonly<{ quiz: QuizPlan }>)[] }>)[];
  conflicts: readonly Readonly<Record<string, unknown>>[];
  summary: Readonly<{ gradesToCreate: number; gradesToReuse: number; topicsToCreate: number; topicsToReuse: number; quizzesToCreate: number; quizzesToPublish: number; quizzesToSkip: number; conflicts: number }>;
}>;
export type QuizPublishOutcome = Readonly<{
  grades: readonly Readonly<{ gradeNumber: number; id: string; action: string }>[];
  topics: readonly Readonly<{ slug: string; id: string; action: string; sortOrder: number }>[];
  created: readonly Readonly<{ slug: string; resourceId: string; topicId: string }>[];
  published: readonly Readonly<{ slug: string; resourceId: string; topicId: string }>[];
  skipped: readonly Readonly<{ slug: string; resourceId: string; topicId: string }>[];
}>;
export type QuizVerificationDetail = Readonly<{
  bucketPublic: boolean | null; objectPath: string | null; downloadedBytes: number; downloadedSha256: string | null; pages: number | null;
  pageMethod: "pdfinfo" | "page-objects" | null; lessonAssignments: number | null; manifestPages: number | null;
}>;
export type QuizVerification = Readonly<{
  ok: boolean;
  results: readonly Readonly<{ gradeNumber: number; topic: string; topicSortOrder: number | null; slug: string; title: string; resourceId: string | null; topicId: string | null; ok: boolean; problems: readonly string[]; detail: QuizVerificationDetail | null }>[];
}>;
export function readTaxonomy(client: Client): Promise<Readonly<{ grades: readonly ExistingGrade[]; topics: readonly ExistingTopic[] }>>;
export function readTopicQuizzes(client: Client, topicIds: readonly string[]): Promise<readonly ExistingTopicQuiz[]>;
export function buildQuizPlan(input: Readonly<{ client: Client; manifest: QuizManifest; topicMap?: QuizTopicMap | null }>): Promise<QuizPublishPlan>;
export function describePlan(plan: QuizPublishPlan): string;
export function applyQuizPlan(input: Readonly<{ client: Client; actorAdminId: string; plan: QuizPublishPlan; log?: (line: string) => void }>): Promise<QuizPublishOutcome>;
export function verifyQuizPublication(input: Readonly<{ client: Client; manifest: QuizManifest; deep?: boolean; topicMap?: QuizTopicMap | null }>): Promise<QuizVerification>;
export function resolveActorAdmin(input: Readonly<{ client: Client; email?: string | null; adminId?: string | null; soleOwner?: boolean }>): Promise<string>;
export function createSyntheticOwner(input: Readonly<{ client: Client; runId: string }>): Promise<Readonly<{ adminId: string; userId: string; email: string }>>;
export function revokeSyntheticOwner(input: Readonly<{ client: Client; userId: string }>): Promise<void>;
