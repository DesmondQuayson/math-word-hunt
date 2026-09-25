"use client";

import { usePathname } from "next/navigation";

import { AUTHORIZED_ACCESS_ANCHOR } from "@/lib/navigation/banner";

/**
 * The banner's permanent "Authorize Code" entry, shown in every account
 * state. The homepage always renders the authorized-code form; this link
 * brings it into view and focuses the code field there, and leads to it from
 * any other page. The sign-in page carries its own copy of the form, so the
 * banner link is omitted there and nowhere else. The code itself is only ever
 * typed into that form: this link carries no code, no query and no state.
 */
export function AuthorizedCodeLink() {
  const pathname = usePathname() ?? "/";
  if (pathname === "/sign-in") return null;
  const onHome = pathname === "/";
  return <a
    className="banner-code-link"
    href={`/#${AUTHORIZED_ACCESS_ANCHOR}`}
    onClick={onHome ? (event) => {
      const panel = document.getElementById(AUTHORIZED_ACCESS_ANCHOR);
      if (!panel) return;
      event.preventDefault();
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      panel.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
      panel.querySelector<HTMLInputElement>("input:not([type=hidden])")?.focus({ preventScroll: true });
    } : undefined}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="8" cy="12" r="4" />
      <path d="M12 12h9M18 12v3M15 12v2" />
    </svg>
    <span>Authorize Code</span>
  </a>;
}
