import Image from "next/image";
import Link from "next/link";
import { Fragment } from "react";

import { ConfirmationReminder } from "@/components/auth/email-confirmation-dialog";
import { AuthorizedCodeForm } from "@/components/auth/authorized-code-form";
import { Container } from "@/components/layout/container";
import { LinkButton } from "@/components/ui/link-button";
import {
  PLATFORM_HERO_AUDIENCE,
  PLATFORM_HERO_DESCRIPTION,
  PLATFORM_HERO_EYEBROW,
  PLATFORM_HERO_HEADLINE,
  PLATFORM_PRODUCTS,
  PRAXIS_NON_AFFILIATION,
  ROADMAP_MIDDLE_SCHOOL_REVIEW
} from "@/lib/seo/platform-positioning";

export type HomeAuthState = "signed-out" | "unconfirmed" | "signed-in";

type TeacherFirstHomeProps = Readonly<{
  authState?: HomeAuthState;
  entitled?: boolean;
  numberCrossPublished?: boolean;
}>;

function HeroActions({ authState, entitled }: Readonly<{ authState: HomeAuthState; entitled: boolean }>) {
  if (authState === "signed-out") {
    return <div className="button-row teacher-home-actions">
      <LinkButton href="/sign-up">Create an account</LinkButton>
      <LinkButton variant="secondary" href="/sign-in">Sign in</LinkButton>
    </div>;
  }
  if (!entitled) {
    return <div className="button-row teacher-home-actions">
      <LinkButton href="/subscription">View access options</LinkButton>
      <LinkButton variant="secondary" href="/account">My Account</LinkButton>
    </div>;
  }
  return <p className="teacher-home-ready" role="status">
    <span aria-hidden="true">✓</span> Your MathNexa resource shelf is ready below.
  </p>;
}

/**
 * "Learn · Practice · Review · Worksheet Generator" must only ever break at a
 * middot, never inside a phrase: each phrase is an unbreakable run and the
 * separators stay ordinary text, so the rendered text is unchanged.
 */
function CaptionFeatures({ features }: Readonly<{ features: string }>) {
  return <span>{features.split(" · ").map((phrase, index) => <Fragment key={phrase}>{index > 0 ? " · " : null}<span className="constellation-feature">{phrase}</span></Fragment>)}</span>;
}

/**
 * The MathNexa learning constellation: the real product thumbnails composed
 * as one connected system. Every node is a working link; the connecting paths
 * draw once on page load and then hold. No looping motion.
 *
 * Labels are the customer-facing product names (lib/seo/platform-positioning).
 * The route paths behind them are unchanged on purpose: /games, /map-prep,
 * /homework and /quizzes are indexed, bookmarked and used by access routing.
 */
function LearningConstellation() {
  const [games, mathPrep, homework, quizzes] = PLATFORM_PRODUCTS;
  return <div className="learning-constellation">
    <svg className="constellation-paths" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <path d="M28 34 C 38 52, 30 58, 27 70" />
      <path d="M50 36 C 58 50, 66 56, 73 70" />
      <path d="M30 74 C 45 82, 58 82, 71 74" />
      <circle cx="28" cy="34" r="1.6" />
      <circle cx="27" cy="70" r="1.6" />
      <circle cx="73" cy="70" r="1.6" />
    </svg>
    <div className="constellation-grid">
      <Link className="constellation-node constellation-node-wide" href={games.href}>
        <Image
          src="/media/games/math-vocabulary-hunt.webp"
          alt="Math Vocabulary Hunt game artwork: a neon letter grid highlighting FRACTION, INTEGER, RATIO, AREA, and EQUATION"
          width={1200}
          height={675}
          sizes="(max-width: 54rem) 88vw, 38vw"
          loading="eager"
          priority
        />
        <span className="constellation-caption"><strong>{games.cardTitle}</strong><CaptionFeatures features={games.features} /></span>
      </Link>
      <Link className="constellation-node" href={mathPrep.href}>
        <Image
          src="/media/home/map-prep-preview.webp"
          alt="MathNexa Online Math Prep workspace with a graph, working board, and math tools"
          width={1200}
          height={800}
          sizes="(max-width: 54rem) 44vw, 19vw"
          loading="eager"
        />
        <span className="constellation-caption"><strong>{mathPrep.cardTitle}</strong><CaptionFeatures features={mathPrep.features} /></span>
      </Link>
      <Link className="constellation-node" href={homework.href}>
        <Image
          src="/media/home/homework-preview.webp"
          alt="MathNexa homework PDF with fruit diagrams and space to show thinking"
          width={1200}
          height={800}
          sizes="(max-width: 54rem) 44vw, 19vw"
          loading="eager"
        />
        <span className="constellation-caption"><strong>{homework.cardTitle}</strong><CaptionFeatures features={homework.features} /></span>
      </Link>
      <Link className="constellation-node constellation-node-wide" href={quizzes.href}>
        <Image
          src="/media/home/quiz-preview.webp"
          alt="MathNexa Grade 7 topic quiz PDF with a table and two graphs"
          width={1200}
          height={800}
          sizes="(max-width: 54rem) 88vw, 38vw"
          loading="eager"
        />
        <span className="constellation-caption"><strong>{quizzes.cardTitle}</strong><CaptionFeatures features={quizzes.features} /></span>
      </Link>
    </div>
    <p className="constellation-lede">One connected system: <strong>engage</strong>, <strong>learn</strong>, <strong>practice</strong>, <strong>assess</strong>.</p>
  </div>;
}

/**
 * Future-facing note, deliberately kept OUT of the hero so the hero height and
 * the approved premium layout stay as they are. It describes planned work, not
 * an existing course, and carries the trademark clarification with it.
 */
function RoadmapNote() {
  return <section className="teacher-home-roadmap container" aria-labelledby="roadmap-heading">
    <h2 id="roadmap-heading" className="teacher-home-roadmap-heading">Coming soon</h2>
    <p className="teacher-home-roadmap-copy">{ROADMAP_MIDDLE_SCHOOL_REVIEW}</p>
    <p className="teacher-home-roadmap-note">{PRAXIS_NON_AFFILIATION}</p>
  </section>;
}

export function TeacherFirstHome({
  authState = "signed-out",
  entitled = false
}: TeacherFirstHomeProps) {
  return <>
    <section className="teacher-home-hero container" aria-labelledby="home-title">
      <div className="teacher-home-copy">
        <p className="eyebrow">{PLATFORM_HERO_EYEBROW}</p>
        <h1 id="home-title">{PLATFORM_HERO_HEADLINE}</h1>
        <p className="teacher-home-lede">{PLATFORM_HERO_DESCRIPTION}</p>
        <p className="teacher-home-audience">{PLATFORM_HERO_AUDIENCE}</p>
        <HeroActions authState={authState} entitled={entitled} />
        {authState === "signed-out" ? <AuthorizedCodeForm nextDestination="/games" compact /> : null}
      </div>
      <LearningConstellation />
    </section>

    {authState === "unconfirmed" ? <Container><ConfirmationReminder /></Container> : null}
    <RoadmapNote />
  </>;
}
