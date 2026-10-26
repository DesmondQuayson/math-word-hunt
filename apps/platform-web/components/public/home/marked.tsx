import type { ReactNode } from "react";

import styles from "./home.module.css";

/**
 * A marker underline under a few words of a heading: a background stroke, so
 * it follows the words onto a second line instead of forcing them onto one.
 * It draws once when its InView wrapper scrolls into view.
 */
export function Marked({ children }: Readonly<{ children: ReactNode }>) {
  return <span className={styles.marked}>{children}</span>;
}
