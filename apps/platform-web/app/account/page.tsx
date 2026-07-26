import Link from "next/link";

import { PageHeading } from "@/components/page-heading";
import { PreviewNotice } from "@/components/preview-notice";
import { getTeacherSession } from "@/lib/adapters/identity";

export const metadata = { title: "Account preview" };

export default async function AccountPage() {
  const session = await getTeacherSession();

  return (
    <div className="shell page-stack">
      <PageHeading
        eyebrow="Teacher account · Future"
        title="Teacher accounts are not connected"
        description="The approved teacher-only account direction will be implemented in a later phase after identity, privacy, and recovery details are reviewed."
      />
      <PreviewNotice>
        <strong>Signed out</strong>
        <p>{session.message}</p>
      </PreviewNotice>
      <section className="empty-state" aria-labelledby="account-empty-heading">
        <span className="empty-state-mark" aria-hidden="true">ID</span>
        <h2 id="account-empty-heading">No profile has been created</h2>
        <p>
          This preview has no sign-up form, login, saved profile, subscription,
          pricing, or customer portal.
        </p>
        <Link className="button button-primary" href="/play">
          Play without an account
        </Link>
      </section>
    </div>
  );
}
