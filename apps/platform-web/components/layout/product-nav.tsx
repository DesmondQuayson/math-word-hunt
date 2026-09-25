"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { NavigationItem } from "@/components/layout/navigation-item";
import { isCurrentBannerPath, PRODUCT_NAVIGATION } from "@/lib/navigation/banner";

/**
 * The permanent product navigation strip. Rendered on the server with the six
 * approved destinations; the client only marks the current one and, where the
 * strip scrolls horizontally (phones and tablets), keeps that item in view.
 * The scroll adjustment is horizontal only, so it never moves the page.
 */
/** Scroll the strip horizontally (never the page) until `item` is fully visible. */
function reveal(list: HTMLElement, item: HTMLElement) {
  if (list.scrollWidth <= list.clientWidth) return;
  const strip = list.getBoundingClientRect();
  const box = item.getBoundingClientRect();
  const margin = 12;
  if (box.left < strip.left) list.scrollLeft += box.left - strip.left - margin;
  else if (box.right > strip.right) list.scrollLeft += box.right - strip.right + margin;
}

export function ProductNav() {
  const pathname = usePathname() ?? "/";
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const list = listRef.current;
    const current = list?.querySelector<HTMLElement>('a[aria-current="page"]');
    if (list && current) reveal(list, current);
  }, [pathname]);

  return <ul
    className="product-nav-list"
    ref={listRef}
    // Keyboard users: a focused destination is always brought fully into view.
    onFocus={(event) => { if (listRef.current && event.target instanceof HTMLElement) reveal(listRef.current, event.target); }}
  >
    {PRODUCT_NAVIGATION.map((item) => <li key={item.href}>
      {item.external
        ? <a href={item.href}><span>{item.label}</span></a>
        : <NavigationItem href={item.href} label={item.label} current={isCurrentBannerPath(item.href, pathname)} />}
    </li>)}
  </ul>;
}
