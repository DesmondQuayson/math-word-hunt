"use client";

import { useId, useState } from "react";

import styles from "./home.module.css";

const BARS_PER_CUP = 4;
const TARGET_BARS = 28;
const CHOICES = [6, 7, 8] as const;

/**
 * The visitor's turn after the worked example: same ratio, new number of
 * bars. Feedback shows the reasoning (a wrong pick says how many bars it would
 * make) instead of only right or wrong. Runs in the browser only; nothing is
 * stored or sent anywhere.
 */
export function YourTurn() {
  const [picked, setPicked] = useState<number | null>(null);
  const id = useId();
  const answer = TARGET_BARS / BARS_PER_CUP;
  const feedback = picked === null
    ? ""
    : picked === answer
      ? `Yes: ${picked} cups × ${BARS_PER_CUP} = ${TARGET_BARS} bars.`
      : `Not quite: ${picked} cups × ${BARS_PER_CUP} = ${picked * BARS_PER_CUP} bars. Try again.`;
  return <div className={styles.yourTurn} role="group" aria-labelledby={`${id}-question`}>
    <p id={`${id}-question`} className={styles.yourTurnQuestion}>
      <span className={styles.yourTurnLabel}>Your turn</span> How many cups make {TARGET_BARS} bars?
    </p>
    <div className={styles.yourTurnChoices}>
      {CHOICES.map((cups) => <button
        key={cups}
        type="button"
        className={styles.choice}
        aria-pressed={picked === cups}
        data-result={picked === cups ? (cups === answer ? "right" : "wrong") : undefined}
        onClick={() => setPicked(cups)}
      >{cups} cups</button>)}
    </div>
    <p className={styles.yourTurnFeedback} aria-live="polite">{feedback}</p>
  </div>;
}
