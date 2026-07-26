import { Notice } from "@/components/feedback/notice";
import { ActivityFormPrototype } from "@/components/forms/activity-form-prototype";
import { RealActivityForm } from "@/components/forms/teacher-data-forms";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { PageHeader } from "@/components/layout/page-header";
import { TeacherShell } from "@/components/layout/teacher-shell";
import { WorkflowStepper } from "@/components/teacher/workflow-stepper";
import { resolveTeacherContext } from "@/lib/auth/teacher-context";
import { getTeacherPrototypeState } from "@/lib/prototype/teacher-fixtures.server";
import { createServerRepositories } from "@/lib/repositories/server-repositories";

export const metadata = { title: "Plan an activity" };
const steps = [{ label: "Content", description: "Grade, topic, lesson" }, { label: "Play", description: "Mode, time, teams" }, { label: "Review", description: "Check before saving" }] as const;

export default async function NewActivityPage() {
  const prototype = getTeacherPrototypeState();
  const context = prototype.enabled ? null : await resolveTeacherContext();
  const repositories = context?.status === "active" ? await createServerRepositories() : null;
  const classResult = repositories && context?.userId ? await repositories.classes.listByOwner(context.userId) : null;
  const classOptions = classResult?.ok ? classResult.value.filter((item) => item.status === "active").map((item) => ({ value: item.classId, label: item.className })) : [];
  const realMode = context?.status === "active";

  return <TeacherShell currentPath="/teacher/activities/new" accountNote={realMode ? "Local activity drafts are enabled. Assignment delivery remains unavailable." : undefined}>
    <Breadcrumbs items={[{ label: "Activities", href: "/teacher/activities" }, { label: "Plan an activity" }]} />
    <PageHeader eyebrow={realMode ? "Activity draft · Local account" : "Planning preview · Saving unavailable"} title="Shape a vocabulary activity" description={realMode ? "Choose approved content and classroom settings, then save a teacher-owned draft." : "Choose the content, time, and team settings you would need before class. You can check the form, but you cannot save or assign the activity."} />
    <WorkflowStepper steps={steps} currentStep={1} label="Activity authoring steps" />
    <Notice label="Curriculum selection guidance" tone="information"><strong>Thin lessons need a fuller word pool.</strong><p>Choose Combine Mode when a lesson has fewer than four placeable terms.</p></Notice>
    {realMode ? <RealActivityForm classOptions={classOptions} /> : <ActivityFormPrototype />}
  </TeacherShell>;
}
