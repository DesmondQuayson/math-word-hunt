"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { createBoardLoop, type BoardLoop } from "./board-loop";
import styles from "./home.module.css";

/**
 * Plays the worked problem when it is seen, then again on its own after a
 * three-second rest on the solved problem, three complete plays in all; then
 * the solved problem stays for the rest of the visit (see board-loop.ts).
 *
 * Where the board is already in view at load (laptops, Smart Boards,
 * landscape tablets) the CSS sequence simply plays. Where it starts below the
 * fold (phones, portrait tablets), its animations are held at their first
 * frame while off screen and released when the board scrolls into view, so
 * the visitor sees it being written. Without JavaScript, IntersectionObserver
 * or the Web Animations API nothing is held or repeated: the sequence plays
 * once and the finished problem shows.
 *
 * The one control, Stop animation, shows only while plays are still to come
 * (WCAG 2.2.2), below the caption and out of the layout, so nothing moves when
 * it appears or goes. It shows the solved problem at once and stops for good,
 * as an answer to "Your turn" does, and it is gone after the third play, with
 * reduced motion, and wherever nothing replays. When it goes while it has
 * keyboard focus, focus moves to the board rather than the page. With reduced
 * motion nothing plays: the solved problem shows. When motion is allowed again
 * the board is re-keyed, which restarts its CSS animations from the top, or,
 * once the plays are used up, shows the fresh board already solved (followed
 * before paint, so its first frame never flashes).
 */
export function PrepBoardReplay({ children }: Readonly<{ children: ReactNode }>) {
  const [run, setRun] = useState(0);
  const [active, setActive] = useState(false);
  const stage = useRef<HTMLDivElement | null>(null);
  const board = useRef<HTMLDivElement | null>(null);
  const stop = useRef<HTMLButtonElement | null>(null);
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
      onActiveChange: (value) => {
        const figure = board.current?.querySelector("figure");
        if (!value && figure && stop.current && document.activeElement === stop.current) {
          // Focusable only for this hand-over: a lasting tabindex would let any click on the
          // sheet focus the figure, which holds the cycle.
          figure.tabIndex = -1;
          figure.addEventListener("blur", () => figure.removeAttribute("tabindex"), { once: true });
          figure.focus();
        }
        setActive(value);
      },
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

  useLayoutEffect(() => {
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
        if (event.target instanceof Element && event.target.closest("button")) loop.current?.stop();
      }}
    >{children}</div>
    {active && <button ref={stop} type="button" className={styles.boardStop} onClick={() => loop.current?.stop()}>
      <span aria-hidden="true" className={styles.boardStopIcon} />
      Stop animation
    </button>}
  </div>;
}
