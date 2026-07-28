import Link from "next/link";
import type { ReactNode } from "react";

import { Container } from "@/components/layout/container";

const pilotNavigation = [
  { href: "/pilot", label: "Start" },
  { href: "/pilot/privacy", label: "Privacy" },
  { href: "/pilot/support", label: "Support" },
  { href: "/pilot/feedback", label: "Feedback" },
  { href: "/pilot/exit", label: "Exit" }
] as const;

export function PilotShell({ children, currentPath }: Readonly<{ children: ReactNode; currentPath: string }>) {
  return (
    <Container className="page-stack pilot-shell">
      <nav className="pilot-navigation" aria-label="Pilot readiness">
        <p>Restricted pilot field guide</p>
        <ul>
          {pilotNavigation.map((item) => (
            <li key={item.href}>
              <Link href={item.href} aria-current={currentPath === item.href ? "page" : undefined}>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {children}
    </Container>
  );
}
