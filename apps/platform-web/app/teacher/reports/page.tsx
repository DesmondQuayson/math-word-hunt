import { EmptyState } from "@/components/feedback/empty-state";
import { PrototypeDataNotice } from "@/components/feedback/prototype-data-notice";
import { Notice } from "@/components/feedback/notice";
import { PageHeader } from "@/components/layout/page-header";
import { SectionHeader } from "@/components/layout/section-header";
import { TeacherShell } from "@/components/layout/teacher-shell";
import { ReportTable } from "@/components/teacher/report-table";
import { SummaryMetric } from "@/components/teacher/summary-metric";
import { LinkButton } from "@/components/ui/link-button";
import { getTeacherPrototypeState } from "@/lib/prototype/teacher-fixtures.server";

export const metadata = { title: "Reports prototype" };

export default function ReportsPage() {
  const prototype = getTeacherPrototypeState();

  return (
    <TeacherShell currentPath="/teacher/reports">
      <PageHeader
        eyebrow="Teacher workspace · Reports"
        title="Review the lesson, not a prediction about a child"
        description="Future reporting should help a teacher decide what vocabulary to revisit using class-, activity-, lesson-, and session-level aggregates."
      />

      {prototype.enabled ? (
        <>
          <PrototypeDataNotice />
          <section aria-labelledby="report-summary-heading" data-prototype-fixture="report-summary">
            <SectionHeader eyebrow="Demonstration aggregates" title="Report information structure" id="report-summary-heading" compact />
            <div className="metric-grid">
              <SummaryMetric label="Sample sessions" value="5" detail="Across demonstration rows" />
              <SummaryMetric label="Sample teams" value="18" detail="No individual students" />
              <SummaryMetric label="Lessons shown" value={prototype.data.reportRows.length} detail="Demonstration only" />
            </div>
            <ReportTable rows={prototype.data.reportRows} />
          </section>
        </>
      ) : (
        <EmptyState
          symbol="∑"
          headingId="reports-empty-heading"
          title="No reports exist"
          description="No activities, sessions, scores, student profiles, or report persistence exist in production-default mode."
          action={<LinkButton href="/teacher/sessions">Review session architecture</LinkButton>}
        />
      )}

      <section className="report-category-grid" aria-labelledby="report-categories-heading">
        <SectionHeader eyebrow="Future information architecture" title="Useful reporting levels" id="report-categories-heading" compact />
        <ul>
          <li><strong>Class overview</strong><span>Aggregate activity and session history.</span></li>
          <li><strong>Activity completion</strong><span>Whether a teacher-led activity ran, without individual tracking.</span></li>
          <li><strong>Lesson performance</strong><span>Vocabulary response patterns at lesson level.</span></li>
          <li><strong>Vocabulary strengths</strong><span>Terms recalled consistently by teams.</span></li>
          <li><strong>Needs review</strong><span>Terms a teacher may revisit next.</span></li>
          <li><strong>Session history</strong><span>Teacher-owned aggregate records and recovery context.</span></li>
        </ul>
      </section>

      <Notice label="Reporting limits" tone="warning">
        <strong>No mastery or predictive claims.</strong>
        <p>The prototype contains no standards alignment, student-level analytics, ranking, or automated educational judgment.</p>
      </Notice>
    </TeacherShell>
  );
}
