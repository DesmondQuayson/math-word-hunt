import { redirect } from "next/navigation";

import { requestConsumerRefundReviewAction } from "@/app/consumer-actions";
import { Notice } from "@/components/feedback/notice";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { LinkButton } from "@/components/ui/link-button";
import { resolveConsumerContext } from "@/lib/auth/consumer-context";
import { COMMERCIAL_POLICY } from "@/lib/commercial/policy";
import { StructuredCmsContent } from "@/components/cms/structured-cms-content";
import { loadPublishedCmsDocument } from "@/lib/cms/public";

export const metadata = { title: "Refund requests" };
export const dynamic = "force-dynamic";

export default async function RefundsPage({ searchParams }: { searchParams: Promise<{ refund?: string }> }) {
  const context = await resolveConsumerContext();
  if (context.status === "anonymous" || context.status === "unconfigured") redirect("/sign-in?next=/refunds");
  const params = await searchParams;
  const managed=await loadPublishedCmsDocument("refunds");
  return <Container className="page-stack" width="compact">
    {managed?<StructuredCmsContent document={managed}/>:null}
    <PageHeader eyebrow={`Refund policy ${COMMERCIAL_POLICY.refundVersion}`} title="Request first-charge review" description="MathNexa does not issue automatic refunds. An authenticated account owner may request review of the first monthly charge within seven days." />
    {params.refund === "requested" ? <Notice label="Refund review" tone="success" live><strong>Review requested.</strong><p>No refund has been promised or issued. Support must review the authoritative Stripe record.</p></Notice> : null}
    {params.refund === "unavailable" ? <Notice label="Refund review" tone="warning" live><strong>Request unavailable.</strong><p>The account has no eligible first charge, the review window has ended, or billing records could not be verified.</p></Notice> : null}
    <ul><li>Review applies only to the first $5.99 monthly charge.</li><li>The request must be received within seven days of that charge.</li><li>Approval is not guaranteed and no browser action can issue a refund.</li><li>Cancel separately to prevent future renewal.</li></ul>
    {(context.status === "active" || context.status === "deletion-pending") ? <form action={requestConsumerRefundReviewAction}><button className="button button-primary" type="submit">Request refund review</button></form> : null}
    <div className="button-row"><LinkButton href="/cancellation" variant="secondary">Manage cancellation</LinkButton><LinkButton href="/support" variant="secondary">Support</LinkButton></div>
  </Container>;
}
