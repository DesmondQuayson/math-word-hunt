import { Notice } from "@/components/feedback/notice";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { LinkButton } from "@/components/ui/link-button";

export const metadata = { title: "Feature not launched", robots: { index: false, follow: false } };

export default function NotLaunchedPage() {
  return (
    <Container className="page-stack" width="compact">
      <PageHeader eyebrow="Public MathNexa" title="This feature has not launched" description="Accounts, teacher workspaces, pilots, billing, invitations, and private operations are unavailable on the public site." />
      <Notice label="Public-only service" tone="information">
        <strong>No account or personal information is accepted here.</strong>
        <p>MathNexa currently provides public information and the preserved Math Vocabulary Hunt game without authentication or saved teacher data.</p>
      </Notice>
      <div className="button-row">
        <LinkButton href="/play">Play Math Vocabulary Hunt</LinkButton>
        <LinkButton href="/" variant="secondary">Return home</LinkButton>
      </div>
    </Container>
  );
}
