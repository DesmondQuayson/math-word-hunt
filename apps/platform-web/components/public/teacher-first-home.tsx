import Link from "next/link";

import { Container } from "@/components/layout/container";
import { LinkButton } from "@/components/ui/link-button";
import type { ProductDestination } from "@/lib/auth/access-intent";

const modules: readonly Readonly<{
  href: ProductDestination;
  label: string;
  title: string;
  description: string;
  symbol: string;
}>[] = [
  {
    href: "/games",
    label: "Interactive practice",
    title: "Games",
    description: "Turn grade- and lesson-aligned math ideas into whole-class participation.",
    symbol: "G"
  },
  {
    href: "/map-prep",
    label: "Missouri assessment practice",
    title: "MAP Prep",
    description: "Open the teacher-curated MAP Prep destination for focused mathematics practice.",
    symbol: "M"
  },
  {
    href: "/homework",
    label: "Image-rich printables",
    title: "Homework",
    description: "Find classroom-ready homework PDFs organized by grade, topic, and lesson.",
    symbol: "H"
  },
  {
    href: "/quizzes",
    label: "Ready to check learning",
    title: "Quizzes",
    description: "Choose printable quiz PDFs and answer keys for quick lesson follow-through.",
    symbol: "Q"
  }
] as const;

function ClassroomToolkitVisual() {
  return <div
    className="classroom-toolkit"
    role="img"
    aria-label="A teacher planning table with an interactive math game, Missouri MAP Prep, an image-rich homework PDF, and a quiz PDF with answer key"
  >
    <div className="toolkit-heading" aria-hidden="true">
      <span>Today&apos;s math toolkit</span>
      <b>Grade 5 · Fractions</b>
    </div>
    <div className="toolkit-grid" aria-hidden="true">
      <div className="toolkit-game">
        <span className="toolkit-tab">Interactive game</span>
        <div className="toolkit-game-board">
          {Array.from({ length: 12 }, (_, index) => <i key={index}>{["3", "÷", "4", "=", "0.75", "×"][index % 6]}</i>)}
        </div>
        <small>Discuss · trace · solve</small>
      </div>
      <div className="toolkit-map">
        <span className="toolkit-tab">MAP Prep</span>
        <svg viewBox="0 0 180 100" focusable="false">
          <path d="M18 76 C45 16 76 88 105 38 S150 23 164 54" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeDasharray="2 11" />
          <circle cx="18" cy="76" r="9" />
          <path d="m150 51 14 3-7-13" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <small>Missouri-ready practice</small>
      </div>
      <div className="toolkit-paper toolkit-homework">
        <span className="toolkit-tab">Homework PDF</span>
        <strong>Fractions in pictures</strong>
        <div className="fraction-picture"><i /><i /><i /><i /></div>
        <span className="paper-line" /><span className="paper-line short" />
      </div>
      <div className="toolkit-paper toolkit-quiz">
        <span className="answer-key-tab">Answer key</span>
        <span className="toolkit-tab">Quiz PDF</span>
        <strong>Lesson check</strong>
        <ol><li>A</li><li>C</li><li>B</li></ol>
      </div>
    </div>
    <div className="toolkit-pencil" aria-hidden="true"><span /> Plan · teach · check</div>
  </div>;
}

export function TeacherFirstHome() {
  return <>
    <section className="teacher-home-hero container" aria-labelledby="home-title">
      <div className="teacher-home-copy">
        <p className="eyebrow">TEACHER-LED CLASSROOM MATH RESOURCES</p>
        <h1 id="home-title">Make every math lesson clearer, more engaging, and ready to teach.</h1>
        <p className="teacher-home-lede">Interactive games, Missouri MAP Prep, image-rich homework PDFs, and classroom-ready quizzes—organized by grade, topic, and lesson.</p>
        <p className="teacher-home-audience">Built for teachers. Useful for families. Engaging for learners.</p>
        <div className="button-row teacher-home-actions">
          <LinkButton href="/sign-up">Create an account</LinkButton>
          <LinkButton variant="secondary" href="/sign-in">Sign in</LinkButton>
        </div>
      </div>
      <ClassroomToolkitVisual />
    </section>

    <section className="teacher-module-section" aria-labelledby="modules-heading">
      <Container width="wide">
        <div className="teacher-module-heading">
          <div>
            <p className="eyebrow">One organized resource shelf</p>
            <h2 id="modules-heading">Plan the lesson. Lead the room. Keep the next step close.</h2>
          </div>
          <p>Move from active practice to independent work and a quick check for understanding without hunting across disconnected tools.</p>
        </div>
        <div className="teacher-module-grid">
          {modules.map((module) => <article className="teacher-module-card" key={module.href}>
            <div className="teacher-module-symbol" aria-hidden="true">{module.symbol}</div>
            <p className="card-kicker">{module.label}</p>
            <h3>{module.title}</h3>
            <p>{module.description}</p>
            <Link className="teacher-module-link" href={module.href}>
              Explore {module.title} <span aria-hidden="true">→</span>
            </Link>
          </article>)}
        </div>
      </Container>
    </section>

    <section className="teacher-home-proof container" aria-labelledby="teacher-proof-heading">
      <div>
        <p className="eyebrow">Designed around teaching</p>
        <h2 id="teacher-proof-heading">A calmer path from lesson idea to classroom use.</h2>
      </div>
      <ul>
        <li><strong>Find by lesson</strong><span>Use grade, topic, and lesson structure to reach the right resource quickly.</span></li>
        <li><strong>Teach your way</strong><span>Choose an interactive game, printable practice, assessment prep, or a quiz.</span></li>
        <li><strong>Keep learners moving</strong><span>Use clear, focused materials on phones, laptops, tablets, or a shared classroom display.</span></li>
      </ul>
    </section>
  </>;
}
