import { EmptyState } from "@/components/feedback/empty-state";
import { Notice } from "@/components/feedback/notice";
import { PageHeader } from "@/components/layout/page-header";
import { TeacherShell } from "@/components/layout/teacher-shell";
import { LinkButton } from "@/components/ui/link-button";

export const metadata = { title: "Reports preview" };

export default function ReportsPage() {
  return (
    <TeacherShell currentPath="/teacher/reports">
      <PageHeader
        eyebrow="Teacher workspace · Future"
        title="Reporting starts with a privacy decision"
        description="No activity history, scores, student profiles, or classroom reports are created by this preview."
      />
      <Notice label="Reporting data status" tone="information">
        <strong>No reports exist.</strong>
        <p>
          Reporting requires an approved educational purpose, data model,
          retention policy, and cross-account security tests before development.
        </p>
      </Notice>
      <EmptyState
        symbol="∑"
        headingId="reports-empty-heading"
        title="No fabricated progress"
        description="Future reports will show only real, authorized information. This empty state intentionally contains no sample students, classes, or achievements."
        action={
          <LinkButton variant="secondary" href="/teacher">
            Back to teacher workspace
          </LinkButton>
        }
      />
    </TeacherShell>
  );
}
