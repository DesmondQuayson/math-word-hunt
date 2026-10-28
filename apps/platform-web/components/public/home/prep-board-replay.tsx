"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { createBoardLoop, type BoardLoop } from "./board-loop";
import styles from "./home.module.css";

/**
 * Plays the worked problem when it is seen, then again on its own after a
 * three-second rest on the solved problem, for as long as it stays on screen
 * (see board-loop.ts).
 *
 * Where the board is already in view at load (laptops, Smart Boards,
 * landscape tablets) the CSS sequence simply plays. Where it starts below the
 * fold (phones, portrait tablets), its animations are held at their first
 * frame while off screen and released when the board scrolls into view, so
 * the visitor sees it being written. Without JavaScript, IntersectionObserver
 * or the Web Animations API nothing is held or repeated: the sequence plays
 * once and the finished problem shows.
 *
 * Replay re-keys the server-rendered board, which restarts its CSS animations
 * from the top and clears "Your turn"; the automatic cycle carries on after
 * it. Pause stops the motion: the cycle runs for longer than five seconds, so
 * it needs one (WCAG 2.2.2). With reduced motion both buttons are hidden and
 * nothing loops: the solved problem shows.
 */
export function PrepBoardReplay({ children }: Readonly<{ children: ReactNode }>) {
  const [run, setRun] = useState(0);
  const [paused, setPaused] = useState(false);
  const stage = useRef<HTMLDivElement | null>(null);
  const board = useRef<HTMLDivElement | null>(null);
  const loop = useRef<BoardLoop | null>(null);

  useEffect(() => {
    const element = stage.current;
    const current = board.current;
    if (!element || !current || typeof window === "undefined" || !("IntersectionObserver" in window) || typeof element.getAnimations !== "function") return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let inView = element.getBoundingClientRect().top < window.innerHeight * 0.75;
    const animations = current.getAnimations({ subtree: true });
    if (!inView) {
      for (const animation of animations) {
        animation.pause();
        animation.currentTime = 0;
      }
    }
    const controller = createBoardLoop({
      remount: () => setRun((value) => value + 1),
      onPausedChange: setPaused,
      onScreen: inView && document.visibilityState !== "hidden",
      reduced: motion.matches
    });
    loop.current = controller;
    controller.track(animations);
    controller.setFocused(current.contains(document.activeElement));
    const update = () => controller.setOnScreen(inView && document.visibilityState !== "hidden");
    const observer = new IntersectionObserver((entries) => {
      inView = entries[entries.length - 1].isIntersecting;
      update();
    });
    observer.observe(element);
    const onMotion = () => controller.setReduced(motion.matches);
    document.addEventListener("visibilitychange", update);
    motion.addEventListener("change", onMotion);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
      motion.removeEventListener("change", onMotion);
      controller.dispose();
      loop.current = null;
    };
  }, []);

  useEffect(() => {
    // The first board is followed when the loop starts; this follows each fresh one.
    const current = board.current;
    if (run > 0 && current) loop.current?.track(current.getAnimations({ subtree: true }));
  }, [run]);

  return <div ref={stage} className={styles.boardStage}>
    <div
      key={run}
      ref={board}
      className={styles.boardRun}
      onFocus={() => loop.current?.setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) loop.current?.setFocused(false);
      }}
      onClick={(event) => {
        // The only buttons on the sheet are the "Your turn" answers.
        if (event.target instanceof Element && event.target.closest("button")) loop.current?.answered();
      }}
    >{children}</div>
    <div className={styles.boardControls}>
      <button type="button" className={styles.replay} onClick={() => (loop.current ? loop.current.replay() : setRun((value) => value + 1))}>
        <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M4.5 10a5.5 5.5 0 1 0 1.7-4M4.5 3.5V6.5H7.5" /></svg>
        Replay the worked example
      </button>
      <button type="button" className={`${styles.replay} ${styles.pauseToggle}`} aria-label={paused ? "Play the worked example" : "Pause the worked example"} onClick={() => loop.current?.togglePause()}>
        <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d={paused ? "M7 4.5 L15.5 10 L7 15.5 Z" : "M7.5 4.5 V15.5 M12.5 4.5 V15.5"} /></svg>
      </button>
    </div>
  </div>;
}
