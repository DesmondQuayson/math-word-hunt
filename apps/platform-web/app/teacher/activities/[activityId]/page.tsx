import { archiveActivityAction } from "@/app/teacher-actions";
import { ExistingDataSafeNotice } from "@/components/capabilities/existing-data-safe-notice";
import { EmptyState } from "@/components/feedback/empty-state";
import { EditActivityForm } from "@/components/forms/teacher-data-forms";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { PageHeader } from "@/components/layout/page-header";
import { TeacherShell } from "@/components/layout/teacher-shell";
import { LinkButton } from "@/components/ui/link-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { getCapabilityAccessView } from "@/lib/capabilities/server";
import { createServerRepositories } from "@/lib/repositories/server-repositories";

export const metadata = { title: "Activity draft" };

export default async function ActivityDetailPage({ params }: Readonly<{ params: Promise<{ activityId: string }> }>) {
  const { activityId } = await params;
  const access = await getCapabilityAccessView();
  const repositories = access.context.status === "active" ? await createServerRepositories() : null;
  const result = repositories && access.context.userId ? await repositories.activities.getById(access.context.userId, activityId) : null;
  const activity = result?.ok ? result.value : null;
  const classResult = repositories && access.context.userId ? await repositories.classes.listByOwner(access.context.userId) : null;
  const classOptions = classResult?.ok ? classResult.value.filter((item) => item.status === "active").map((item) => ({ value: item.classId, label: item.className })) : [];

  return <TeacherShell currentPath={`/teacher/activities/${activityId}`} accountNote={activity ? "Existing activity drafts remain editable after downgrade." : undefined}>
    <Breadcrumbs items={[{ label: "Activities", href: "/teacher/activities" }, { label: activity?.lessonId ?? "Activity unavailable" }]} />
    {activity ? <>
      <PageHeader eyebrow="Teacher-owned activity · Saved locally" title={activity.lessonId} description="Edit this existing owned draft without creating a new constrained record."><StatusBadge tone="warning">{activity.status}</StatusBadge></PageHeader>
      <ExistingDataSafeNotice />
      <EditActivityForm activity={activity} classOptions={classOptions} />
      <form action={archiveActivityAction}><input type="hidden" name="activityId" value={activity.activityId} /><button className="button button-secondary" type="submit">Archive activity draft</button></form>
    </> : <>
      <PageHeader eyebrow="Activity details" title="Activity unavailable" description="The draft does not exist, does not belong to this teacher, or the account cannot read protected data." />
      <EmptyState symbol="+" headingId="activity-detail-empty" title="Return to activities" description="Changing the page address cannot reveal another teacher’s activity." action={<LinkButton href="/teacher/activities">Back to activities</LinkButton>} />
    </>}
  </TeacherShell>;
}
