import Image from "next/image";
import Link from "next/link";

import { ConfirmationReminder } from "@/components/auth/email-confirmation-dialog";
import { Container } from "@/components/layout/container";
import { Reveal } from "@/components/motion/reveal";
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
          src="/media/home/math-word-hunt.webp"
          alt="Math Word Hunt game artwork with a glowing vocabulary grid"
          width={1400}
          height={700}
          sizes="(max-width: 54rem) 88vw, 38vw"
          loading="eager"
          priority
        />
        <span className="constellation-caption"><strong>Math Word Hunt</strong><span>Engage · Games</span></span>
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

function GamesShowcase({ published }: Readonly<{ published: boolean }>) {
  return <article className="product-showcase-card product-showcase-games">
    <div className="product-showcase-heading">
      <div>
        <p className="card-kicker">Whole-class energy</p>
        <h3>Interactive Games</h3>
      </div>
      <p>Teacher-ready math games, one secure click away.</p>
    </div>
    <div className="game-preview-strip" aria-label="Published MathNexa games">
      <Link className="game-preview game-preview-landscape" href="/play">
        <span className="game-preview-image">
          <Image
            src="/media/home/math-word-hunt.webp"
            alt="Math Word Hunt game artwork with a glowing vocabulary grid and grades 6 through 8 classroom features"
            width={1400}
            height={700}
            sizes="(max-width: 48rem) 86vw, 52vw"
          />
        </span>
        <span className="game-preview-caption"><strong>Math Word Hunt</strong><small>Play now</small></span>
      </Link>
      {published ? <Link className="game-preview game-preview-portrait" href="/games/number-cross/play">
        <span className="game-preview-image">
          <Image
            src="/media/home/number-cross.webp"
            alt="Number Cross addition puzzle with crossed-out number tiles and solved row and column targets"
            width={720}
            height={1223}
            sizes="(max-width: 48rem) 72vw, 28vw"
          />
        </span>
        <span className="game-preview-caption"><strong>Number Cross</strong><small>Play now</small></span>
      </Link> : <div className="game-preview game-preview-portrait" aria-label="Number Cross preview, coming soon">
        <span className="game-preview-image">
          <Image
            src="/media/home/number-cross.webp"
            alt="Number Cross addition puzzle preview"
            width={720}
            height={1223}
            sizes="(max-width: 48rem) 72vw, 28vw"
          />
        </span>
        <span className="game-preview-caption"><strong>Number Cross</strong><small>Coming soon</small></span>
      </div>}
    </div>
    <Link className="product-showcase-link" href="/games">Explore all games <span aria-hidden="true">→</span></Link>
  </article>;
}

function ProductCard({
  href,
  eyebrow,
  title,
  description,
  image,
  alt,
  cta
}: Readonly<{
  href: "/map-prep" | "/homework" | "/quizzes";
  eyebrow: string;
  title: string;
  description: string;
  image: string;
  alt: string;
  cta: string;
}>) {
  return <article className="product-showcase-card product-showcase-resource">
    <div className="product-showcase-media">
      <Image src={image} alt={alt} width={1200} height={800} sizes="(max-width: 48rem) 92vw, 30vw" loading="lazy" />
    </div>
    <div className="product-showcase-body">
      <p className="card-kicker">{eyebrow}</p>
      <h3>{title}</h3>
      <p>{description}</p>
      <Link className="product-showcase-link" href={href}>{cta} <span aria-hidden="true">→</span></Link>
    </div>
  </article>;
}

export function TeacherFirstHome({
  authState = "signed-out",
  entitled = false,
  numberCrossPublished = false
}: TeacherFirstHomeProps) {
  return <>
    <section className="teacher-home-hero container" aria-labelledby="home-title">
      <div className="teacher-home-copy">
        <p className="eyebrow">Teacher-led classroom math resources</p>
        <h1 id="home-title">Make every math lesson clearer, more engaging, and ready to teach.</h1>
        <p className="teacher-home-lede">Games, Missouri MAP Prep, image-rich homework, and topic quizzes—one teacher-friendly platform.</p>
        <p className="teacher-home-audience">Built for teachers. Useful for families. Engaging for learners.</p>
        <HeroActions authState={authState} entitled={entitled} />
      </div>
      <LearningConstellation />
    </section>

    {authState === "unconfirmed" ? <Container><ConfirmationReminder /></Container> : null}

    <section className="product-showcase-section" aria-labelledby="product-showcase-title">
      <Container width="wide">
        <Reveal>
          <header className="product-showcase-intro">
            <div>
              <p className="eyebrow">MathNexa in action</p>
              <h2 id="product-showcase-title">See the real resources waiting for your next lesson.</h2>
            </div>
            <p>Move from active practice to independent work and a quick check for understanding.</p>
          </header>
        </Reveal>
        <Reveal delay={80}>
          <GamesShowcase published={numberCrossPublished} />
        </Reveal>
        <div className="product-showcase-grid">
          <Reveal delay={80}>
            <ProductCard
              href="/map-prep"
              eyebrow="Interactive workspace"
              title="Missouri MAP Prep"
              description="Practice MAP-style questions and tools in an interactive workspace."
              image="/media/home/map-prep-preview.webp"
              alt="Sanitized MathNexa MAP Prep workspace showing a proportional-relationship question, working board, graph, calculator, pen, eraser, highlighter, shape, and formula tools"
              cta="Open MAP Prep"
            />
          </Reveal>
          <Reveal delay={160}>
            <ProductCard
              href="/homework"
              eyebrow="Grade → Topic → Lesson"
              title="Interactive Homework"
              description="Image-rich practice with downloadable PDFs and answer keys."
              image="/media/home/homework-preview.webp"
              alt="Original MathNexa homework preview with a snack-bag unit-rate problem, fruit diagrams, writing space, and an answer-key indicator"
              cta="Browse Homework"
            />
          </Reveal>
          <Reveal delay={240}>
            <ProductCard
              href="/quizzes"
              eyebrow="Grade → Topic"
              title="Topic Quizzes"
              description="Classroom-ready assessments with downloadable PDFs and answer keys."
              image="/media/home/quiz-preview.webp"
              alt="Original MathNexa Grade 7 topic quiz preview with proportional-relationship questions, a table, graphs, and an answer-key indicator"
              cta="Browse Quizzes"
            />
          </Reveal>
        </div>
      </Container>
    </section>

    <section className="teacher-home-proof container" aria-labelledby="teacher-proof-heading">
      <Reveal>
        <div>
          <p className="eyebrow">Designed around teaching</p>
          <h2 id="teacher-proof-heading">A calmer path from lesson idea to classroom use.</h2>
        </div>
        <ul>
          <li><strong>Find the right level</strong><span>Resource-specific grade, topic, and lesson choices—no extra setup.</span></li>
          <li><strong>Teach your way</strong><span>An interactive game, printable practice, assessment prep, or a topic quiz.</span></li>
          <li><strong>Keep learners moving</strong><span>Focused materials on phones, laptops, tablets, or a classroom display.</span></li>
        </ul>
      </Reveal>
    </section>
  </>;
}
