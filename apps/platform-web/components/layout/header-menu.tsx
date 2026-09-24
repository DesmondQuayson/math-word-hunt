"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";

/**
 * The compact-header menu. From tablet width down the primary navigation folds
 * behind one menu button so the brand and the header call to action stay on a
 * single row; on wide screens the button is hidden by CSS and the navigation
 * is always shown. The navigation markup is rendered on the server either way.
 */
export function HeaderMenu({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname() ?? "/";
  // The menu is open for the route it was opened on; any navigation (a nav
  // link, Back, a redirect) therefore closes it without an effect.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn !== null && openOn === pathname;
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const close = useCallback((returnFocus: boolean) => {
    setOpenOn(null);
    if (returnFocus) buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close(true);
    };
    const onPointer = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) close(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open, close]);

  return <div className="header-menu" ref={rootRef} data-open={open ? "true" : "false"}>
    <button
      ref={buttonRef}
      type="button"
      className="header-menu-toggle"
      aria-expanded={open}
      aria-controls={panelId}
      aria-label={open ? "Close menu" : "Open menu"}
      onClick={() => setOpenOn(open ? null : pathname)}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        {open
          ? <path d="M6 6l12 12M18 6L6 18" />
          : <path d="M4 7h16M4 12h16M4 17h16" />}
      </svg>
    </button>
    <div className="header-menu-panel" id={panelId}>
      {children}
    </div>
  </div>;
}
