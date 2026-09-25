"use client";

import { usePathname } from "next/navigation";

import { NavigationItem } from "@/components/layout/navigation-item";
import { isCurrentBannerPath, PRODUCT_NAVIGATION } from "@/lib/navigation/banner";

/**
 * The permanent product navigation: the six approved destinations, rendered
 * on the server, with the current one marked on the client. Nothing scrolls:
 * phones show a two-row, three-column grid, tablets one row of six, and
 * desktops the single row; labels wrap onto a second line where a cell is
 * narrow rather than being cut off or swiped to.
 */
export function ProductNav() {
  const pathname = usePathname() ?? "/";
  return <ul className="product-nav-list">
    {PRODUCT_NAVIGATION.map((item) => <li key={item.href}>
      <NavigationItem href={item.href} label={item.label} current={isCurrentBannerPath(item.href, pathname)} />
    </li>)}
  </ul>;
}
