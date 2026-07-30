import { Notice } from "@/components/feedback/notice";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { LinkButton } from "@/components/ui/link-button";

export const metadata = { title: "About" };

export default function AboutPage() {
  return <Container className="page-stack"><PageHeader eyebrow="About MathNexa" title="Language practice for mathematical thinking" description="MathNexa makes the preserved Math Vocabulary Hunt available as a public, teacher-led classroom resource." />
    <Notice label="Public service boundary" tone="information"><strong>No account is required.</strong><p>The public site does not provide teacher accounts, saved workspaces, billing, invitations, pilot participation, or student-data collection.</p></Notice>
    <section aria-labelledby="about-game"><h2 id="about-game">A discussion-first classroom game</h2><p>Teachers choose an available grade and lesson, then guide teams through vocabulary recognition and conversation using keyboard, pointer, touch, or a shared display.</p></section>
    <LinkButton href="/play">Play Math Vocabulary Hunt</LinkButton>
  </Container>;
}
