import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { LinkButton } from "@/components/ui/link-button";
import { getPublicPageMetadata } from "@/lib/seo";

export const metadata = getPublicPageMetadata("help");

export default function HelpPage() {
  return <Container className="page-stack"><PageHeader eyebrow="Public help" title="Start a Math Vocabulary Hunt" description="The game runs without an account and keeps classroom play on the teacher-led shared screen." />
    <section aria-labelledby="help-steps"><h2 id="help-steps">Quick start</h2><ol><li>Open the game gateway and launch Math Vocabulary Hunt.</li><li>Choose a grade and an available lesson.</li><li>Choose the game settings and start the round.</li><li>Trace words with Pointer Events or use the documented keyboard controls.</li></ol></section>
    <section aria-labelledby="help-safety"><h2 id="help-safety">Keep personal information out</h2><p>The public game does not need names, email addresses, rosters, organization labels, student work, grades, or account information.</p></section>
    <div className="button-row"><LinkButton href="/play">Open the game gateway</LinkButton><LinkButton href="/accessibility" variant="secondary">Accessibility help</LinkButton></div>
  </Container>;
}
