import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { LinkButton } from "@/components/ui/link-button";
import { isProductionPlatformMode } from "@/lib/environment/production-platform";

export const metadata = { title: "Help" };

export default function HelpPage() {
  if (isProductionPlatformMode()) {
    return <Container className="page-stack"><PageHeader eyebrow="MathNexa help" title="Account and game-access help" description="Game launch requires a confirmed account and a server-verified trial or active subscription." />
      <section aria-labelledby="help-steps"><h2 id="help-steps">Access steps</h2><ol><li>Create an account with an email address and password.</li><li>Confirm the email address, then sign in.</li><li>Review and affirm the current subscription terms before Stripe Setup Checkout.</li><li>Launch only when the server confirms an exact trial or active subscription.</li></ol></section>
      <section aria-labelledby="help-safety"><h2 id="help-safety">Keep personal learning information out</h2><p>Do not submit teacher, student, school, class, roster, organization, assignment, result, or gameplay-progress information.</p></section>
      <div className="button-row"><LinkButton href="/game-access">Check game access</LinkButton><LinkButton href="/subscriber-management" variant="secondary">Manage subscription</LinkButton><LinkButton href="/support" variant="secondary">Support</LinkButton></div>
    </Container>;
  }
  return <Container className="page-stack"><PageHeader eyebrow="Public help" title="Start a Math Vocabulary Hunt" description="The game runs without an account and keeps classroom play on the teacher-led shared screen." />
    <section aria-labelledby="help-steps"><h2 id="help-steps">Quick start</h2><ol><li>Open the game gateway and launch Math Vocabulary Hunt.</li><li>Choose a grade and an available lesson.</li><li>Choose the game settings and start the round.</li><li>Trace words with Pointer Events or use the documented keyboard controls.</li></ol></section>
    <section aria-labelledby="help-safety"><h2 id="help-safety">Keep personal information out</h2><p>The public game does not need names, email addresses, rosters, organization labels, student work, grades, or account information.</p></section>
    <div className="button-row"><LinkButton href="/play">Open the game gateway</LinkButton><LinkButton href="/accessibility" variant="secondary">Accessibility help</LinkButton></div>
  </Container>;
}
