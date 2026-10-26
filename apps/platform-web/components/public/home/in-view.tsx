"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Marks its wrapper `data-in-view` the first time it scrolls into view, so the
 * hand-drawn strokes inside can draw themselves once. Nothing is hidden while
 * waiting: without JavaScript, IntersectionObserver or motion, the strokes are
 * simply not drawn and all content reads the same. One-shot; never replays.
 */
export function InView({ children, className }: Readonly<{ children: ReactNode; className?: string }>) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof window === "undefined" || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        element.dataset.inView = "true";
        observer.disconnect();
      }
    }, { rootMargin: "0px 0px -12% 0px", threshold: 0.2 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return <div ref={ref} className={className}>{children}</div>;
}
