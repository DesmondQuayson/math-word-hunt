import Link from "next/link";

import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { getProductCatalogView } from "@/lib/adapters/catalog";

export default function HomePage() {
  const catalog = getProductCatalogView();

  return (
    <>
      <section className="hero container" aria-labelledby="home-title">
        <div className="hero-copy">
          <p className="eyebrow">Teacher-led math language practice</p>
          <h1 id="home-title">Words make math visible.</h1>
          <p className="hero-lede">
            Help students recognize, discuss, and remember the vocabulary that
            gives mathematical ideas their shape.
          </p>
          <div className="button-row">
            <LinkButton href="/play">Launch the current game</LinkButton>
            <LinkButton variant="secondary" href="/teacher">
              Open teacher workspace
            </LinkButton>
          </div>
          <p className="truth-note">
            No account is required for the current classroom game.
          </p>
        </div>

        <div className="vocabulary-board" aria-label="Math vocabulary examples">
          <p className="board-label">Vocabulary trail</p>
          <div className="term-track" data-testid="term-track">
            <span>ratio</span>
            <span>integer</span>
            <span>variable</span>
            <span>distance</span>
            <span>opposite</span>
          </div>
          <div className="board-equation" aria-hidden="true">
            <span>language</span>
            <b>+</b>
            <span>practice</span>
            <b>=</b>
            <span>confidence</span>
          </div>
        </div>
      </section>

      <section className="paper-section" aria-labelledby="paths-heading">
        <Container>
          <SectionHeader
            eyebrow="Clear by design"
            title="One product, two honest paths"
            id="paths-heading"
          />
          <div className="path-grid">
            <article>
              <Card variant="highlighted" className="path-card">
                <p className="card-kicker">Available now</p>
                <h3>{catalog.product.displayName}</h3>
                <p>
                  The preserved v7 game is the real playable product, with its
                  current keyboard, pointer, audio, mobile, and curriculum behavior.
                </p>
                <Link className="text-link" href="/play">
                  Continue to game gateway <span aria-hidden="true">→</span>
                </Link>
              </Card>
            </article>
            <article>
              <Card variant="interactive" className="path-card">
                <p className="card-kicker">Teacher account workspace</p>
                <h3>Teacher workspace</h3>
                <p>
                  Sign in to save privacy-minimized classes and activity drafts.
                  Managed sessions and reports remain clearly unavailable.
                </p>
                <Link className="text-link" href="/teacher">
                  Open the workspace <span aria-hidden="true">→</span>
                </Link>
              </Card>
            </article>
          </div>
        </Container>
      </section>

      <section className="principles container" aria-labelledby="principles-heading">
        <SectionHeader
          eyebrow="Built for the room"
          title="Classroom clarity comes first"
          id="principles-heading"
          compact
        />
        <ul className="principle-list">
          <li>
            <strong>Teacher-led</strong>
            <span>Designed for a teacher, a shared screen, and active discussion.</span>
          </li>
          <li>
            <strong>Input flexible</strong>
            <span>Keyboard, pointer, touch, and large displays remain first-class.</span>
          </li>
          <li>
            <strong>Truthful availability</strong>
            <span>Working tools and future ideas are separated and labeled clearly.</span>
          </li>
        </ul>
      </section>
    </>
  );
}
