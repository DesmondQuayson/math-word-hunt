import Image from "next/image";
import Link from "next/link";
import { Fragment } from "react";

import { ConfirmationReminder } from "@/components/auth/email-confirmation-dialog";
import { AuthorizedAccessActivePanel } from "@/components/auth/authorized-access-active-panel";
import { AuthorizedCodeForm } from "@/components/auth/authorized-code-form";
import { TrialOfferNote } from "@/components/consumer/trial-offer-note";
import { Container } from "@/components/layout/container";
import { LinkButton } from "@/components/ui/link-button";
import { CREATE_ACCOUNT_HREF, SIGN_IN_HREF, START_TRIAL_SIGN_UP_HREF } from "@/lib/consumer/header-cta";
import { homeFreeGames, type HomeFreeGame } from "@/lib/games/home-free-games";
import { AUTHORIZED_ACCESS_ANCHOR } from "@/lib/navigation/banner";
import { ONLINE_MATH_PREP_GRADES, onlineMathPrepGradeHref } from "@/lib/showme-access/grades";
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

/**
 * The hero's next step for a signed-in visitor without access, chosen in
 * app/page.tsx from the server's access decision by the same rule as the header
 * button (lib/consumer/header-cta): "Start free trial" only while the account's
 * one trial is unused, "Subscribe" once it is used and access has ended,
 * "Manage subscription" for a payment problem, "Trial status" while a trial is
 * activating.
 */
export type HomeHeroCta = Readonly<{ label: string; href: string }>;

type TeacherFirstHomeProps = Readonly<{
  authState?: HomeAuthState;
  entitled?: boolean;
  heroCta?: HomeHeroCta | null;
  /** The visitor's access comes from an authorized (school) code already entered in this session. */
  schoolAccess?: boolean;
  /**
   * The homepage free games, built in app/page.tsx from the published catalog
   * and the access policy (lib/games/home-free-games.ts). Omitted: the free
   * games MathNexa already has, as when the catalog cannot be read.
   */
  freeGames?: readonly HomeFreeGame[];
}>;

function HeroActions({ authState, entitled, heroCta }: Readonly<{ authState: HomeAuthState; entitled: boolean; heroCta?: HomeHeroCta | null }>) {
  if (authState === "signed-out") {
    // No session: the server cannot know whether this person already used a
    // trial, so all three existing entry points show, trial first. Trial
    // eligibility is decided on the server once they sign in or sign up.
    // The offer is stated where the button is: the trial, the price after it,
    // the card requirement and the cancel rule (components/consumer/trial-offer-note).
    return <>
      <div className="button-row teacher-home-actions">
        <LinkButton href={START_TRIAL_SIGN_UP_HREF}>Start free trial</LinkButton>
        <LinkButton variant="secondary" href={CREATE_ACCOUNT_HREF}>Create account</LinkButton>
        <LinkButton variant="ghost" href={SIGN_IN_HREF}>Sign in</LinkButton>
      </div>
      <TrialOfferNote />
    </>;
  }
  if (!entitled) {
    // Signed in without access: exactly the header's server-decided next step,
    // so a used trial is never offered again; without one, the access page.
    const action = heroCta ?? { label: "View access options", href: "/subscription" };
    const offersTrial = action.label === "Start free trial";
    return <>
      <div className="button-row teacher-home-actions">
        <LinkButton href={action.href}>{action.label}</LinkButton>
        <LinkButton variant="secondary" href="/account">My Account</LinkButton>
      </div>
      {offersTrial ? <TrialOfferNote /> : null}
    </>;
  }
  return <p className="teacher-home-ready" role="status">
    <span aria-hidden="true">✓</span> Your MathNexa resource shelf is ready below.
  </p>;
}

/**
 * "Select your grade to start learning", straight under the headline: one link
 * per Online Math Prep grade, Grade 1 to Grade 8 (lib/showme-access/grades).
 * Each goes through MathNexa's ShowMe pass route, the same server-side check as
 * the shelf's Online Math Prep card: with a trial, a subscription or a school
 * code the visitor lands on that grade; otherwise they are sent to sign in,
 * confirm their email or subscribe, and the grade is remembered for 30 minutes.
 * Nothing here decides access. Plain <a> elements, not next/link: a prefetch
 * would call the pass route (issuing a pass, or overwriting the remembered
 * grade), and a client-side visit cannot follow its redirect to another site.
 * The title is a paragraph, not a heading, so the page's heading outline is
 * unchanged.
 */
function GradeSelector() {
  return <nav className={styles.gradePicker} aria-labelledby="home-grade-title">
    <p id="home-grade-title" className={styles.gradePickerTitle}>Select your grade to start learning</p>
    <ul className={styles.gradeGrid}>
      {ONLINE_MATH_PREP_GRADES.map((grade) => <li key={grade}>
        <a className={styles.gradeKey} href={onlineMathPrepGradeHref(grade)} data-grade={grade} rel="nofollow">Grade {grade}</a>
      </li>)}
    </ul>
  </nav>;
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
            src="/media/home/mathnexa-grade1-math-visual.webp"
            alt="A child learning with a teacher beside Grade 1 activities about telling time and understanding money."
            width={2400}
            height={1440}
            sizes={SHELF_FEATURE_SIZES}
          />
        </span>
        <span className={styles.shelfCaption}><strong>{mathPrep.cardTitle}</strong><CaptionFeatures features={mathPrep.features} /><span className={styles.shelfNote}>Lessons, practice and review for Grades 1–8, with a worksheet generator for printing practice.</span><span className={styles.shelfAction}>Open Online Math Prep <span aria-hidden="true">→</span></span></span>
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
            alt="MathNexa Grade 6 topic quiz PDF with a ratio table and two graphs"
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
 * Image width hint for the compact library grid (styles/games.css): four
 * columns of at most 18rem in the 74rem container, three on tablets and small
 * laptops, two on phones, one on the narrowest screens. Next serves a
 * thumbnail sized to the column instead of the 1200px original.
 */
const HOME_GAME_IMAGE_SIZES = "(min-width: 68rem) 18rem, (min-width: 48rem) 32vw, (min-width: 22rem) 48vw, 100vw";

/**
 * Free math games: the published games any signed-in MathNexa account can play
 * with no subscription (lib/games/home-free-games.ts decides which, from the
 * catalog and the access policy, in what order, with what copy). Each card
 * links straight to its game's play or host route; the routes send a
 * signed-out visitor through sign in or create account and back. Students join
 * Math Bingo Live and Polygon Showdown rooms at /join with no account.
 * Subscription games are not shown here: "View all math games" leads to the
 * full catalog at /math-games. Only the thumbnails load here: no game code,
 * avatar renderer or shop asset. Nothing here decides access.
 */
function FreeGames({ games }: Readonly<{ games: readonly HomeFreeGame[] }>) {
  if (!games.length) return null;
  return <section className="home-featured-games container" aria-labelledby="free-games-title">
    <header className="home-featured-games-header">
      <p className="eyebrow">Play now</p>
      <h2 id="free-games-title">Free math games</h2>
      <p className="home-featured-games-note">Free with a MathNexa account. No subscription needed.</p>
    </header>
    <div className="game-card-grid">
      {games.map((game) => <article key={game.stableKey} data-game={game.stableKey}>
        <div className="game-card-thumbnail">
          <Image
            src={game.image.src}
            alt={game.image.alt}
            width={1200}
            height={675}
            sizes={HOME_GAME_IMAGE_SIZES}
            unoptimized={game.image.src.endsWith(".svg")}
          />
        </div>
        <div className="game-card-content">
          <p className="game-path home-game-meta">
            <span className="game-free-badge">Free</span>
            <span className="home-game-category">{game.category}</span>
          </p>
          <h3>{game.title}</h3>
          <p className="home-game-blurb">{game.blurb}</p>
          <div className="home-game-actions">
            <LinkButton href={game.primary.href}>{game.primary.label}<span className="visually-hidden">{` ${game.title}`}</span></LinkButton>
            {game.secondary ? <Link className="home-game-secondary" href={game.secondary.href}>{game.secondary.label}</Link> : null}
          </div>
        </div>
      </article>)}
    </div>
    <div className="home-featured-games-more">
      <LinkButton variant="secondary" href="/math-games">View all math games</LinkButton>
    </div>
  </section>;
}

export function TeacherFirstHome({
  authState = "signed-out",
  entitled = false,
  heroCta = null,
  schoolAccess = false,
  freeGames
}: TeacherFirstHomeProps) {
  // The band and its grid open on one line so the hero copy keeps the
  // original nesting depth: the Authorize Code block below is byte-identical
  // to the pre-redesign homepage, indentation included.
  return <>
    <section className={styles.heroBand} aria-labelledby="home-title"><div className={`container ${styles.hero}`}>
      <div className={`teacher-home-copy ${styles.heroCopy}`}>
        <p className="eyebrow">{HOME_EYEBROW}</p>
        <h1 id="home-title">{HOME_HEADLINE_LEAD}<span className={styles.headlineMark}>{HOME_HEADLINE_MARK}</span>{HOME_HEADLINE_TAIL}</h1>
        <GradeSelector />
        <p className={styles.lede}>{PLATFORM_HERO_DESCRIPTION}</p>
        <p className={styles.audience}>{PLATFORM_HERO_AUDIENCE}</p>
        <HeroActions authState={authState} entitled={entitled} heroCta={heroCta} />
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

    <FreeGames games={freeGames ?? homeFreeGames(null)} />

    {authState === "unconfirmed" ? <Container><ConfirmationReminder /></Container> : null}
  </>;
}
