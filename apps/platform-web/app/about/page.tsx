import { Notice } from "@/components/feedback/notice";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { LinkButton } from "@/components/ui/link-button";
import { isProductionPlatformMode } from "@/lib/environment/production-platform";
import {
  MISSOURI_ALIGNMENT_NOTE,
  MISSOURI_NON_AFFILIATION,
  PLATFORM_HERO_AUDIENCE,
  PLATFORM_HOMEPAGE_DESCRIPTION,
  PLATFORM_PRODUCTS,
  PRAXIS_NON_AFFILIATION,
  ROADMAP_MIDDLE_SCHOOL_REVIEW
} from "@/lib/seo/platform-positioning";

export const metadata = { title: "About" };

/**
 * The production platform's About page is indexed (it sits in the sitemap), so
 * it has to say what the platform actually is. The previous copy described the
 * account-free public Math Vocabulary Hunt site, which mathnexa.com no longer
 * is. The public-site branch below is unchanged for that deployment mode.
 */
function PlatformAboutPage() {
  const [games, mathPrep, homework, quizzes] = PLATFORM_PRODUCTS;
  return <Container className="page-stack">
    <PageHeader eyebrow="About MathNexa" title="Online math resources for Grades 3–8 teachers and families" description={PLATFORM_HOMEPAGE_DESCRIPTION} />
    <section aria-labelledby="about-included">
      <h2 id="about-included">What one subscription includes</h2>
      <ul className="principle-list">
        <li><strong>{games.cardTitle}</strong><span>Teacher-ready math games for whole-class engagement and quick practice.</span></li>
        <li><strong>{mathPrep.cardTitle}</strong><span>{mathPrep.features.replaceAll(" · ", ", ")} for Grades 3–8. {MISSOURI_ALIGNMENT_NOTE}</span></li>
        <li><strong>{homework.cardTitle}</strong><span>Printable homework by grade, topic, and lesson.</span></li>
        <li><strong>{quizzes.cardTitle}</strong><span>Printable topic quizzes for checking understanding.</span></li>
      </ul>
    </section>
    <section aria-labelledby="about-audience">
      <h2 id="about-audience">Who it is for</h2>
      <p>{PLATFORM_HERO_AUDIENCE}</p>
    </section>
    <section aria-labelledby="about-roadmap">
      <h2 id="about-roadmap">Coming soon</h2>
      <p>{ROADMAP_MIDDLE_SCHOOL_REVIEW}</p>
      <p className="truth-note">{PRAXIS_NON_AFFILIATION}</p>
    </section>
    <Notice label="Independent product" tone="information"><strong>Not an official state resource.</strong><p>{MISSOURI_NON_AFFILIATION}</p></Notice>
    <div className="button-row">
      <LinkButton href={games.href}>Explore {games.label}</LinkButton>
      <LinkButton href={mathPrep.href} variant="secondary">Open {mathPrep.label}</LinkButton>
    </div>
  </Container>;
}

export default function AboutPage() {
  if (isProductionPlatformMode()) return <PlatformAboutPage />;
  return <Container className="page-stack"><PageHeader eyebrow="About MathNexa" title="Language practice for mathematical thinking" description="MathNexa makes the preserved Math Vocabulary Hunt available as a public, teacher-led classroom resource." />
    <Notice label="Public service boundary" tone="information"><strong>No account is required.</strong><p>The public site does not provide teacher accounts, saved workspaces, billing, invitations, pilot participation, or student-data collection.</p></Notice>
    <section aria-labelledby="about-game"><h2 id="about-game">A discussion-first classroom game</h2><p>Teachers choose an available grade and lesson, then guide teams through vocabulary recognition and conversation using keyboard, pointer, touch, or a shared display.</p></section>
    <LinkButton href="/play">Play Math Vocabulary Hunt</LinkButton>
  </Container>;
}
