import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { LinkButton } from "@/components/ui/link-button";
import type { Metadata } from "next";
import { isProductionPlatformMode } from "@/lib/environment/production-platform";
import { publicPageMetadata } from "@/lib/seo/public-pages";

export function generateMetadata(): Metadata {
  return isProductionPlatformMode() ? publicPageMetadata("/accessibility") : { title: "Accessibility" };
}

export default function AccessibilityPage() {
  // Same statement in plain words for the platform; the claims are unchanged
  // ("the canonical game" is Math Vocabulary Hunt).
  if (isProductionPlatformMode()) {
    return <Container className="page-stack"><PageHeader eyebrow="Accessibility" title="Multiple ways to navigate and play" description="You can move through the MathNexa website with a keyboard. Math Vocabulary Hunt also works with a mouse or touch screen, keeps focus visible, respects reduced motion, and keeps working if audio is blocked." />
      <section aria-labelledby="access-controls"><h2 id="access-controls">Controls and display</h2><ul><li>Move through the public website with a keyboard.</li><li>Play the game with a mouse, a touch screen or a keyboard.</li><li>Zoom in or use a narrow screen, and pages reflow to fit.</li><li>Reduced-motion and forced-colors settings are respected.</li><li>If audio fails or the browser blocks it, the game still works.</li></ul></section>
      <p>This statement describes tested behavior and is not a formal conformance certification.</p>
      <LinkButton href="/play">Go to Math Games</LinkButton>
    </Container>;
  }
  return <Container className="page-stack"><PageHeader eyebrow="Accessibility" title="Multiple ways to navigate and play" description="MathNexa preserves keyboard, Pointer Events, responsive reflow, visible focus, reduced-motion behavior, and audio fallback in the canonical game." />
    <section aria-labelledby="access-controls"><h2 id="access-controls">Controls and display</h2><ul><li>Use keyboard navigation throughout the public website.</li><li>Use pointer, touch, or keyboard controls in the game.</li><li>Browser zoom and narrow-screen reflow remain supported.</li><li>Reduced-motion and forced-colors preferences are respected.</li><li>Audio failure or browser blocking does not prevent gameplay.</li></ul></section>
    <p>This statement describes tested behavior and is not a formal conformance certification.</p>
    <LinkButton href="/play">Open the game gateway</LinkButton>
  </Container>;
}
