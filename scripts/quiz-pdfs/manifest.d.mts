export type QuizAnswerKeyMode = "included" | "separate" | "none";
export type QuizManifestQuiz = Readonly<{
  slug: string; title: string; successCriteria: readonly string[]; description: string; sourceFile: string; file: string;
  absolutePath: string; downloadFilename: string; bytes: number; sha256: string; pages: number; answerKey: QuizAnswerKeyMode;
  answerKeyNote: string; tags: readonly string[];
}>;
export type QuizManifestTopic = Readonly<{ sortOrder: number; title: string; slug: string; titleSource: string; quiz: QuizManifestQuiz }>;
export type QuizManifestGrade = Readonly<{ gradeNumber: number; title: string; slug: string; topicOrder: string; topics: readonly QuizManifestTopic[] }>;
export type QuizManifestEntry = QuizManifestQuiz & Readonly<{ gradeNumber: number; gradeTitle: string; gradeSlug: string; topicSortOrder: number; topicTitle: string; topicSlug: string }>;
export type QuizManifest = Readonly<{
  version: 1; product: string; organization: string; source: Readonly<Record<string, unknown>> | null; path: string; root: string;
  grades: readonly QuizManifestGrade[]; quizzes: readonly QuizManifestEntry[];
}>;
export type QuizFileFinding = Readonly<{ code: string; detail: string }>;
export type QuizFileInspection = Readonly<{ ok: boolean; findings: readonly QuizFileFinding[]; bytes: number; sha256: string | null; inspection: unknown }>;
export type QuizFileVerification = Readonly<{ ok: boolean; results: readonly (QuizFileInspection & Readonly<{ slug: string; file: string }>)[] }>;
export type QuizManifestSummary = Readonly<{
  totalQuizzes: number; answerKeysIncluded: number; separateAnswerKeys: number; withoutAnswerKey: number;
  grades: readonly Readonly<{ gradeNumber: number; title: string; count: number; topics: readonly Readonly<{ sortOrder: number; title: string; quizTitle: string; sourceFile: string; downloadFilename: string; pages: number; bytes: number; answerKey: QuizAnswerKeyMode }>[] }>[];
}>;
export const REPOSITORY_ROOT: string;
export const QUIZ_CONTENT_ROOT: string;
export const QUIZ_MANIFEST_PATH: string;
export const PUBLIC_ASSET_ROOT: string;
export const QUIZ_ANSWER_KEY_MODES: readonly QuizAnswerKeyMode[];
export function sha256Of(bytes: Uint8Array | string): string;
export function buildQuizDescription(successCriteria: readonly string[]): string;
export function loadQuizManifest(root?: string): QuizManifest;
export function inspectQuizFile(quiz: QuizManifestQuiz): QuizFileInspection;
export function verifyQuizFiles(manifest: QuizManifest): QuizFileVerification;
export function findPublicPdfs(root?: string): readonly string[];
export function summarizeQuizManifest(manifest: QuizManifest): QuizManifestSummary;
export function renderContentAudit(summary: QuizManifestSummary, verification?: QuizFileVerification | null): string;
export type QuizTopicMapEntry = Readonly<{ gradeNumber: number; manifestSlug: string; existingSlug: string; note: string }>;
export type QuizTopicMap = Readonly<{ path: string; entries: ReadonlyMap<string, QuizTopicMapEntry>; size: number; purpose: string }>;
export const QUIZ_TOPIC_MAP_PATH: string;
export function loadQuizTopicMap(manifest: QuizManifest, path?: string): QuizTopicMap;
export function topicMapForGrade(topicMap: QuizTopicMap | null, gradeNumber: number): Map<string, string>;
export function applyQuizTopicMap(manifest: QuizManifest, topicMap: QuizTopicMap | null): QuizManifest;
