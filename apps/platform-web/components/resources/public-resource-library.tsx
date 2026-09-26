"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";

import type { PublicResource, PublicResourceLibraryData } from "@/lib/resources/catalog";

/**
 * Two libraries, one design. Homework PDFs are lesson-by-lesson
 * (Grade → Topic → Lesson → PDF); Quiz PDFs are topic-by-topic
 * (Grade → Topic → PDF). They share the hero, the filter panel, the card and
 * the empty states so they read as one product; only the browsing path and
 * the copy differ. Nothing here decides access: the route re-checks the
 * entitlement on the server before this renders.
 */
export function PublicResourceLibrary({ kind, library }: Readonly<{ kind: "homework" | "quizzes"; library: PublicResourceLibraryData }>) {
  return kind === "quizzes" ? <QuizLibrary library={library} /> : <HomeworkLibrary library={library} />;
}

function HomeworkLibrary({ library }: Readonly<{ library: PublicResourceLibraryData }>) {
  const [gradeId, setGradeId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [lessonId, setLessonId] = useState("");
  const topics = useMemo(() => library.taxonomy.topics.filter((item) => item.gradeId === gradeId), [gradeId, library.taxonomy.topics]);
  const lessons = useMemo(() => library.taxonomy.lessons.filter((item) => item.topicId === topicId), [topicId, library.taxonomy.lessons]);
  const selectionComplete = Boolean(gradeId && topicId && lessonId);
  const resources = library.resources.filter((resource) => !resource.isAnswerKey && resource.gradeId === gradeId && resource.topicId === topicId && resource.lessonId === lessonId);

  return <div className="public-resource-shell">
    <header className="public-resource-hero">
      <p className="eyebrow">Grade → Topic → Lesson</p>
      <h1>Homework PDFs</h1>
      <p>Preview a lesson activity and download its PDF.</p>
    </header>
    <section className="resource-filter-panel" aria-labelledby="homework-browse-heading">
      <h2 id="homework-browse-heading">Find a lesson activity</h2>
      <div className="resource-filter-grid">
        <label><span>Grade</span><select value={gradeId} onChange={(event) => { setGradeId(event.target.value); setTopicId(""); setLessonId(""); }}><option value="">Choose a grade</option>{library.taxonomy.grades.map((grade) => <option key={grade.id} value={grade.id}>{grade.title}</option>)}</select></label>
        <label><span>Topic</span><select value={topicId} disabled={!gradeId} onChange={(event) => { setTopicId(event.target.value); setLessonId(""); }}><option value="">Choose a topic</option>{topics.map((topic) => <option key={topic.id} value={topic.id}>Topic {topic.sortOrder}: {topic.title}</option>)}</select></label>
        <label><span>Lesson</span><select value={lessonId} disabled={!topicId} onChange={(event) => setLessonId(event.target.value)}><option value="">Choose a lesson</option>{lessons.map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}</select></label>
      </div>
    </section>
    {!selectionComplete
      ? <EmptyState title={library.taxonomy.grades.length ? "Choose a grade, topic, and lesson" : "No published homework yet"} detail={library.taxonomy.grades.length ? "Your active subscription is ready; use the selectors above to browse published content." : "Your subscription is active. The owner has not published curriculum content for this library yet."} />
      : resources.length
        ? <div className="public-resource-groups">{resources.map((resource) => <ResourceCard key={resource.id} resource={resource} />)}</div>
        : <EmptyState title="No homework has been published for this lesson yet" detail="Your subscription is active. Choose another lesson, or check back after new content is published." status />}
  </div>;
}

function QuizLibrary({ library }: Readonly<{ library: PublicResourceLibraryData }>) {
  const [gradeId, setGradeId] = useState("");
  // Only what actually exists: a grade is offered when it has a published
  // quiz, and only topics with a published quiz become cards. No placeholder
  // topics, no lesson layer.
  const quizzes = useMemo(() => library.resources.filter((resource) => !resource.isAnswerKey), [library.resources]);
  const grades = useMemo(() => library.taxonomy.grades.filter((grade) => quizzes.some((quiz) => quiz.gradeId === grade.id)), [library.taxonomy.grades, quizzes]);
  const grade = grades.find((item) => item.id === gradeId) ?? null;
  const topics = useMemo(() => library.taxonomy.topics
    .filter((topic) => topic.gradeId === gradeId && quizzes.some((quiz) => quiz.topicId === topic.id))
    .sort((left, right) => left.sortOrder - right.sortOrder), [gradeId, library.taxonomy.topics, quizzes]);
  const cards = useMemo(() => topics.flatMap((topic) => quizzes.filter((quiz) => quiz.topicId === topic.id).sort((left, right) => left.title.localeCompare(right.title))), [topics, quizzes]);

  return <div className="public-resource-shell">
    <header className="public-resource-hero">
      <p className="eyebrow">Grade → Topic</p>
      <h1>Quiz PDFs</h1>
      <p>Topic-by-topic math quizzes for practice, review, and assessment.</p>
    </header>
    <section className="resource-filter-panel" aria-labelledby="quizzes-browse-heading">
      <h2 id="quizzes-browse-heading">Choose a grade</h2>
      <div className="resource-filter-grid resource-filter-grid--single">
        <label><span>Grade</span><select value={gradeId} onChange={(event) => setGradeId(event.target.value)}><option value="">Choose a grade</option>{grades.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      </div>
    </section>
    {!grades.length
      ? <EmptyState title="No published quizzes yet" detail="Your subscription is active. The owner has not published quiz content for this library yet." />
      : !grade
        ? <EmptyState title="Choose a grade to see its quiz topics" detail="Your active subscription is ready. Every topic in the grade you choose links to its quiz PDF." />
        : cards.length
          ? <section className="public-resource-topics" aria-labelledby="quiz-topics-heading">
            <div className="public-resource-topics-heading">
              <h2 id="quiz-topics-heading">Quiz Topics</h2>
              <p>{grade.title} · {topics.length === 1 ? "1 topic" : `${topics.length} topics`}, one quiz PDF each.</p>
            </div>
            <div className="public-resource-groups">{cards.map((resource) => <ResourceCard key={resource.id} resource={resource} designation="Quiz PDF" />)}</div>
          </section>
          : <EmptyState title={`No quiz has been published for ${grade.title} yet`} detail="Your subscription is active. Choose another grade, or check back after new content is published." status />}
  </div>;
}

function EmptyState({ title, detail, status = false }: Readonly<{ title: string; detail: string; status?: boolean }>) {
  return <div className="public-resource-empty" role={status ? "status" : undefined}><strong>{title}</strong><p>{detail}</p></div>;
}

function answerKeyStatus(resource: PublicResource): string {
  if (resource.answerKeyResourceId) return "Available";
  if (resource.answerKeyIncluded) return "Included in PDF";
  return "Not published";
}

function ResourceCard({ resource, designation }: Readonly<{ resource: PublicResource; designation?: string }>) {
  return <article className="public-resource-card">
    {resource.previewFileIds[0]
      ? <Image unoptimized width={640} height={360} sizes="(max-width: 48rem) 100vw, 18rem" src={`/resources/${resource.id}/preview/${resource.previewFileIds[0]}`} alt="" />
      : <div className="public-resource-placeholder" aria-hidden="true">{resource.grade.replace(/[^0-9]/g, "") || "M"}</div>}
    <div>
      {designation ? <p className="resource-kind-label">{designation}</p> : null}
      <p className="public-resource-path">{resource.grade} / Topic {resource.topicNumber}: {resource.topic}{resource.lesson ? ` / ${resource.lesson}` : ""}</p>
      <h2>{resource.title}</h2>
      <p>{resource.description}</p>
      <dl>
        <div><dt>Difficulty</dt><dd>{resource.difficulty ?? "Not specified"}</dd></div>
        <div><dt>Recommended time</dt><dd>{resource.minutes ? `${resource.minutes} minutes` : "Not specified"}</dd></div>
        <div><dt>Answer key</dt><dd>{answerKeyStatus(resource)}</dd></div>
      </dl>
      <div className="public-resource-actions">
        <Link href={`/resources/${resource.id}`}>Details</Link>
        {resource.downloadable ? <a href={`/resources/${resource.id}/download`}>Download PDF</a> : <span>PDF not yet published</span>}
        {resource.answerKeyResourceId ? <a href={`/resources/${resource.answerKeyResourceId}/download`}>Answer key</a> : null}
      </div>
    </div>
  </article>;
}
