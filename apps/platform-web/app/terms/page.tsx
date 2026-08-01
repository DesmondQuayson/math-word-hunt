import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { getPublicPageMetadata } from "@/lib/seo";

export const metadata = getPublicPageMetadata("terms");

export default function TermsPage() {
  return (
    <Container className="page-stack">
      <PageHeader
        eyebrow="Public use terms"
        title="Use MathNexa for math vocabulary practice"
        description="These terms describe the current public website and game gateway. Account and payment services have not launched on this release."
      />
      <section aria-labelledby="terms-use">
        <h2 id="terms-use">Appropriate use</h2>
        <p>Use MathNexa for lawful educational and personal math vocabulary practice. Do not interfere with the service, attempt unauthorized access, or use the site to collect information about other people.</p>
      </section>
      <section aria-labelledby="terms-data">
        <h2 id="terms-data">Keep personal information out</h2>
        <p>The public game does not require personal information. Do not enter student names, email addresses, identifiers, rosters, school details, grades, or other sensitive information into game labels.</p>
      </section>
      <section aria-labelledby="terms-availability">
        <h2 id="terms-availability">Availability and changes</h2>
        <p>The public game and informational pages may be maintained, corrected, or temporarily unavailable. Current capabilities are described on the Help and Pricing pages without promising unavailable account or payment features.</p>
      </section>
      <p>Effective July 31, 2026.</p>
    </Container>
  );
}
