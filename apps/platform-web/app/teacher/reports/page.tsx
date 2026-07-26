import Link from "next/link";

import { PageHeading } from "@/components/page-heading";
import { PreviewNotice } from "@/components/preview-notice";

export const metadata = { title: "Reports preview" };

export default function ReportsPage() {
  return (
    <div className="shell page-stack">
      <PageHeading
        eyebrow="Teacher workspace · Future"
        title="Reporting starts with a privacy decision"
        description="No activity history, scores, student profiles, or classroom reports are created by this preview."
      />
      <PreviewNotice>
        <strong>No reports exist.</strong>
        <p>
          Reporting requires an approved educational purpose, data model,
          retention policy, and cross-account security tests before development.
        </p>
      </PreviewNotice>
      <section className="empty-state" aria-labelledby="reports-empty-heading">
        <span className="empty-state-mark" aria-hidden="true">∑</span>
        <h2 id="reports-empty-heading">No fabricated progress</h2>
        <p>
          Future reports will show only real, authorized information. This empty
          state intentionally contains no sample students, classes, or achievements.
        </p>
        <Link className="button button-secondary" href="/teacher">
          Back to teacher workspace
        </Link>
      </section>
    </div>
  );
}
