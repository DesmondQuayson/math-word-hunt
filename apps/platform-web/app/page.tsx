import Link from "next/link";

import { getProductCatalogView } from "@/lib/adapters/catalog";

export default function HomePage() {
  const catalog = getProductCatalogView();

  return (
    <>
      <section className="hero shell" aria-labelledby="home-title">
        <div className="hero-copy">
          <p className="eyebrow">Teacher-led math language practice</p>
          <h1 id="home-title">Words make math visible.</h1>
          <p className="hero-lede">
            Help students recognize, discuss, and remember the vocabulary that
            gives mathematical ideas their shape.
          </p>
          <div className="button-row">
            <Link className="button button-primary" href="/play">
              Launch the current game
            </Link>
            <Link className="button button-secondary" href="/teacher">
              View teacher preview
            </Link>
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
        <div className="shell">
          <div className="section-heading">
            <p className="eyebrow">Clear by design</p>
            <h2 id="paths-heading">One product, two honest paths</h2>
          </div>
          <div className="path-grid">
            <article className="path-card path-card-current">
              <p className="card-kicker">Available now</p>
              <h3>{catalog.product.displayName}</h3>
              <p>
                The preserved v7 game is the real playable product, with its
                current keyboard, pointer, audio, mobile, and curriculum behavior.
              </p>
              <Link className="text-link" href="/play">
                Continue to game gateway <span aria-hidden="true">→</span>
              </Link>
            </article>
            <article className="path-card">
              <p className="card-kicker">Preview only</p>
              <h3>Teacher workspace</h3>
              <p>
                Explore the planned workspace structure. Accounts, saved classes,
                reports, and subscriptions are not connected.
              </p>
              <Link className="text-link" href="/teacher">
                Explore the workspace <span aria-hidden="true">→</span>
              </Link>
            </article>
          </div>
        </div>
      </section>

      <section className="principles shell" aria-labelledby="principles-heading">
        <div className="section-heading compact-heading">
          <p className="eyebrow">Built for the room</p>
          <h2 id="principles-heading">Classroom clarity comes first</h2>
        </div>
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
            <strong>Truthful preview</strong>
            <span>Future tools are labeled clearly and never filled with invented data.</span>
          </li>
        </ul>
      </section>
    </>
  );
}
