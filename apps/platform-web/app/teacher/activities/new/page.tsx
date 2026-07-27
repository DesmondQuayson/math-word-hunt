import { Notice } from "@/components/feedback/notice";
import { CapabilityBoundary } from "@/components/capabilities/capability-boundary";
import { ExistingDataSafeNotice } from "@/components/capabilities/existing-data-safe-notice";
import { UpgradePrompt } from "@/components/capabilities/upgrade-prompt";
import { UsageLimitSummary } from "@/components/capabilities/usage-limit-summary";
import { ActivityFormPrototype } from "@/components/forms/activity-form-prototype";
import { RealActivityForm } from "@/components/forms/teacher-data-forms";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { PageHeader } from "@/components/layout/page-header";
import { TeacherShell } from "@/components/layout/teacher-shell";
import { WorkflowStepper } from "@/components/teacher/workflow-stepper";
import { getCapabilityAccessView } from "@/lib/capabilities/server";
import { getTeacherPrototypeState } from "@/lib/prototype/teacher-fixtures.server";
import { createServerRepositories } from "@/lib/repositories/server-repositories";

export const metadata = { title: "Plan an activity" };
const steps = [{ label: "Content", description: "Grade, topic, lesson" }, { label: "Play", description: "Mode, time, teams" }, { label: "Review", description: "Check before saving" }] as const;

export default async function NewActivityPage() {
  const prototype = getTeacherPrototypeState();
  const access = await getCapabilityAccessView();
  const context = prototype.enabled ? null : access.context;
  const repositories = context?.status === "active" ? await createServerRepositories() : null;
  const classResult = repositories && context?.userId ? await repositories.classes.listByOwner(context.userId) : null;
  const classOptions = classResult?.ok ? classResult.value.filter((item) => item.status === "active").map((item) => ({ value: item.classId, label: item.className })) : [];
  const realMode = context?.status === "active";
  const decision = access.decisions["activity.create"];

  return <TeacherShell currentPath="/teacher/activities/new" accountNote={realMode ? "Local activity drafts are enabled. Assignment delivery remains unavailable." : undefined}>
    <Breadcrumbs items={[{ label: "Activities", href: "/teacher/activities" }, { label: "Plan an activity" }]} />
    <PageHeader eyebrow={realMode ? "Activity draft · Local account" : "Planning preview · Saving unavailable"} title="Shape a vocabulary activity" description={realMode ? "Choose approved content and classroom settings, then save a teacher-owned draft." : "Choose the content, time, and team settings you would need before class. You can check the form, but you cannot save or assign the activity."} />
    <WorkflowStepper steps={steps} currentStep={1} label="Activity authoring steps" />
    <Notice label="Curriculum selection guidance" tone="information"><strong>Thin lessons need a fuller word pool.</strong><p>Choose Combine Mode when a lesson has fewer than four placeable terms.</p></Notice>
    {realMode ? <ExistingDataSafeNotice /> : null}
    {realMode && access.usage ? <UsageLimitSummary label="Active activity drafts" current={access.usage.activeActivityCount} maximum={access.usage.activeActivityLimit} planLabel={access.usage.planKey === "free" ? "Free" : "Teacher Pro"} headingId="new-activity-capacity" /> : null}
    {realMode ? <CapabilityBoundary decision={decision} fallback={<UpgradePrompt decision={decision} />}><RealActivityForm classOptions={classOptions} /></CapabilityBoundary> : <ActivityFormPrototype />}
  </TeacherShell>;
}
