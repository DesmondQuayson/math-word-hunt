import { Notice } from "@/components/feedback/notice";
import { PageHeader } from "@/components/layout/page-header";
import { SectionHeader } from "@/components/layout/section-header";
import { TeacherShell } from "@/components/layout/teacher-shell";
import { CurriculumStatus } from "@/components/teacher/curriculum-status";
import { SummaryMetric } from "@/components/teacher/summary-metric";
import { Card } from "@/components/ui/card";
import {
  CURRICULUM_INVENTORY,
  CURRICULUM_STATUS_ITEMS
} from "@/lib/adapters/curriculum-summary";

export const metadata = { title: "Curriculum browser prototype" };

export default function CurriculumPage() {
  return (
    <TeacherShell currentPath="/teacher/curriculum">
      <PageHeader
        eyebrow="Teacher workspace · Curriculum"
        title="See what is playable before you plan"
        description="This summary reflects the technically validated canonical inventory without copying the complete vocabulary dataset into the platform."
      />

      <div className="metric-grid" aria-label="Curriculum inventory">
        <SummaryMetric label="Grades" value="6–8" />
        <SummaryMetric label="Terms" value={CURRICULUM_INVENTORY.terms} />
        <SummaryMetric label="Playable lessons" value={CURRICULUM_INVENTORY.playableLessons} />
        <SummaryMetric label="Missing lessons" value={CURRICULUM_INVENTORY.missingLessons} />
        <SummaryMetric label="Thin lessons" value={CURRICULUM_INVENTORY.thinLessons} />
      </div>

      <Notice label="Teacher review status" tone="warning">
        <strong>Teacher review is still required.</strong>
        <p>Definitions and examples are technically valid but are not publisher-approved, legally reviewed, or fully verified for instructional accuracy.</p>
      </Notice>

      <section aria-labelledby="curriculum-status-heading">
        <SectionHeader eyebrow="Readiness guide" title="Curriculum status" id="curriculum-status-heading" compact />
        <div className="curriculum-status-grid">
          {CURRICULUM_STATUS_ITEMS.map((item) => (
            <article key={item.id}>
              <Card className="curriculum-status-card">
                <CurriculumStatus status={item.status} />
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </Card>
            </article>
          ))}
        </div>
      </section>

      <section className="combine-mode-panel" aria-labelledby="combine-mode-heading">
        <div>
          <p className="card-kicker">Thin lesson support</p>
          <h2 id="combine-mode-heading">Combine Mode creates a fuller grid</h2>
        </div>
        <p>
          When a lesson has fewer than four placeable words, a teacher can
          combine two or more lessons. The source lessons remain visible; the
          platform must never disguise thin content as complete.
        </p>
      </section>
    </TeacherShell>
  );
}
