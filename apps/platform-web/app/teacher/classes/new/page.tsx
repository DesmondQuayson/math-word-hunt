import { Notice } from "@/components/feedback/notice";
import { ClassFormPrototype } from "@/components/forms/class-form-prototype";
import { RealClassForm } from "@/components/forms/teacher-data-forms";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { PageHeader } from "@/components/layout/page-header";
import { TeacherShell } from "@/components/layout/teacher-shell";
import { resolveTeacherContext } from "@/lib/auth/teacher-context";
import { getTeacherPrototypeState } from "@/lib/prototype/teacher-fixtures.server";

export const metadata = { title: "Class setup" };

export default async function NewClassPage() {
  const prototype = getTeacherPrototypeState();
  const context = prototype.enabled ? null : await resolveTeacherContext();
  const realMode = context?.status === "active";

  return (
    <TeacherShell currentPath="/teacher/classes/new" accountNote={realMode ? "Local teacher data is enabled. Do not enter student names." : undefined}>
      <Breadcrumbs items={[{ label: "Classes", href: "/teacher/classes" }, { label: realMode ? "Create class" : "Review class setup" }]} />
      <PageHeader
        eyebrow={realMode ? "Class setup · Local account" : "Class setup preview · Saving unavailable"}
        title={realMode ? "Create a class" : "Describe a future class"}
        description={realMode ? "Save a teacher-owned class label without collecting a roster or student names." : "Use a class label you recognize without entering student names. You can check the form, but you cannot create or save a class."}
      />
      <Notice label="Class privacy guidance" tone="warning"><strong>Do not enter student names.</strong><p>The initial class model needs a class label, not a roster or student account.</p></Notice>
      {realMode ? <RealClassForm /> : <ClassFormPrototype />}
    </TeacherShell>
  );
}
