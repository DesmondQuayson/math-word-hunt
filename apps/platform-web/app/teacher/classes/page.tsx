import { EmptyState } from "@/components/feedback/empty-state";
import { Notice } from "@/components/feedback/notice";
import { PageHeader } from "@/components/layout/page-header";
import { TeacherShell } from "@/components/layout/teacher-shell";
import { LinkButton } from "@/components/ui/link-button";

export const metadata = { title: "Classes preview" };

export default function ClassesPage() {
  return (
    <TeacherShell currentPath="/teacher/classes">
      <PageHeader
        eyebrow="Teacher workspace · Future"
        title="Class tools are not connected"
        description="This page reserves a clear place for future classroom management without collecting names, rosters, or student accounts."
      />
      <Notice label="Classroom data status" tone="information">
        <strong>No classroom data is saved.</strong>
        <p>
          Class creation, rosters, invitations, and persistence are outside this
          platform-shell phase.
        </p>
      </Notice>
      <EmptyState
        symbol="Aa"
        headingId="classes-empty-heading"
        title="Nothing to manage yet"
        description="When this area is implemented, it will begin with teacher-controlled, privacy-reviewed workflows. No student account model is assumed."
        action={
          <LinkButton variant="secondary" href="/teacher">
            Back to teacher workspace
          </LinkButton>
        }
      />
    </TeacherShell>
  );
}
