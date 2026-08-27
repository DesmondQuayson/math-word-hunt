"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { NavigationItem } from "@/components/layout/navigation-item";

type PrimaryNavProps = Readonly<{
  items: readonly Readonly<{ href: string; label: string }>[];
  children?: ReactNode;
}>;

/**
 * The header nav list with a real active state: the existing
 * a[aria-current="page"] styling never fired because no caller computed
 * `current`. Client-side pathname is the one reliable source for it.
 */
export function PrimaryNav({ items, children }: PrimaryNavProps) {
  const pathname = usePathname() ?? "/";
  return (
    <ul className="nav-list">
      {items.map((item) => (
        <li key={item.href}>
          <NavigationItem
            href={item.href}
            label={item.label}
            current={item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`)}
          />
        </li>
      ))}
      {children}
    </ul>
  );
}
