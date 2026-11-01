import type { PdfLibrarySummary } from "@/lib/seo/catalog-summaries";

/**
 * The published grades and topic names of a PDF library, for the public
 * Homework PDFs and Quiz PDFs pages. Names only: no lesson, file or preview
 * address. Renders nothing when the library could not be read.
 */
export function PdfCatalogSummary({ id, title, summary }: Readonly<{ id: string; title: string; summary: PdfLibrarySummary }>) {
  if (!summary.grades.length) return null;
  return <section aria-labelledby={id}>
    <h2 id={id}>{title}</h2>
    <div className="product-grade-list">
      {summary.grades.map((grade) => <div key={grade.grade}>
        <h3>{grade.grade}</h3>
        <ul>{grade.topics.map((topic) => <li key={topic}>{topic}</li>)}</ul>
      </div>)}
    </div>
  </section>;
}
