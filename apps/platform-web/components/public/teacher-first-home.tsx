import Image from "next/image";
import Link from "next/link";
import { Fragment } from "react";

import { ConfirmationReminder } from "@/components/auth/email-confirmation-dialog";
import { AuthorizedAccessActivePanel } from "@/components/auth/authorized-access-active-panel";
import { AuthorizedCodeForm } from "@/components/auth/authorized-code-form";
import { Container } from "@/components/layout/container";
import { LinkButton } from "@/components/ui/link-button";
import { MATH_TUG_OF_WAR_PLAY_ROUTE } from "@/lib/games/access-policy";
import { AUTHORIZED_ACCESS_ANCHOR } from "@/lib/navigation/banner";
import {
  PLATFORM_HERO_AUDIENCE,
  PLATFORM_HERO_DESCRIPTION,
  PLATFORM_HERO_EYEBROW,
  PLATFORM_HERO_HEADLINE,
  PLATFORM_PRODUCTS
} from "@/lib/seo/platform-positioning";

export type HomeAuthState = "signed-out" | "unconfirmed" | "signed-in";

type TeacherFirstHomeProps = Readonly<{
  authState?: HomeAuthState;
  entitled?: boolean;
  /** The visitor's access comes from an authorized (school) code already entered in this session. */
  schoolAccess?: boolean;
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
 * Featured games: Math Vocabulary Hunt beside Math Tug of War, in the same
 * card language as the Math Games shelf. Math Tug of War is free with a
 * MathNexa account (lib/games/access-policy.ts); its button always points at
 * the game, and the game route itself sends a signed-out visitor through sign
 * in / create account and back. Nothing here decides access.
 */
function FeaturedGames() {
  return <section className="home-featured-games container" aria-labelledby="featured-games-title">
    <header className="home-featured-games-header">
      <p className="eyebrow">Play now</p>
      <h2 id="featured-games-title">Featured games</h2>
    </header>
    <div className="game-card-grid">
      <article data-game="math-vocabulary-hunt">
        <div className="game-card-thumbnail">
          <Image
            src="/media/games/math-vocabulary-hunt.webp"
            alt="Math Vocabulary Hunt gameplay artwork"
            width={1200}
            height={675}
            sizes="(max-width: 48rem) 100vw, 50vw"
          />
        </div>
        <div className="game-card-content">
          <p className="game-path">Included with MathNexa access</p>
          <h3>Math Vocabulary Hunt</h3>
          <p>Lead a fast, collaborative vocabulary round with the preserved MathNexa classroom game.</p>
          <LinkButton href="/play">Play</LinkButton>
        </div>
      </article>
      <article data-game="math-tug-of-war">
        <div className="game-card-thumbnail">
          <Image
            src="/media/games/math-tug-of-war.webp"
            alt="Math Tug of War gameplay artwork: the Turquoise and Pink teams pulling a rope while each side answers integer questions on a keypad"
            width={1200}
            height={675}
            sizes="(max-width: 48rem) 100vw, 50vw"
          />
        </div>
        <div className="game-card-content">
          <p className="game-path"><span className="game-free-badge">Free</span> with a MathNexa account</p>
          <h3>Math Tug of War</h3>
          <p>Solve the math. Pull the rope. Beat the other side!</p>
          <p className="home-featured-games-detail">Solve quick math problems and pull your opponent across the line. Play against the robot, compete on one device, or challenge another player online.</p>
          <LinkButton href={MATH_TUG_OF_WAR_PLAY_ROUTE}>Play for Free Now</LinkButton>
        </div>
      </article>
    </div>
  </section>;
}

export function TeacherFirstHome({
  authState = "signed-out",
  entitled = false,
  schoolAccess = false
}: TeacherFirstHomeProps) {
  return <>
    <section className="teacher-home-hero container" aria-labelledby="home-title">
      <div className="teacher-home-copy">
        <p className="eyebrow">{PLATFORM_HERO_EYEBROW}</p>
        <h1 id="home-title">{PLATFORM_HERO_HEADLINE}</h1>
        <p className="teacher-home-lede">{PLATFORM_HERO_DESCRIPTION}</p>
        <p className="teacher-home-audience">{PLATFORM_HERO_AUDIENCE}</p>
        <HeroActions authState={authState} entitled={entitled} />
        {/* The authorized-code entry is for signed-out visitors only (the
            banner carries no code item: this form is the entry). A session
            that already entered a code sees its exit control in the same
            place. Any authenticated account session, whatever its access,
            gets no code card at all: the container is not rendered, so it
            leaves no space. authState comes from the server-side session in
            app/page.tsx, so the page never renders the card and then hides it. */}
        {authState === "signed-out" ? <div id={AUTHORIZED_ACCESS_ANCHOR} className="teacher-home-authorized-access">
          {schoolAccess ? <AuthorizedAccessActivePanel /> : <AuthorizedCodeForm nextDestination="/games" compact />}
        </div> : null}
      </div>
      <LearningConstellation />
    </section>

    <FeaturedGames />

    {authState === "unconfirmed" ? <Container><ConfirmationReminder /></Container> : null}
  </>;
}
