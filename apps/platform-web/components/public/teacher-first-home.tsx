import Image from "next/image";
import Link from "next/link";

import { ConfirmationReminder } from "@/components/auth/email-confirmation-dialog";
import { AuthorizedCodeForm } from "@/components/auth/authorized-code-form";
import { Container } from "@/components/layout/container";
import { LinkButton } from "@/components/ui/link-button";

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
 * The MathNexa learning constellation: the real product thumbnails composed
 * as one connected system. Every node is a working link; the connecting paths
 * draw once on page load and then hold. No looping motion.
 */
function LearningConstellation() {
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
      <Link className="constellation-node constellation-node-wide" href="/play">
        <Image
          src="/media/games/math-vocabulary-hunt.webp"
          alt="Math Vocabulary Hunt game artwork: a neon letter grid highlighting FRACTION, INTEGER, RATIO, AREA, and EQUATION"
          width={1200}
          height={675}
          sizes="(max-width: 54rem) 88vw, 38vw"
          loading="eager"
          priority
        />
        <span className="constellation-caption"><strong>Math Vocabulary Hunt</strong><span>Engage · Games</span></span>
      </Link>
      <Link className="constellation-node" href="/map-prep">
        <Image
          src="/media/home/map-prep-preview.webp"
          alt="MathNexa MAP Prep workspace with a graph, working board, and math tools"
          width={1200}
          height={800}
          sizes="(max-width: 54rem) 44vw, 19vw"
          loading="eager"
        />
        <span className="constellation-caption"><strong>MAP Prep</strong><span>Prepare</span></span>
      </Link>
      <Link className="constellation-node" href="/homework">
        <Image
          src="/media/home/homework-preview.webp"
          alt="MathNexa homework sheet with fruit diagrams and space to show thinking"
          width={1200}
          height={800}
          sizes="(max-width: 54rem) 44vw, 19vw"
          loading="eager"
        />
        <span className="constellation-caption"><strong>Homework</strong><span>Practice</span></span>
      </Link>
      <Link className="constellation-node constellation-node-wide" href="/quizzes">
        <Image
          src="/media/home/quiz-preview.webp"
          alt="MathNexa Grade 7 topic quiz with a table and two graphs"
          width={1200}
          height={800}
          sizes="(max-width: 54rem) 88vw, 38vw"
          loading="eager"
        />
        <span className="constellation-caption"><strong>Topic Quizzes</strong><span>Check</span></span>
      </Link>
    </div>
    <p className="constellation-lede">One connected system: <strong>engage</strong>, <strong>prepare</strong>, <strong>practice</strong>, <strong>check</strong>.</p>
  </div>;
}

export function TeacherFirstHome({
  authState = "signed-out",
  entitled = false
}: TeacherFirstHomeProps) {
  return <>
    <section className="teacher-home-hero container" aria-labelledby="home-title">
      <div className="teacher-home-copy">
        <p className="eyebrow">Teacher-led classroom math resources</p>
        <h1 id="home-title">Make every math lesson clearer, more engaging, and ready to teach.</h1>
        <p className="teacher-home-lede">Games, Missouri MAP Prep, image-rich homework, and topic quizzes—one teacher-friendly platform.</p>
        <p className="teacher-home-audience">Built for teachers. Useful for families. Engaging for learners.</p>
        <HeroActions authState={authState} entitled={entitled} />
        {authState === "signed-out" ? <AuthorizedCodeForm nextDestination="/games" compact /> : null}
      </div>
      <LearningConstellation />
    </section>

    {authState === "unconfirmed" ? <Container><ConfirmationReminder /></Container> : null}
  </>;
}
