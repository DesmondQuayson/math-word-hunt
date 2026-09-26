import Link from "next/link";
import { notFound } from "next/navigation";

import { Container } from "@/components/layout/container";
import { PdfViewer } from "@/components/resources/pdf-viewer";
import { requireProductAccess } from "@/lib/access/server";
import { loadPublicResource } from "@/lib/resources/catalog";

export const metadata = { title: "Quiz PDF preview" };
export const dynamic = "force-dynamic";

/**
 * The Quiz PDF preview page: the approved PDF, read in place without a
 * download. The same server-side product entitlement as the details page and
 * the library guards the page; the bytes come from /resources/[id]/inline,
 * which applies the download route's authorization. Quiz resources only:
 * Homework keeps its details-and-download experience unchanged.
 */
export default async function QuizPdfPreviewPage({ params }: { params: Promise<{ resourceId: string }> }) {
  const resource = await loadPublicResource((await params).resourceId);
  if (!resource || resource.resourceType !== "quiz_pdf" || !resource.downloadable) notFound();
  await requireProductAccess("/quizzes");
  return <Container className="page-stack" width="wide">
    <div className="resource-preview">
      <header className="resource-preview-header">
        <p className="eyebrow">{resource.grade} / Topic {resource.topicNumber}: {resource.topic}</p>
        <h1>{resource.title}</h1>
        <p className="resource-preview-lead">Quiz PDF preview: the approved PDF, page by page, without downloading it first{resource.answerKeyIncluded ? ". The answers page is at the end." : "."}</p>
        <div className="button-row resource-preview-actions">
          <Link className="button button-secondary" href="/quizzes">Back to Quiz PDFs</Link>
          <Link className="button button-secondary" href={`/resources/${resource.id}`}>Details</Link>
          <a className="button button-primary" href={`/resources/${resource.id}/download`}>Download PDF</a>
        </div>
      </header>
      <PdfViewer src={`/resources/${resource.id}/inline`} title={resource.title} />
    </div>
  </Container>;
}
