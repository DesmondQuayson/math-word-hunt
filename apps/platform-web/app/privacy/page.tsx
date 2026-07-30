import { Notice } from "@/components/feedback/notice";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";

export const metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return <Container className="page-stack"><PageHeader eyebrow="Public privacy boundary" title="Play without creating an account" description="The initial public MathNexa site provides information and launches Math Vocabulary Hunt without Production authentication or saved teacher data." />
    <Notice label="Do not enter personal information" tone="warning"><strong>No student or organization data is requested.</strong><p>Do not enter student names, emails, IDs, rosters, work, grades, school names, district names, or other identifying information into game labels.</p></Notice>
    <section aria-labelledby="privacy-unavailable"><h2 id="privacy-unavailable">Unavailable Production services</h2><p>Account creation, sign-in, recovery, teacher workspaces, pilot participation, billing, invitations, transactional email, and account deletion are not connected to the public site.</p></section>
  </Container>;
}
