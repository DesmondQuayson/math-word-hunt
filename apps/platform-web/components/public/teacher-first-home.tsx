import Image from "next/image";
import Link from "next/link";
import { Fragment } from "react";

import { ConfirmationReminder } from "@/components/auth/email-confirmation-dialog";
import { AuthorizedAccessActivePanel } from "@/components/auth/authorized-access-active-panel";
import { AuthorizedCodeForm } from "@/components/auth/authorized-code-form";
import { Container } from "@/components/layout/container";
import { LinkButton } from "@/components/ui/link-button";
import { homeFeaturedGames, type HomeFeaturedGame } from "@/lib/games/home-featured-games";
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
  /**
   * The homepage game library, built in app/page.tsx from the published
   * catalog (lib/games/home-featured-games.ts). Omitted: the full curated list.
   */
  featuredGames?: readonly HomeFeaturedGame[];
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
 * Featured games: a compact library of the published MathNexa games
 * (lib/games/home-featured-games.ts decides which, in what order, with what
 * copy). Free games carry the Free badge and link straight to their play or
 * host route; the routes send a signed-out visitor through sign in or create
 * account and back. Students join Math Bingo Live and Polygon Showdown rooms
 * at /join with no account. Subscription games are labelled as such. Only the
 * thumbnails load here: no game code, avatar renderer or shop asset.
 * Nothing here decides access.
 */
function FeaturedGames({ games }: Readonly<{ games: readonly HomeFeaturedGame[] }>) {
  if (!games.length) return null;
  return <section className="home-featured-games container" aria-labelledby="featured-games-title">
    <header className="home-featured-games-header">
      <p className="eyebrow">Play now</p>
      <h2 id="featured-games-title">Featured games</h2>
      <p className="home-featured-games-note">Free games need only a MathNexa account.</p>
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
            {game.free ? <span className="game-free-badge">Free</span> : <span className="home-game-access">Subscription</span>}
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
  </section>;
}

export function TeacherFirstHome({
  authState = "signed-out",
  entitled = false,
  schoolAccess = false,
  featuredGames
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

    <FeaturedGames games={featuredGames ?? homeFeaturedGames(null)} />

    {authState === "unconfirmed" ? <Container><ConfirmationReminder /></Container> : null}
  </>;
}
