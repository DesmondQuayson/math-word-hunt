import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProductFigure, ProductLanding } from "@/components/public/product-landing";
import { LinkButton } from "@/components/ui/link-button";
import { isProductionPlatformMode } from "@/lib/environment/production-platform";
import { MATH_TUG_OF_WAR_PLAY_ROUTE } from "@/lib/games/access-policy";
import { SCHOOL_ACCESS_DURATION_SECONDS } from "@/lib/school-access/session";
import { PRODUCT_PAGE_PATHS } from "@/lib/seo/product-pages";
import { publicPageMetadata } from "@/lib/seo/public-pages";

const PATH = PRODUCT_PAGE_PATHS.mathTugOfWar;

export function generateMetadata(): Metadata {
  return isProductionPlatformMode() ? publicPageMetadata(PATH) : {};
}

/**
 * Public page for Math Tug of War. Every rule here is the game's own
 * (public/internal-games/math-tug-of-war/src: app.js modes, tug.js rope and
 * names, questions.js skills; rooms in the 20260927100000 migration).
 */
export default function MathTugOfWarPage() {
  if (!isProductionPlatformMode()) notFound();
  return <ProductLanding
    path={PATH}
    eyebrow="Free with a MathNexa account"
    title="Math Tug of War"
    description="Solve the math. Pull the rope. Beat the other side! Answer quick math questions to pull the rope toward your side."
    actions={<>
      <LinkButton href={MATH_TUG_OF_WAR_PLAY_ROUTE}>Play for free</LinkButton>
      <LinkButton href={PRODUCT_PAGE_PATHS.mathGames} variant="secondary">All math games</LinkButton>
    </>}
    access="free-game"
    schoolAccessHours={SCHOOL_ACCESS_DURATION_SECONDS / 3600}
  >
    <ProductFigure src="/media/games/math-tug-of-war.webp" alt="Math Tug of War gameplay artwork: the Turquoise and Pink teams pulling a rope while each side answers integer questions on a keypad" width={1200} height={675} />
    <section aria-labelledby="tug-modes">
      <h2 id="tug-modes">Three ways to play</h2>
      <ul className="principle-list">
        <li><strong>VS Robot</strong><span>One player against the MathNexa Robot.</span></li>
        <li><strong>Two Teams</strong><span>Two teams play together on one device. Best played on a smart board.</span></li>
        <li><strong>Online Match</strong><span>Play from two devices. One player creates a room and shares its 5-character code; the other player joins with it.</span></li>
      </ul>
    </section>
    <section aria-labelledby="tug-rules">
      <h2 id="tug-rules">How a match works</h2>
      <ul>
        <li>Each correct answer pulls the rope one step toward your side.</li>
        <li>Wrong answers never move the rope, and there is no timer.</li>
        <li>The first side to pull the rope 7 steps from the center wins.</li>
      </ul>
    </section>
    <section aria-labelledby="tug-skills">
      <h2 id="tug-skills">Six skills to choose from</h2>
      <ul className="principle-list">
        <li><strong>Addition</strong><span>Numbers from 1 to 12.</span></li>
        <li><strong>Subtraction</strong><span>Numbers from 1 to 12, with answers that are never negative.</span></li>
        <li><strong>Multiplication</strong><span>Numbers from 1 to 12.</span></li>
        <li><strong>Addition &amp; Subtraction of Integers</strong><span>Integers from −12 to 12, with at least one negative number in each problem.</span></li>
        <li><strong>Opposite of Integers</strong><span>Integers from −12 to 12.</span></li>
        <li><strong>Absolute Value</strong><span>Integers from −12 to 12.</span></li>
      </ul>
    </section>
    <section aria-labelledby="tug-privacy">
      <h2 id="tug-privacy">Names and online rooms</h2>
      <p>In an online match, each player needs their own access and types a name of up to 20 characters. Use a first name or a team name. Rooms older than 24 hours are deleted automatically when new rooms are opened. The <Link href="/privacy">Privacy notice</Link> has the details.</p>
    </section>
  </ProductLanding>;
}
