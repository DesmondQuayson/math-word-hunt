import Link from "next/link";

import { PageHeading } from "@/components/page-heading";
import { PreviewNotice } from "@/components/preview-notice";

export const metadata = { title: "Classes preview" };

export default function ClassesPage() {
  return (
    <div className="shell page-stack">
      <PageHeading
        eyebrow="Teacher workspace · Future"
        title="Class tools are not connected"
        description="This page reserves a clear place for future classroom management without collecting names, rosters, or student accounts."
      />
      <PreviewNotice>
        <strong>No classroom data is saved.</strong>
        <p>
          Class creation, rosters, invitations, and persistence are outside this
          platform-shell phase.
        </p>
      </PreviewNotice>
      <section className="empty-state" aria-labelledby="classes-empty-heading">
        <span className="empty-state-mark" aria-hidden="true">Aa</span>
        <h2 id="classes-empty-heading">Nothing to manage yet</h2>
        <p>
          When this area is implemented, it will begin with teacher-controlled,
          privacy-reviewed workflows. No student account model is assumed.
        </p>
        <Link className="button button-secondary" href="/teacher">
          Back to teacher workspace
        </Link>
      </section>
    </div>
  );
}
