import { Notice } from "@/components/feedback/notice";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { SectionHeader } from "@/components/layout/section-header";
import { LinkButton } from "@/components/ui/link-button";
import { getLegacyGameDestination } from "@/lib/legacy-game";
import { isProductionPlatformMode } from "@/lib/environment/production-platform";
import { getGameAccessView } from "@/lib/game-access/server";
import { GameAccessStatus } from "@/components/consumer/game-access-status";
import { redirect } from "next/navigation";

export const metadata = { title: "Play" };

async function ConsumerPlayPage() {
  const access = await getGameAccessView();
  if (access.context.status === "anonymous" || access.context.status === "unconfigured") redirect("/sign-in?next=/play");
  if (!access.decision.allowed) {
    return <Container className="page-stack" width="compact"><PageHeader eyebrow="Protected game gateway" title="Game access required" description="The canonical game is available only after a server-verified trial or active subscription."/><GameAccessStatus decision={access.decision} /></Container>;
  }
  return <Container className="page-stack" width="compact">
    <PageHeader eyebrow="Protected game gateway" title="Game access verified" description="The server permits this launch only through the verified entitlement end." />
    <Notice label="Private asset delivery" tone="success"><strong>Launch authorized.</strong><p>The unchanged canonical HTML and vocabulary file are streamed from server-only source. Direct public asset URLs are not part of the final commercial architecture.</p></Notice>
    <LinkButton href="/game/runtime/index.html" className="launch-button" data-testid="protected-game-launch">Launch MathNexa game</LinkButton>
  </Container>;
}

function LegacyPlayPage() {
  const legacyGameUrl = getLegacyGameDestination();

  return (
    <Container className="page-stack">
      <PageHeader
        eyebrow="Current classroom experience"
        title="Launch the vocabulary hunt"
        description="The working v7 game remains separate from this platform preview. Open it without changing how your classroom session works."
      />

      <Notice label="Game preservation status" tone="information">
        <strong>The game is preserved.</strong>
        <p>
          This gateway does not embed, copy, or replace the current game. It
          opens the canonical v7 experience directly.
        </p>
      </Notice>

      <section className="launch-panel" aria-labelledby="launch-heading">
        <div>
          <p className="card-kicker">Ready when you are</p>
          <h2 id="launch-heading">Start a classroom round</h2>
          <p>
            The game opens in a new tab so this gateway stays available if the
            game host is slow or unavailable.
          </p>
        </div>
        <LinkButton
          href={legacyGameUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="launch-button"
          data-testid="legacy-game-launch"
        >
          Open Math Vocabulary Hunt
        </LinkButton>
      </section>

      <details className="fallback-panel">
        <summary>If the game does not open</summary>
        <div>
          <p>
            Keep this page open, check the classroom connection, then use the
            direct link below. Your platform preview has no saved work to lose.
          </p>
          <a href={legacyGameUrl} data-testid="legacy-game-fallback">
            Open the canonical game in this tab
          </a>
        </div>
      </details>

      <section className="assurance-grid" aria-labelledby="preserved-heading">
        <SectionHeader
          eyebrow="Preserved behavior"
          title="The same game, not a remake"
          id="preserved-heading"
          compact
        />
        <ul>
          <li>Keyboard and Pointer Event play</li>
          <li>Responsive phone and classroom-display layout</li>
          <li>Reduced-motion and audio fallback behavior</li>
          <li>Current vocabulary and Combine Mode safeguards</li>
        </ul>
      </section>
    </Container>
  );
}

export default function PlayPage() {
  return isProductionPlatformMode() ? <ConsumerPlayPage /> : <LegacyPlayPage />;
}
