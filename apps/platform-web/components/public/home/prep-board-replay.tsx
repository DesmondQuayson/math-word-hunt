"use client";

import { useState, type ReactNode } from "react";

import styles from "./home.module.css";

/**
 * Replays the worked problem on request. Re-keying the wrapper remounts the
 * server-rendered board, which restarts its CSS animations from the top. The
 * sequence never replays by itself; with reduced motion the control is hidden
 * because there is nothing to replay.
 */
export function PrepBoardReplay({ children }: Readonly<{ children: ReactNode }>) {
  const [run, setRun] = useState(0);
  return <div className={styles.boardStage}>
    <div key={run} className={styles.boardRun}>{children}</div>
    <button type="button" className={styles.replay} onClick={() => setRun((value) => value + 1)}>
      <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M4.5 10a5.5 5.5 0 1 0 1.7-4M4.5 3.5V6.5H7.5" /></svg>
      Replay the worked example
    </button>
  </div>;
}
