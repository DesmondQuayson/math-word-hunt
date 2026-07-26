import { PageHeading } from "@/components/page-heading";
import { PreviewNotice } from "@/components/preview-notice";
import { getLegacyGameDestination } from "@/lib/legacy-game";

export const metadata = { title: "Play" };

export default function PlayPage() {
  const legacyGameUrl = getLegacyGameDestination();

  return (
    <div className="shell page-stack">
      <PageHeading
        eyebrow="Current classroom experience"
        title="Launch the vocabulary hunt"
        description="The working v7 game remains separate from this platform preview. Open it without changing how your classroom session works."
      />

      <PreviewNotice>
        <strong>The game is preserved.</strong>
        <p>
          This gateway does not embed, copy, or replace the current game. It
          opens the canonical v7 experience directly.
        </p>
      </PreviewNotice>

      <section className="launch-panel" aria-labelledby="launch-heading">
        <div>
          <p className="card-kicker">Ready when you are</p>
          <h2 id="launch-heading">Start a classroom round</h2>
          <p>
            The game opens in a new tab so this gateway stays available if the
            game host is slow or unavailable.
          </p>
        </div>
        <a
          className="button button-primary launch-button"
          href={legacyGameUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="legacy-game-launch"
        >
          Open Math Vocabulary Hunt
        </a>
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
        <div className="section-heading compact-heading">
          <p className="eyebrow">Preserved behavior</p>
          <h2 id="preserved-heading">The same game, not a remake</h2>
        </div>
        <ul>
          <li>Keyboard and Pointer Event play</li>
          <li>Responsive phone and classroom-display layout</li>
          <li>Reduced-motion and audio fallback behavior</li>
          <li>Current vocabulary and Combine Mode safeguards</li>
        </ul>
      </section>
    </div>
  );
}
