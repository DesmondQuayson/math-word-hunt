// Quiz PDFs V1 - manifest loader, file verification and content audit.
//
// The manifest (content/quiz-pdfs/manifest.json) is the single record of the
// owner's approved quiz PDFs: exact source filename -> grade -> topic -> the
// byte-identical stored copy -> the public download filename. This module never
// touches a database; it only reads the repository. The same structural PDF
// validator the admin upload uses (phase 8D) decides whether a file is
// publishable, so a file the admin form would quarantine fails here too.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { inspectPdfUpload } from "../../packages/platform-core/src/admin-files/pdf-validation.ts";

export const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const QUIZ_CONTENT_ROOT = "content/quiz-pdfs";
export const QUIZ_MANIFEST_PATH = `${QUIZ_CONTENT_ROOT}/manifest.json`;
export const PUBLIC_ASSET_ROOT = "apps/platform-web/public";
export const QUIZ_TOPIC_MAP_PATH = `${QUIZ_CONTENT_ROOT}/production-topic-map.json`;
export const QUIZ_ANSWER_KEY_MODES = Object.freeze(["included", "separate", "none"]);

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA256 = /^[a-f0-9]{64}$/;
const DOWNLOAD_FILENAME = /^[a-z0-9]+(?:-[a-z0-9]+)*\.pdf$/;
const LESSON_WORDING = /\blessons?\b/i;

export function sha256Of(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function fail(code, detail) {
  const error = new Error(`${code}: ${detail}`);
  error.code = code;
  throw error;
}

function requireText(value, code, maximum, label) {
  if (typeof value !== "string" || value !== value.trim() || value.length < 1 || value.length > maximum) {
    fail(code, `${label} must be trimmed text of 1-${maximum} characters`);
  }
  return value;
}

function requireInteger(value, code, minimum, maximum, label) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) fail(code, `${label} must be an integer between ${minimum} and ${maximum}`);
  return value;
}

export function buildQuizDescription(successCriteria) {
  const sentences = successCriteria.map((item) => (/[.!?]$/.test(item) ? item : `${item}.`));
  return `Success criteria: ${sentences.join(" ")} Answers are included on the final page.`;
}

function parseQuiz(topic, quiz, root, seen) {
  if (!quiz || typeof quiz !== "object" || Array.isArray(quiz)) fail("quiz-shape", `topic ${topic.slug} needs a quiz object`);
  const slug = requireText(quiz.slug, "quiz-slug", 96, `quiz slug for topic ${topic.slug}`);
  if (!SLUG.test(slug)) fail("quiz-slug", `quiz slug ${slug} is not a lowercase hyphenated slug`);
  if (seen.quizSlugs.has(slug)) fail("quiz-slug-duplicate", `quiz slug ${slug} appears twice`);
  seen.quizSlugs.add(slug);
  const title = requireText(quiz.title, "quiz-title", 160, `quiz title for ${slug}`);
  const description = requireText(quiz.description, "quiz-description", 4000, `quiz description for ${slug}`);
  if (LESSON_WORDING.test(title) || LESSON_WORDING.test(description) || LESSON_WORDING.test(topic.title)) {
    fail("lesson-wording", `quiz ${slug} uses lesson wording; Quiz PDFs are organized by topic`);
  }
  if (!Array.isArray(quiz.successCriteria) || quiz.successCriteria.length < 1 || quiz.successCriteria.some((item) => typeof item !== "string" || !item.trim())) {
    fail("quiz-success-criteria", `quiz ${slug} needs at least one success criterion copied from the PDF`);
  }
  if (description !== buildQuizDescription(quiz.successCriteria)) fail("quiz-description", `quiz ${slug} description must be built from its success criteria`);
  const sourceFile = requireText(quiz.sourceFile, "quiz-source-file", 255, `source filename for ${slug}`);
  const file = requireText(quiz.file, "quiz-file", 512, `stored file for ${slug}`);
  if (file.includes("..") || file.includes("\\") || file.startsWith("/")) fail("quiz-file", `stored file ${file} must be a relative path inside ${QUIZ_CONTENT_ROOT}`);
  if (seen.files.has(file)) fail("quiz-file-duplicate", `stored file ${file} is referenced twice`);
  seen.files.add(file);
  const downloadFilename = requireText(quiz.downloadFilename, "quiz-download-filename", 100, `download filename for ${slug}`);
  if (!DOWNLOAD_FILENAME.test(downloadFilename)) fail("quiz-download-filename", `download filename ${downloadFilename} must be a normalized .pdf name`);
  if (basename(file) !== downloadFilename) fail("quiz-download-filename", `stored file ${file} must be named after its download filename ${downloadFilename}`);
  if (seen.downloadFilenames.has(downloadFilename)) fail("quiz-download-duplicate", `download filename ${downloadFilename} appears twice`);
  seen.downloadFilenames.add(downloadFilename);
  const bytes = requireInteger(quiz.bytes, "quiz-bytes", 16, 20 * 1024 * 1024, `byte size for ${slug}`);
  if (typeof quiz.sha256 !== "string" || !SHA256.test(quiz.sha256)) fail("quiz-sha256", `sha256 for ${slug} must be 64 lowercase hex characters`);
  if (seen.shas.has(quiz.sha256)) fail("quiz-sha256-duplicate", `sha256 for ${slug} duplicates another quiz (duplicate upload)`);
  seen.shas.add(quiz.sha256);
  const pages = requireInteger(quiz.pages, "quiz-pages", 1, 500, `page count for ${slug}`);
  if (!QUIZ_ANSWER_KEY_MODES.includes(quiz.answerKey)) fail("quiz-answer-key", `answerKey for ${slug} must be one of ${QUIZ_ANSWER_KEY_MODES.join(", ")}`);
  if (!Array.isArray(quiz.tags) || quiz.tags.length > 20 || quiz.tags.some((tag) => typeof tag !== "string" || !SLUG.test(tag) || tag.length > 48)) {
    fail("quiz-tags", `tags for ${slug} must be lowercase hyphenated words`);
  }
  if (new Set(quiz.tags).size !== quiz.tags.length) fail("quiz-tags", `tags for ${slug} repeat`);
  return Object.freeze({
    slug,
    title,
    successCriteria: Object.freeze([...quiz.successCriteria]),
    description,
    sourceFile,
    file,
    absolutePath: resolve(root, QUIZ_CONTENT_ROOT, file),
    downloadFilename,
    bytes,
    sha256: quiz.sha256,
    pages,
    answerKey: quiz.answerKey,
    answerKeyNote: typeof quiz.answerKeyNote === "string" ? quiz.answerKeyNote : "",
    tags: Object.freeze([...new Set(quiz.tags)].sort())
  });
}

export function loadQuizManifest(root = REPOSITORY_ROOT) {
  const path = resolve(root, QUIZ_MANIFEST_PATH);
  const raw = JSON.parse(readFileSync(path, "utf8"));
  if (raw.version !== 1 || raw.product !== "quiz-pdfs") fail("manifest-shape", "a version 1 quiz-pdfs manifest is required");
  if (!Array.isArray(raw.grades) || raw.grades.length === 0) fail("manifest-grades", "at least one grade is required");
  const seen = { gradeNumbers: new Set(), gradeSlugs: new Set(), quizSlugs: new Set(), files: new Set(), downloadFilenames: new Set(), shas: new Set() };
  const grades = [];
  const quizzes = [];
  for (const grade of raw.grades) {
    const gradeNumber = requireInteger(grade.gradeNumber, "grade-number", 1, 9, "gradeNumber");
    if (seen.gradeNumbers.has(gradeNumber)) fail("grade-duplicate", `grade ${gradeNumber} appears twice`);
    seen.gradeNumbers.add(gradeNumber);
    const title = requireText(grade.title, "grade-title", 80, `title for grade ${gradeNumber}`);
    const slug = requireText(grade.slug, "grade-slug", 96, `slug for grade ${gradeNumber}`);
    if (!SLUG.test(slug) || seen.gradeSlugs.has(slug)) fail("grade-slug", `grade slug ${slug} is invalid or repeated`);
    seen.gradeSlugs.add(slug);
    if (!Array.isArray(grade.topics) || grade.topics.length === 0) fail("grade-topics", `grade ${gradeNumber} lists no topics`);
    const topicSlugs = new Set();
    const topicOrders = new Set();
    const topics = grade.topics.map((topic) => {
      const sortOrder = requireInteger(topic.sortOrder, "topic-order", 1, 32767, `topic order in grade ${gradeNumber}`);
      if (topicOrders.has(sortOrder)) fail("topic-order-duplicate", `grade ${gradeNumber} uses topic order ${sortOrder} twice`);
      topicOrders.add(sortOrder);
      const topicTitle = requireText(topic.title, "topic-title", 120, `topic title in grade ${gradeNumber}`);
      const topicSlug = requireText(topic.slug, "topic-slug", 96, `topic slug in grade ${gradeNumber}`);
      if (!SLUG.test(topicSlug) || topicSlugs.has(topicSlug)) fail("topic-slug", `topic slug ${topicSlug} is invalid or repeated in grade ${gradeNumber}`);
      topicSlugs.add(topicSlug);
      const normalizedTopic = { sortOrder, title: topicTitle, slug: topicSlug, titleSource: typeof topic.titleSource === "string" ? topic.titleSource : "" };
      const quiz = parseQuiz(normalizedTopic, topic.quiz, root, seen);
      return Object.freeze({ ...normalizedTopic, quiz });
    }).sort((left, right) => left.sortOrder - right.sortOrder);
    const gradeRecord = Object.freeze({ gradeNumber, title, slug, topicOrder: typeof grade.topicOrder === "string" ? grade.topicOrder : "", topics: Object.freeze(topics) });
    grades.push(gradeRecord);
    for (const topic of topics) {
      quizzes.push(Object.freeze({
        gradeNumber, gradeTitle: title, gradeSlug: slug,
        topicSortOrder: topic.sortOrder, topicTitle: topic.title, topicSlug: topic.slug,
        ...topic.quiz
      }));
    }
  }
  grades.sort((left, right) => left.gradeNumber - right.gradeNumber);
  return Object.freeze({
    version: 1,
    product: raw.product,
    organization: typeof raw.organization === "string" ? raw.organization : "grade -> topic -> quiz",
    source: raw.source && typeof raw.source === "object" ? Object.freeze({ ...raw.source }) : null,
    path,
    root,
    grades: Object.freeze(grades),
    quizzes: Object.freeze(quizzes)
  });
}

/** Structural verification of one stored quiz PDF against its manifest entry. */
export function inspectQuizFile(quiz) {
  const findings = [];
  if (!existsSync(quiz.absolutePath)) return Object.freeze({ ok: false, findings: [{ code: "missing-file", detail: `${quiz.file} does not exist` }], bytes: 0, sha256: null, inspection: null });
  const bytes = readFileSync(quiz.absolutePath);
  if (bytes.length === 0) findings.push({ code: "empty-file", detail: `${quiz.file} is empty` });
  if (bytes.length !== quiz.bytes) findings.push({ code: "size-mismatch", detail: `${quiz.file} is ${bytes.length} bytes, manifest says ${quiz.bytes}` });
  const sha256 = sha256Of(bytes);
  if (sha256 !== quiz.sha256) findings.push({ code: "sha256-mismatch", detail: `${quiz.file} hashes to ${sha256}, manifest says ${quiz.sha256}` });
  if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) findings.push({ code: "invalid-header", detail: `${quiz.file} does not start with %PDF-` });
  if (!bytes.subarray(Math.max(0, bytes.length - 2048)).includes("%%EOF")) findings.push({ code: "missing-eof", detail: `${quiz.file} has no %%EOF marker` });
  const inspection = inspectPdfUpload({ filename: quiz.downloadFilename, mimeType: "application/pdf", bytes: new Uint8Array(bytes) });
  if (inspection.decision !== "accepted") findings.push({ code: "pdf-rejected", detail: `${quiz.file} would be quarantined: ${inspection.findings.map((item) => item.code).join(", ")}` });
  if (inspection.normalizedFilename !== quiz.downloadFilename) findings.push({ code: "download-filename", detail: `${quiz.downloadFilename} normalizes to ${inspection.normalizedFilename}` });
  return Object.freeze({ ok: findings.length === 0, findings: Object.freeze(findings), bytes: bytes.length, sha256, inspection });
}

export function verifyQuizFiles(manifest) {
  const results = manifest.quizzes.map((quiz) => ({ slug: quiz.slug, file: quiz.file, ...inspectQuizFile(quiz) }));
  return Object.freeze({ ok: results.every((item) => item.ok), results: Object.freeze(results) });
}

/** Every *.pdf under the app's public directory would be served without an entitlement check. */
export function findPublicPdfs(root = REPOSITORY_ROOT) {
  const publicRoot = resolve(root, PUBLIC_ASSET_ROOT);
  const found = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.pdf$/i.test(entry)) found.push(relative(root, path).replaceAll("\\", "/"));
    }
  };
  if (existsSync(publicRoot)) walk(publicRoot);
  return Object.freeze(found.sort());
}

export function summarizeQuizManifest(manifest) {
  const grades = manifest.grades.map((grade) => ({
    gradeNumber: grade.gradeNumber,
    title: grade.title,
    count: grade.topics.length,
    topics: grade.topics.map((topic) => ({
      sortOrder: topic.sortOrder,
      title: topic.title,
      quizTitle: topic.quiz.title,
      sourceFile: topic.quiz.sourceFile,
      downloadFilename: topic.quiz.downloadFilename,
      pages: topic.quiz.pages,
      bytes: topic.quiz.bytes,
      answerKey: topic.quiz.answerKey
    }))
  }));
  return Object.freeze({
    totalQuizzes: manifest.quizzes.length,
    grades: Object.freeze(grades),
    answerKeysIncluded: manifest.quizzes.filter((quiz) => quiz.answerKey === "included").length,
    separateAnswerKeys: manifest.quizzes.filter((quiz) => quiz.answerKey === "separate").length,
    withoutAnswerKey: manifest.quizzes.filter((quiz) => quiz.answerKey === "none").length
  });
}

export function renderContentAudit(summary, verification = null) {
  const lines = [];
  for (const grade of summary.grades) {
    lines.push(`Grade ${grade.gradeNumber}`, `Quiz PDFs: ${grade.count}`, "Topics:");
    for (const topic of grade.topics) lines.push(`- Topic ${topic.sortOrder}: ${topic.title} - "${topic.quizTitle}" (${topic.pages} pages, ${topic.downloadFilename})`);
    lines.push("");
  }
  const broken = verification ? verification.results.filter((item) => !item.ok).length : "not checked";
  lines.push(
    `Total quiz PDFs: ${summary.totalQuizzes}`,
    "Duplicates: 0 (sha256 unique across the manifest)",
    "Unclassified: 0",
    `Missing/broken: ${broken}`,
    `Answer keys included: ${summary.answerKeysIncluded}`,
    `Separate answer keys: ${summary.separateAnswerKeys}`,
    `Without answer key: ${summary.withoutAnswerKey}`
  );
  return lines.join("\n");
}

/**
 * Optional production topic map: manifest topic slug -> the slug of a topic
 * that already exists in that grade of the target content database. A mapped
 * quiz joins the existing topic (title and numbering untouched) instead of
 * creating a new one. Unmapped topics keep the default slug/title matching.
 */
export function loadQuizTopicMap(manifest, path = resolve(manifest.root, QUIZ_TOPIC_MAP_PATH)) {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  if (raw.version !== 1 || !raw.grades || typeof raw.grades !== "object" || Array.isArray(raw.grades)) fail("topic-map-shape", "a version 1 topic map with a grades object is required");
  const entries = new Map();
  for (const [gradeKey, topics] of Object.entries(raw.grades)) {
    const gradeNumber = Number(gradeKey);
    const grade = manifest.grades.find((item) => item.gradeNumber === gradeNumber);
    if (!grade) fail("topic-map-grade", `grade ${gradeKey} is not in the manifest`);
    if (!topics || typeof topics !== "object" || Array.isArray(topics)) fail("topic-map-grade", `grade ${gradeKey} must map topic slugs`);
    const targets = new Set();
    for (const [manifestSlug, target] of Object.entries(topics)) {
      if (!grade.topics.some((topic) => topic.slug === manifestSlug)) fail("topic-map-topic", `${manifestSlug} is not a manifest topic of grade ${gradeKey}`);
      const existingSlug = typeof target === "string" ? target : target?.existingSlug;
      if (typeof existingSlug !== "string" || !SLUG.test(existingSlug)) fail("topic-map-target", `${manifestSlug} must map to a lowercase hyphenated existing topic slug`);
      if (targets.has(existingSlug)) fail("topic-map-target", `existing topic ${existingSlug} is mapped twice in grade ${gradeKey}`);
      targets.add(existingSlug);
      entries.set(`${gradeNumber}:${manifestSlug}`, Object.freeze({ gradeNumber, manifestSlug, existingSlug, note: target && typeof target === "object" && typeof target.note === "string" ? target.note : "" }));
    }
  }
  return Object.freeze({ path, entries, size: entries.size, purpose: typeof raw.purpose === "string" ? raw.purpose : "" });
}

export function topicMapForGrade(topicMap, gradeNumber) {
  const map = new Map();
  if (!topicMap) return map;
  for (const entry of topicMap.entries.values()) if (entry.gradeNumber === gradeNumber) map.set(entry.manifestSlug, entry.existingSlug);
  return map;
}
