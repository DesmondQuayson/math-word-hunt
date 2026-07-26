import { EmptyState } from "@/components/feedback/empty-state";
import { PrototypeDataNotice } from "@/components/feedback/prototype-data-notice";
import { PageHeader } from "@/components/layout/page-header";
import { SectionHeader } from "@/components/layout/section-header";
import { TeacherShell } from "@/components/layout/teacher-shell";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { getTeacherPrototypeState } from "@/lib/prototype/teacher-fixtures.server";

export const metadata = { title: "Activities prototype" };

export default function ActivitiesPage() {
  const prototype = getTeacherPrototypeState();

  return (
    <TeacherShell currentPath="/teacher/activities">
      <PageHeader
        eyebrow="Teacher workspace · Activities"
        title="Turn curriculum choices into a classroom-ready plan"
        description="A future activity will describe content and game settings. It will not deliver work to student accounts in the initial model."
      />

      {prototype.enabled ? (
        <>
          <PrototypeDataNotice />
          <section aria-labelledby="activity-list-heading" data-prototype-fixture="activity-list">
            <div className="section-heading-row">
              <SectionHeader eyebrow="Demonstration records" title="Activity list structure" id="activity-list-heading" compact />
              <LinkButton href="/teacher/activities/new">Prototype an activity</LinkButton>
            </div>
            <div className="record-grid">
              {prototype.data.activities.map((activity) => (
                <article key={activity.id}>
                  <Card className="record-card">
                    <div className="record-card-heading">
                      <h3>{activity.title}</h3>
                      <StatusBadge tone={activity.status === "ready" ? "success" : "warning"}>{activity.status}</StatusBadge>
                    </div>
                    <p>{activity.curriculumLabel}</p>
                    <p><strong>Mode:</strong> {activity.mode}</p>
                    <p className="record-disclaimer">Demonstration only · Not assigned</p>
                  </Card>
                </article>
              ))}
            </div>
          </section>
        </>
      ) : (
        <EmptyState
          symbol="+"
          headingId="activities-empty-heading"
          title="No saved activities"
          description="Assignment delivery and persistence do not exist. The authoring prototype demonstrates choices and validation only."
          action={<LinkButton href="/teacher/activities/new">Open activity prototype</LinkButton>}
        />
      )}

      <section className="boundary-panel" aria-labelledby="activity-boundary-heading">
        <p className="card-kicker">Content boundary</p>
        <h2 id="activity-boundary-heading">The platform summarizes; the canonical source stays canonical</h2>
        <p>
          The prototype uses a small, reviewed curriculum summary. A future
          server adapter must read the canonical content without duplicating the
          complete vocabulary dataset into the platform.
        </p>
      </section>
    </TeacherShell>
  );
}
