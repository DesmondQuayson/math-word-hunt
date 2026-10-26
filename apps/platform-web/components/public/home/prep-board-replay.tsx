"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import styles from "./home.module.css";

/**
 * Plays the worked problem when it is seen, and again on request.
 *
 * Where the board is already in view at load (laptops, Smart Boards,
 * landscape tablets) the CSS sequence simply plays. Where it starts below the
 * fold (phones, portrait tablets), its animations are held at their first
 * frame while off screen and released when a quarter of the board is visible,
 * so the visitor sees it being written. Without JavaScript,
 * IntersectionObserver or motion, nothing is held: the finished problem shows.
 *
 * Replay re-keys the server-rendered board, which restarts its CSS animations
 * from the top. With reduced motion the button is hidden: nothing to replay.
 */
export function PrepBoardReplay({ children }: Readonly<{ children: ReactNode }>) {
  const [run, setRun] = useState(0);
  const stage = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = stage.current;
    if (!element || typeof window === "undefined" || !("IntersectionObserver" in window) || typeof element.getAnimations !== "function") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (element.getBoundingClientRect().top < window.innerHeight * 0.75) return;
    for (const animation of element.getAnimations({ subtree: true })) {
      animation.pause();
      animation.currentTime = 0;
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      for (const animation of element.getAnimations({ subtree: true })) if (animation.playState === "paused") animation.play();
    }, { threshold: 0.25 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return <div ref={stage} className={styles.boardStage}>
    <div key={run} className={styles.boardRun}>{children}</div>
    <button type="button" className={styles.replay} onClick={() => setRun((value) => value + 1)}>
      <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M4.5 10a5.5 5.5 0 1 0 1.7-4M4.5 3.5V6.5H7.5" /></svg>
      Replay the worked example
    </button>
  </div>;
}
