"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";

import type { PublicResourceLibraryData } from "@/lib/resources/catalog";

export function PublicResourceLibrary({ kind, library }: Readonly<{ kind: "homework" | "quizzes"; library: PublicResourceLibraryData }>) {
  const title = kind === "homework" ? "Homework" : "Quizzes";
  const [gradeId, setGradeId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [lessonId, setLessonId] = useState("");
  const topics = useMemo(() => library.taxonomy.topics.filter((item) => item.gradeId === gradeId), [gradeId, library.taxonomy.topics]);
  const lessons = useMemo(() => library.taxonomy.lessons.filter((item) => item.topicId === topicId), [topicId, library.taxonomy.lessons]);
  const selectionComplete = Boolean(gradeId && topicId && (kind === "quizzes" || lessonId));
  const resources = library.resources.filter((resource) => !resource.isAnswerKey && resource.gradeId === gradeId && resource.topicId === topicId && (kind === "quizzes" || resource.lessonId === lessonId));
  const selectedTopic = library.taxonomy.topics.find((item) => item.id === topicId);

  return <div className="public-resource-shell">
    <header className="public-resource-hero">
      <p className="eyebrow">{kind === "homework" ? "Grade → Topic → Lesson" : "Grade → Topic"}</p>
      <h1>{title}</h1>
      <p>{kind === "homework" ? "Choose a lesson, preview the teacher-reviewed activity, then download its private PDF." : "Choose a topic to find its teacher-reviewed Topic Quiz—no lesson selection required."}</p>
    </header>
    <section className="resource-filter-panel" aria-labelledby={`${kind}-browse-heading`}>
      <h2 id={`${kind}-browse-heading`}>Find {kind === "homework" ? "a lesson activity" : "a topic quiz"}</h2>
      <div className="resource-filter-grid">
        <label><span>Grade</span><select value={gradeId} onChange={(event) => { setGradeId(event.target.value); setTopicId(""); setLessonId(""); }}><option value="">Choose a grade</option>{library.taxonomy.grades.map((grade) => <option key={grade.id} value={grade.id}>{grade.title}</option>)}</select></label>
        <label><span>Topic</span><select value={topicId} disabled={!gradeId} onChange={(event) => { setTopicId(event.target.value); setLessonId(""); }}><option value="">Choose a topic</option>{topics.map((topic) => <option key={topic.id} value={topic.id}>Topic {topic.sortOrder}: {topic.title}</option>)}</select></label>
        {kind === "homework" ? <label><span>Lesson</span><select value={lessonId} disabled={!topicId} onChange={(event) => setLessonId(event.target.value)}><option value="">Choose a lesson</option>{lessons.map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}</select></label> : null}
      </div>
    </section>
    {!selectionComplete ? <div className="public-resource-empty"><strong>{library.taxonomy.grades.length ? `Choose ${kind === "homework" ? "a grade, topic, and lesson" : "a grade and topic"}` : `No published ${title.toLowerCase()} yet`}</strong><p>{library.taxonomy.grades.length ? "Your active subscription is ready; use the selectors above to browse published content." : "Your subscription is active. The owner has not published curriculum content for this library yet."}</p></div> : resources.length ? <div className="public-resource-groups">{resources.map((resource) => <article className="public-resource-card" key={resource.id}>
      {resource.previewFileIds[0] ? <Image unoptimized width={640} height={360} sizes="(max-width: 48rem) 100vw, 18rem" src={`/resources/${resource.id}/preview/${resource.previewFileIds[0]}`} alt="" /> : <div className="public-resource-placeholder" aria-hidden="true">{resource.grade.replace(/[^0-9]/g, "") || "M"}</div>}
      <div><p className="public-resource-path">{resource.grade} / Topic {resource.topicNumber}: {resource.topic}{resource.lesson ? ` / ${resource.lesson}` : ""}</p><h2>{resource.title}</h2><p>{resource.description}</p>
        <dl><div><dt>Difficulty</dt><dd>{resource.difficulty ?? "Not specified"}</dd></div><div><dt>Recommended time</dt><dd>{resource.minutes ? `${resource.minutes} minutes` : "Not specified"}</dd></div><div><dt>Answer key</dt><dd>{resource.answerKeyResourceId ? "Available" : "Not published"}</dd></div></dl>
        <div className="public-resource-actions"><Link href={`/resources/${resource.id}`}>Preview details</Link>{resource.downloadable ? <a href={`/resources/${resource.id}/download`}>Download {kind === "homework" ? "Homework" : "Quiz"} PDF</a> : <span>Download unavailable</span>}{resource.answerKeyResourceId ? <a href={`/resources/${resource.answerKeyResourceId}/download`}>Download answer key</a> : null}</div>
      </div>
    </article>)}</div> : <div className="public-resource-empty" role="status"><strong>{kind === "homework" ? "No homework has been published for this lesson yet" : `No quiz has been published for Topic ${selectedTopic?.sortOrder ?? ""} yet`}</strong><p>Your subscription is active. Choose another {kind === "homework" ? "lesson" : "topic"}, or check back after new content is published.</p></div>}
  </div>;
}
