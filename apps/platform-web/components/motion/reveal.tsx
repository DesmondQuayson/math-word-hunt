"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

type RevealProps = Readonly<{
  children: ReactNode;
  className?: string;
  /** Stagger offset in ms, applied via --reveal-delay. */
  delay?: number;
}>;

/**
 * One-shot scroll reveal. Progressive enhancement by construction: content is
 * fully visible with no JavaScript — the hiding class is only added by the
 * effect, immediately before observing. Reduced-motion users and browsers
 * without IntersectionObserver never enter the animated path. Once revealed,
 * the section stays revealed; nothing replays on scroll.
 */
export function Reveal({ children, className, delay = 0 }: RevealProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (element.getBoundingClientRect().top < window.innerHeight * 0.6) return;
    element.classList.add("reveal-armed");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            element.classList.add("reveal-in");
            observer.disconnect();
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const style = delay ? ({ "--reveal-delay": `${delay}ms` } as CSSProperties) : undefined;
  return (
    <div ref={ref} className={className ? `reveal ${className}` : "reveal"} style={style}>
      {children}
    </div>
  );
}
