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
 * There are no manual controls (owner, after v1.2.27). Answering "Your turn"
 * stops the cycle so the answer stays on screen. With reduced motion nothing
 * loops: the solved problem shows. When motion is allowed again the board is
 * re-keyed, which restarts its CSS animations from the top.
 */
export function PrepBoardReplay({ children }: Readonly<{ children: ReactNode }>) {
  const [run, setRun] = useState(0);
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
  </div>;
}
