import { EmptyState } from "@/components/feedback/empty-state";
import { PrototypeDataNotice } from "@/components/feedback/prototype-data-notice";
import { PageHeader } from "@/components/layout/page-header";
import { SectionHeader } from "@/components/layout/section-header";
import { TeacherShell } from "@/components/layout/teacher-shell";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { resolveTeacherContext } from "@/lib/auth/teacher-context";
import { getTeacherPrototypeState } from "@/lib/prototype/teacher-fixtures.server";
import { createServerRepositories } from "@/lib/repositories/server-repositories";

export const metadata = { title: "Activities" };

export default async function ActivitiesPage() {
  const prototype = getTeacherPrototypeState();
  const context = prototype.enabled ? null : await resolveTeacherContext();
  const repositories = context?.status === "active" ? await createServerRepositories() : null;
  const result = repositories && context?.userId ? await repositories.activities.listByOwner(context.userId) : null;
  const activities = result?.ok ? result.value : [];
  const realMode = context?.status === "active";

  return (
    <TeacherShell currentPath="/teacher/activities" accountNote={realMode ? "Local activity drafts are enabled. Assignment delivery remains unavailable." : undefined}>
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
              <LinkButton href="/teacher/activities/new">Review activity setup</LinkButton>
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
      ) : realMode ? (
        <section aria-labelledby="activity-list-heading" data-testid="real-activity-list">
          <div className="section-heading-row"><SectionHeader eyebrow="Your saved records" title="Activity drafts" id="activity-list-heading" compact /><LinkButton href="/teacher/activities/new">Create activity draft</LinkButton></div>
          {activities.length ? <div className="record-grid">{activities.map((activity) => (
            <article key={activity.activityId}><Card className="record-card"><div className="record-card-heading"><h3>{activity.lessonId}</h3><StatusBadge tone={activity.status === "ready" ? "success" : "warning"}>{activity.status}</StatusBadge></div><p>Grade {activity.grade} · {activity.topicId}</p><p><strong>Mode:</strong> Team vocabulary hunt</p><p>{activity.timeLimitMinutes} minutes · {activity.teamCount} teams</p><p className="record-disclaimer">Saved locally · Not assigned</p></Card></article>
          ))}</div> : <EmptyState symbol="+" headingId="activities-empty-heading" title="No saved activity drafts" description="Create a supported local draft. Assignment delivery and managed sessions remain unavailable." action={<LinkButton href="/teacher/activities/new">Create activity draft</LinkButton>} />}
        </section>
      ) : (
        <EmptyState
          symbol="+"
          headingId="activities-empty-heading"
          title="No saved activities"
          description={context?.configured ? "Sign in with an active local teacher account to view saved activity drafts." : "Saving and assignment delivery are not available. You can review the activity choices and validation without creating an activity."}
          action={context?.configured ? <LinkButton href="/sign-in">Sign in</LinkButton> : <LinkButton href="/teacher/activities/new">Review activity setup</LinkButton>}
        />
      )}

      <section className="boundary-panel" aria-labelledby="activity-boundary-heading">
        <p className="card-kicker">Content boundary</p>
        <h2 id="activity-boundary-heading">Activity planning uses the current v7 curriculum</h2>
        <p>
          This preview uses a small curriculum summary. Future activity planning
          must read the current v7 curriculum without copying the complete word
          list into a second source.
        </p>
      </section>
    </TeacherShell>
  );
}
