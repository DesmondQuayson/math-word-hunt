// Quiz PDFs V1 - pure planning rules (no I/O).
//
// The seeding script never overwrites what an owner already published. These
// functions decide, from what exists in a content database, whether a grade or
// topic is reused or created, where a new topic slots into an existing order,
// and whether a quiz is created, published, skipped or left alone as a
// conflict for a human to resolve.
export const PUBLICATION_SEQUENCE = Object.freeze({
  draft: Object.freeze(["validating", "ready_for_review", "published"]),
  validating: Object.freeze(["ready_for_review", "published"]),
  ready_for_review: Object.freeze(["published"]),
  published: Object.freeze([]),
  archived: null
});

export function normalizeTitle(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function matchExistingTopic(existingTopics, manifestTopic, mappedSlug = null) {
  const active = existingTopics.filter((topic) => topic.publicationState !== "archived");
  // An explicit map names the existing topic and disables title guessing.
  if (mappedSlug) return active.find((topic) => topic.slug === mappedSlug) ?? null;
  return active.find((topic) => topic.slug === manifestTopic.slug)
    ?? active.find((topic) => normalizeTitle(topic.title) === normalizeTitle(manifestTopic.title))
    ?? null;
}

export function planGrade(existingGrades, manifestGrade) {
  const active = existingGrades.filter((grade) => grade.publicationState !== "archived");
  const byNumber = active.find((grade) => grade.gradeNumber === manifestGrade.gradeNumber) ?? null;
  const bySlug = active.find((grade) => grade.slug === manifestGrade.slug) ?? null;
  if (byNumber) return Object.freeze({ action: "reuse", existing: byNumber, sortOrder: byNumber.sortOrder, publish: byNumber.publicationState !== "published" });
  if (bySlug) return Object.freeze({ action: "conflict", reason: "grade-slug-belongs-to-another-grade-number", existing: bySlug });
  const taken = new Set(existingGrades.map((grade) => grade.sortOrder));
  let sortOrder = manifestGrade.gradeNumber;
  while (taken.has(sortOrder)) sortOrder += 1;
  return Object.freeze({ action: "create", existing: null, sortOrder, publish: true });
}

export function planTopics(existingTopics, manifestTopics, topicMap = new Map()) {
  const ordered = [...manifestTopics].sort((left, right) => left.sortOrder - right.sortOrder);
  const taken = new Set(existingTopics.map((topic) => topic.sortOrder));
  const gradeIsEmpty = existingTopics.length === 0;
  let next = Math.max(0, ...existingTopics.map((topic) => topic.sortOrder)) + 1;
  return Object.freeze(ordered.map((manifest) => {
    const mappedSlug = topicMap.get(manifest.slug) ?? null;
    const existing = matchExistingTopic(existingTopics, manifest, mappedSlug);
    if (mappedSlug && !existing) return Object.freeze({ manifest, action: "conflict", reason: `mapped-topic-missing:${mappedSlug}`, existing: null, sortOrder: 0, publish: false, mappedSlug });
    if (existing) return Object.freeze({ manifest, action: "reuse", existing, sortOrder: existing.sortOrder, publish: existing.publicationState !== "published", mappedSlug });
    // An empty grade keeps the manifest's own numbering; a grade that already
    // has topics (for example the Homework taxonomy) appends after them so the
    // owner's existing "Topic N" labels never move.
    let sortOrder = gradeIsEmpty ? manifest.sortOrder : next;
    while (taken.has(sortOrder)) sortOrder += 1;
    taken.add(sortOrder);
    next = sortOrder + 1;
    return Object.freeze({ manifest, action: "create", existing: null, sortOrder, publish: true });
  }));
}

export function planQuiz(existingQuizzes, quiz) {
  const active = existingQuizzes.filter((entry) => entry.resourceType === "quiz_pdf");
  const same = active.find((entry) => entry.slug === quiz.slug) ?? null;
  if (!same) {
    const published = active.find((entry) => entry.publicationState === "published");
    if (published) return Object.freeze({ action: "conflict", reason: "another-quiz-is-published-for-this-topic", existing: published });
    const taken = new Set(existingQuizzes.map((entry) => entry.sortOrder));
    let sortOrder = 1;
    while (taken.has(sortOrder)) sortOrder += 1;
    return Object.freeze({ action: "create", existing: null, sortOrder });
  }
  const identical = same.fileSha256 === quiz.sha256 && same.fileState === "accepted";
  if (same.publicationState === "published") {
    return Object.freeze(identical
      ? { action: "skip", reason: "already-published-with-the-identical-file", existing: same }
      : { action: "conflict", reason: "published-with-a-different-file", existing: same });
  }
  if (same.publicationState === "archived") return Object.freeze({ action: "conflict", reason: "archived-resource-uses-this-slug", existing: same });
  return Object.freeze(identical
    ? { action: "publish", reason: "accepted-file-awaiting-publication", existing: same }
    : { action: "conflict", reason: "unpublished-draft-with-a-different-or-missing-file", existing: same });
}

export function publicationSteps(currentState) {
  const steps = PUBLICATION_SEQUENCE[currentState];
  if (!steps) throw new Error(`cannot publish from state ${currentState}`);
  return steps;
}
