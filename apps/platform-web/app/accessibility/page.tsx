import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { LinkButton } from "@/components/ui/link-button";
import { getPublicPageMetadata } from "@/lib/seo";

export const metadata = getPublicPageMetadata("accessibility");

export default function AccessibilityPage() {
  return <Container className="page-stack"><PageHeader eyebrow="Accessibility" title="Multiple ways to navigate and play" description="MathNexa preserves keyboard, Pointer Events, responsive reflow, visible focus, reduced-motion behavior, and audio fallback in the canonical game." />
    <section aria-labelledby="access-controls"><h2 id="access-controls">Controls and display</h2><ul><li>Use keyboard navigation throughout the public website.</li><li>Use pointer, touch, or keyboard controls in the game.</li><li>Browser zoom and narrow-screen reflow remain supported.</li><li>Reduced-motion and forced-colors preferences are respected.</li><li>Audio failure or browser blocking does not prevent gameplay.</li></ul></section>
    <p>This statement describes tested behavior and is not a formal conformance certification.</p>
    <LinkButton href="/play">Open the game gateway</LinkButton>
  </Container>;
}
