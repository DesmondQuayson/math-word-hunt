import { ClassFormPrototype } from "@/components/forms/class-form-prototype";
import { Notice } from "@/components/feedback/notice";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { PageHeader } from "@/components/layout/page-header";
import { TeacherShell } from "@/components/layout/teacher-shell";

export const metadata = { title: "Review class setup" };

export default function NewClassPage() {
  return (
    <TeacherShell currentPath="/teacher/classes/new">
      <Breadcrumbs items={[
        { label: "Classes", href: "/teacher/classes" },
        { label: "Review class setup" }
      ]} />
      <PageHeader
        eyebrow="Class setup preview · Saving unavailable"
        title="Describe a future class"
        description="Use a class label you recognize without entering student names. You can check the form, but you cannot create or save a class."
      />
      <Notice label="Class privacy guidance" tone="warning">
        <strong>Do not enter student names.</strong>
        <p>The initial class model needs a class label, not a roster or student account.</p>
      </Notice>
      <ClassFormPrototype />
    </TeacherShell>
  );
}
