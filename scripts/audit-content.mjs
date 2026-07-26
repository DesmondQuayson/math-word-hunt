import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const canonicalHtmlPath = "docs/index.html";
const canonicalVocabPath = "docs/vocab.js";
const historicalVocabPath = "vocab.js";
const expectedHashes = {
  html: "8F957F59720816FE490E27BFD0C8214EB53D13F26A76BEB0176A4D8383319148",
  vocab: "CAEB8FBB590FFFD8CBC169F88F174A38C26DE2D16A7E1B0C1CF5E83AC9F01C46"
};

const [html, vocabSource, historicalVocab] = await Promise.all([
  readFile(canonicalHtmlPath, "utf8"),
  readFile(canonicalVocabPath, "utf8"),
  readFile(historicalVocabPath, "utf8")
]);

const hash = (value) =>
  createHash("sha256").update(value).digest("hex").toUpperCase();
assert.equal(hash(html), expectedHashes.html, "Canonical v7 HTML changed unexpectedly");
assert.equal(hash(vocabSource), expectedHashes.vocab, "Canonical vocab.js changed unexpectedly");
assert.equal(historicalVocab, vocabSource, "Root and deployment vocabulary copies have drifted");
assert.match(
  html,
  /<script src="vocab\.js"><\/script>/,
  "Canonical HTML must load its sibling vocab.js"
);

const context = {};
vm.createContext(context);
vm.runInContext(
  vocabSource +
    "\n;globalThis.__CONTENT_AUDIT__ = { TERMS, CURRICULUM, buildLesson, auditCurriculum };",
  context,
  { filename: canonicalVocabPath }
);

const { TERMS, CURRICULUM, buildLesson, auditCurriculum } =
  context.__CONTENT_AUDIT__;
assert.equal(Object.keys(TERMS).length, 506, "Unexpected term-library size");
assert.deepEqual(
  Object.keys(CURRICULUM),
  ["6", "7", "8"],
  "Unexpected grade catalog"
);

const expectedPlayable = { "6": 53, "7": 57, "8": 60 };
const missingLessons = [];
const thinLessons = [];
const missingReferences = [];

for (const [grade, gradeData] of Object.entries(CURRICULUM)) {
  let playable = 0;
  for (const topic of gradeData.topics) {
    for (const lesson of topic.lessons) {
      for (const key of lesson.terms) {
        if (!TERMS[key]) {
          missingReferences.push(grade + " " + lesson.id + ": " + key);
        }
      }
      if (lesson.terms.length === 0) {
        missingLessons.push(grade + " " + lesson.id + ": " + lesson.title);
        continue;
      }
      playable += 1;
      const built = buildLesson(grade, topic.id, lesson.id);
      assert.ok(
        built.placeable.length > 0,
        grade + " " + lesson.id + " is not playable"
      );
      if (built.placeable.length < 4) {
        thinLessons.push(
          grade + " " + lesson.id + ": " + built.placeable.length + " placeable"
        );
      }
    }
  }
  assert.equal(
    playable,
    expectedPlayable[grade],
    "Grade " + grade + " playable count changed"
  );
}

assert.deepEqual(
  missingReferences,
  [],
  "Curriculum contains unresolved term references"
);
assert.equal(
  missingLessons.length,
  8,
  "Expected eight documented missing Grade 6 lessons"
);
assert.equal(
  thinLessons.length,
  13,
  "Thin-lesson inventory changed; update its review documentation"
);

const blockingAuditProblems = auditCurriculum().filter(
  (problem) => !/: only \d+ placeable — Combine Mode required$/.test(problem)
);
assert.equal(
  blockingAuditProblems.length,
  0,
  "Curriculum audit found a blocking problem: " +
    blockingAuditProblems.join("; ")
);

console.log("Canonical integrity: passed");
console.log("Terms: 506; playable lessons: 170; unresolved references: 0");
console.log(
  "Documented gaps: " +
    missingLessons.length +
    " missing lessons; " +
    thinLessons.length +
    " thin lessons"
);
