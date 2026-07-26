import Link from "next/link";

import { Container } from "@/components/layout/container";
import { NavigationItem } from "@/components/layout/navigation-item";

const navigation = [
  { href: "/play", label: "Play" },
  { href: "/teacher", label: "Teacher" },
  { href: "/account", label: "Account" }
] as const;

export function SiteHeader() {
  return (
    <header className="site-header">
      <Container className="header-inner">
        <Link className="brand" href="/" aria-label="Math Vocabulary Hunt home">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" focusable="false">
              <path
                d="M6 8.5h20M6 16h20M6 23.5h20M8.5 6v20M16 6v20M23.5 6v20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                opacity=".34"
              />
              <path
                d="M8.5 23.5 16 16l7.5-7.5"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="3"
              />
              <circle cx="23.5" cy="8.5" r="2.4" fill="currentColor" />
            </svg>
          </span>
          <span className="brand-name">
            Math Vocabulary <strong>Hunt</strong>
          </span>
        </Link>
        <nav aria-label="Primary navigation">
          <ul className="nav-list">
            {navigation.map((item) => (
              <li key={item.href}>
                <NavigationItem href={item.href} label={item.label} />
              </li>
            ))}
          </ul>
        </nav>
      </Container>
    </header>
  );
}
