import styles from "./home.module.css";
import { PrepBoardReplay } from "./prep-board-replay";
import { YourTurn } from "./your-turn";

/**
 * The hero's worked problem: one Online Math Prep-style ratio question solved
 * on graph paper, written in step by step when it comes into view, checked by
 * multiplying back, then handed to the visitor as "Your turn".
 *
 * It is real text (screen readers read the problem and both steps) inside a
 * captioned figure, and it is labelled as an example. The arithmetic is
 * checked by the homepage unit test: 12 ÷ 3 = 4 bars per cup, 20 ÷ 4 = 5 cups,
 * 5 × 4 = 20, 28 ÷ 4 = 7.
 *
 * Motion: one sequence, finished in under five seconds, replayed after a
 * three-second rest while on screen, with Pause (WCAG 2.2.2) and Replay
 * buttons. Every animated element's resting style is its final state,
 * so reduced motion, a cancelled animation or a screenshot all show the solved
 * problem. The sheet and the problem text never fade (they only slide), so
 * the page's largest text paints at once.
 */
export function PrepBoard() {
  return <PrepBoardReplay>
    <figure className={styles.board} aria-labelledby="prep-board-caption">
      <div className={styles.sheet}>
        <div className={styles.sheetTop}>
          <span className={styles.topicChip}>Grade 6 · Ratios</span>
          <ol className={styles.progress} aria-label="Example session progress">
            <li data-state="done"><span aria-hidden="true" className={styles.progressDot} />Learn</li>
            <li data-state="current" aria-current="step"><span aria-hidden="true" className={styles.progressDot} />Practice</li>
            <li><span aria-hidden="true" className={styles.progressDot} />Review</li>
          </ol>
        </div>

        <p className={styles.problem}>
          <span className={styles.problemNumber} aria-hidden="true">3</span>
          <span>3 cups of oats make 12 granola bars. How many cups make 20 bars?</span>
        </p>

        <svg className={styles.numberLine} viewBox="0 0 320 100" role="img" aria-label="Double number line: 1 cup matches 4 bars, 3 cups match 12 bars, 5 cups match 20 bars">
          <text className={styles.lineName} x="0" y="35">cups</text>
          <text className={styles.lineName} x="0" y="77">bars</text>
          <path className={styles.lineAxis} d="M46 31 H306" />
          <path className={styles.lineAxis} d="M46 73 H306" />
          <g className={styles.lineGiven}>
            <path d="M46 25 V37 M46 67 V79 M202 25 V37 M202 67 V79" />
            <text x="46" y="17">0</text><text x="46" y="96">0</text>
            <text x="202" y="17">3</text><text x="202" y="96">12</text>
          </g>
          <g className={styles.lineStepOne}>
            <path className={styles.lineLink} d="M98 37 V67" />
            <path d="M98 25 V37 M98 67 V79" />
            <text x="98" y="17">1</text><text x="98" y="96">4</text>
          </g>
          <g className={styles.lineStepTwo}>
            <path className={styles.lineLink} d="M306 37 V67" />
            <path d="M306 25 V37 M306 67 V79" />
            <text x="306" y="96">20</text>
            <text className={styles.lineAnswer} x="306" y="17">5</text>
          </g>
          <text className={styles.lineQuestion} x="306" y="17">?</text>
        </svg>

        <div className={styles.work}>
          <p className={styles.note}>
            <span>find the unit rate</span>
            <svg className={styles.noteArrow} viewBox="0 0 60 40" aria-hidden="true"><path pathLength="1" d="M56 6 C 44 4, 26 10, 12 28 M12 28 L 13 17 M12 28 L 23 26" /></svg>
          </p>
          <p className={`${styles.step} ${styles.stepOne}`}><span className={styles.stepInk}>12 bars ÷ 3 cups = <strong>4 bars per cup</strong></span></p>
          <p className={`${styles.step} ${styles.stepTwo}`}>
            <span className={styles.stepInk}>20 bars ÷ 4 = <strong className={styles.answer}>5 cups<svg className={styles.answerRing} viewBox="0 0 120 48" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" d="M18 9 C 44 1, 96 2, 112 17 C 122 30, 98 44, 60 45 C 22 46, 3 36, 6 22 C 8 13, 22 7, 40 6" /></svg></strong></span>
          </p>
        </div>

        <p className={styles.check}>
          <svg className={styles.checkMark} viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14" /><path pathLength="1" d="M9 16.5 L14 21.5 L23.5 10.5" /></svg>
          <span>Check: 5 cups × 4 = 20 bars</span>
        </p>

        <YourTurn />

        <svg className={styles.pencil} viewBox="0 0 140 36" aria-hidden="true">
          <path className={styles.pencilWood} d="M18 8 L2 18 L18 28 Z" />
          <path className={styles.pencilLead} d="M7.5 14.6 L2 18 L7.5 21.4 Z" />
          <path className={styles.pencilBody} d="M18 8 H112 V28 H18 Z" />
          <path className={styles.pencilFacet} d="M18 18 H112" />
          <path className={styles.pencilBand} d="M112 7 H122 V29 H112 Z" />
          <path className={styles.pencilEraser} d="M122 7 H133 C 137 7, 138 10, 138 18 C 138 26, 137 29, 133 29 H122 Z" />
        </svg>
      </div>
      <figcaption id="prep-board-caption" className={styles.boardCaption}>Example: a Grade 6 ratio problem, worked one step at a time.</figcaption>
    </figure>
  </PrepBoardReplay>;
}
