import Link from "next/link";

import { Container } from "@/components/layout/container";
import { SectionHeader } from "@/components/layout/section-header";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/link-button";
import { getProductCatalogView } from "@/lib/adapters/catalog";
import { isProductionPlatformMode } from "@/lib/environment/production-platform";
import { isProductionPublicMode } from "@/lib/environment/production-public";
import { StructuredCmsContent } from "@/components/cms/structured-cms-content";
import { loadPublishedCmsDocument } from "@/lib/cms/public";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

function ConsumerHomePage() {
  return <>
    <section className="hero container" aria-labelledby="home-title">
      <div className="hero-copy">
        <p className="eyebrow">Math vocabulary game access</p>
        <h1 id="home-title">Build fluency with the language of math.</h1>
        <p className="hero-lede">Create an adult-owned account, confirm your email, and review subscription access to the preserved MathNexa game.</p>
        <div className="button-row">
          <LinkButton href="/sign-up">Create an account</LinkButton>
          <LinkButton variant="secondary" href="/sign-in">Sign in</LinkButton>
        </div>
        <p className="truth-note">Checkout remains disabled in Phase 7B. Account creation alone never grants game access.</p>
      </div>
      <div className="vocabulary-board" aria-label="Math vocabulary examples">
        <p className="board-label">Vocabulary trail</p>
        <div className="term-track"><span>ratio</span><span>integer</span><span>variable</span><span>distance</span><span>opposite</span></div>
        <div className="board-equation" aria-hidden="true"><span>language</span><b>+</b><span>practice</span><b>=</b><span>confidence</span></div>
      </div>
    </section>
    <section className="paper-section" aria-labelledby="access-heading">
      <Container>
        <SectionHeader eyebrow="One simple subscription" title="$5.99 USD per month" id="access-heading" />
        <div className="path-grid">
          <Card variant="highlighted" className="path-card">
            <p className="card-kicker">One-time trial</p>
            <h3>24 hours of game access</h3>
            <p>After future Stripe-hosted payment-method collection, one eligible account receives one non-renewable 24-hour trial before automatic monthly billing.</p>
            <Link className="text-link" href="/pricing">Review pricing and access <span aria-hidden="true">→</span></Link>
          </Card>
          <Card variant="interactive" className="path-card">
            <p className="card-kicker">Minimum data</p>
            <h3>No learning profile</h3>
            <p>MathNexa does not collect teacher, student, school, class, roster, organization, assignment, or cloud gameplay-progress data.</p>
            <Link className="text-link" href="/privacy">Review the privacy boundary <span aria-hidden="true">→</span></Link>
          </Card>
        </div>
      </Container>
    </section>
  </>;
}

export async function generateMetadata():Promise<Metadata>{const managed=await loadPublishedCmsDocument("homepage");if(!managed)return{};return{title:managed.content.seoTitle||managed.content.title,description:managed.content.seoDescription||managed.content.description,openGraph:{title:managed.content.socialTitle||managed.content.title,description:managed.content.socialDescription||managed.content.description}}}
export default async function HomePage() {
  const managed=await loadPublishedCmsDocument("homepage");if(managed)return <Container className="page-stack"><StructuredCmsContent document={managed}/></Container>;
  if (isProductionPlatformMode()) return <ConsumerHomePage />;
  const catalog = getProductCatalogView();
  const publicProduction = isProductionPublicMode();

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
            <LinkButton variant="secondary" href={publicProduction ? "/about" : "/teacher"}>{publicProduction ? "About MathNexa" : "Open teacher workspace"}</LinkButton>
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
                {publicProduction ? <>
                  <p className="card-kicker">Public guidance</p>
                  <h3>Use it with confidence</h3>
                  <p>Review gameplay help, accessibility behavior, privacy boundaries, and curriculum readiness without creating an account.</p>
                  <Link className="text-link" href="/help">Open public help <span aria-hidden="true">→</span></Link>
                </> : <>
                <p className="card-kicker">Teacher account workspace</p>
                <h3>Teacher workspace</h3>
                <p>
                  Sign in to save privacy-minimized classes and activity drafts.
                  Managed sessions and reports remain clearly unavailable.
                </p>
                <Link className="text-link" href="/teacher">
                  Open the workspace <span aria-hidden="true">→</span>
                </Link>
                </>}
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
