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
  PLATFORM_PRODUCTS
} from "@/lib/seo/platform-positioning";

import styles from "./home/home.module.css";
import { HOME_EYEBROW, HOME_HEADLINE_LEAD, HOME_HEADLINE_MARK, HOME_HEADLINE_TAIL } from "./home/home-copy";
import { InView } from "./home/in-view";
import { Marked } from "./home/marked";
import { PrepBoard } from "./home/prep-board";

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
 * `sizes` for the shelf images, matching the widths home.module.css gives
 * them, so each device downloads the smallest image that still fills its slot:
 * - the feature image is the full shelf width up to 48rem (92vw), then the
 *   1.35fr column of the shelf (about 55vw), up to 43rem at the 74rem shelf;
 * - a supporting image is the 38% thumbnail of a phone row up to 34rem
 *   (about 36vw), then one of three columns (about 31vw), up to 24rem.
 */
const SHELF_FEATURE_SIZES = "(max-width: 48rem) 92vw, (max-width: 78rem) 55vw, 43rem";
const SHELF_CARD_SIZES = "(max-width: 34rem) 36vw, (max-width: 78rem) 31vw, 24rem";

/**
 * The product shelf: the real product thumbnails, Online Math Prep first and
 * widest. Labels are the customer-facing product names
 * (lib/seo/platform-positioning). The route paths behind them are unchanged on
 * purpose: /games, /map-prep, /homework and /quizzes are indexed, bookmarked
 * and used by access routing.
 */
function ProductShelf() {
  const [games, mathPrep, homework, quizzes] = PLATFORM_PRODUCTS;
  return <section className={`container ${styles.shelf}`} aria-labelledby="home-shelf-title">
    <InView className={`${styles.inView} ${styles.sectionHead}`}>
      <p className="eyebrow">How MathNexa fits together</p>
      <h2 id="home-shelf-title"><Marked>Prepare online</Marked>, practice on paper, check what stuck</h2>
      <p className={styles.shelfLede}>One connected system: <strong>engage</strong>, <strong>learn</strong>, <strong>practice</strong>, <strong>assess</strong>.</p>
    </InView>
    <div className={styles.shelfGrid}>
      <Link className={`${styles.shelfCard} ${styles.shelfFeature}`} href={mathPrep.href} data-product="map-prep">
        <span className={styles.shelfImage}>
          <Image
            src="/media/home/online-math-prep-preview.webp"
            alt="MathNexa Online Math Prep workspace with a graph, working board, and math tools"
            width={1200}
            height={800}
            sizes={SHELF_FEATURE_SIZES}
          />
        </span>
        <span className={styles.shelfCaption}><strong>{mathPrep.cardTitle}</strong><CaptionFeatures features={mathPrep.features} /><span className={styles.shelfNote}>Lessons, practice and review for Grades 3–8, with a worksheet generator for printing practice.</span><span className={styles.shelfAction}>Open Online Math Prep <span aria-hidden="true">→</span></span></span>
      </Link>
      <Link className={styles.shelfCard} href={games.href} data-product="games">
        <span className={styles.shelfImage}>
          <Image
            src="/media/games/math-vocabulary-hunt.webp"
            alt="Math Vocabulary Hunt game artwork: a neon letter grid highlighting FRACTION, INTEGER, RATIO, AREA, and EQUATION"
            width={1200}
            height={675}
            sizes={SHELF_CARD_SIZES}
          />
        </span>
        <span className={styles.shelfCaption}><strong>{games.cardTitle}</strong><CaptionFeatures features={games.features} /></span>
      </Link>
      <Link className={styles.shelfCard} href={homework.href} data-product="homework">
        <span className={styles.shelfImage}>
          <Image
            src="/media/home/homework-preview.webp"
            alt="MathNexa homework PDF with fruit diagrams and space to show thinking"
            width={1200}
            height={800}
            sizes={SHELF_CARD_SIZES}
          />
        </span>
        <span className={styles.shelfCaption}><strong>{homework.cardTitle}</strong><CaptionFeatures features={homework.features} /></span>
      </Link>
      <Link className={styles.shelfCard} href={quizzes.href} data-product="quizzes">
        <span className={styles.shelfImage}>
          <Image
            src="/media/home/quiz-preview.webp"
            alt="MathNexa Grade 7 topic quiz PDF with a table and two graphs"
            width={1200}
            height={800}
            sizes={SHELF_CARD_SIZES}
          />
        </span>
        <span className={styles.shelfCaption}><strong>{quizzes.cardTitle}</strong><CaptionFeatures features={quizzes.features} /></span>
      </Link>
    </div>
  </section>;
}

/**
 * Featured games: Math Tug of War, in the same card language as the Math Games
 * shelf. Math Vocabulary Hunt is no longer promoted here (owner, after v1.2.27);
 * the game itself is unchanged and stays in the Math Games catalog and at its
 * own routes. Math Tug of War is free with
 * a MathNexa account (lib/games/access-policy.ts); its button always points at
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
  // The band and its grid open on one line so the hero copy keeps the
  // original nesting depth: the Authorize Code block below is byte-identical
  // to the pre-redesign homepage, indentation included.
  return <>
    <section className={styles.heroBand} aria-labelledby="home-title"><div className={`container ${styles.hero}`}>
      <div className={`teacher-home-copy ${styles.heroCopy}`}>
        <p className="eyebrow">{HOME_EYEBROW}</p>
        <h1 id="home-title">{HOME_HEADLINE_LEAD}<span className={styles.headlineMark}>{HOME_HEADLINE_MARK}</span>{HOME_HEADLINE_TAIL}</h1>
        <p className={styles.lede}>{PLATFORM_HERO_DESCRIPTION}</p>
        <p className={styles.audience}>{PLATFORM_HERO_AUDIENCE}</p>
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
      <PrepBoard />
    </div></section>

    <ProductShelf />

    <FeaturedGames />

    {authState === "unconfirmed" ? <Container><ConfirmationReminder /></Container> : null}
  </>;
}
