import Link from "next/link";

import { Container } from "@/components/layout/container";
import { NavigationItem } from "@/components/layout/navigation-item";
import { isProductionPublicMode } from "@/lib/environment/production-public";
import { isProductionPlatformMode } from "@/lib/environment/production-platform";

const navigation = [
  { href: "/play", label: "Play" },
  { href: "/teacher", label: "Teacher" },
  { href: "/pilot", label: "Pilot" },
  { href: "/account", label: "Account" }
] as const;

const publicNavigation = [
  { href: "/play", label: "Play" },
  { href: "/about", label: "About" },
  { href: "/help", label: "Help" },
  { href: "/accessibility", label: "Accessibility" }
] as const;

const consumerNavigation = [
  { href: "/", label: "Home" },
  { href: "/games", label: "Games" },
  { href: "/map-prep", label: "MAP Prep" },
  { href: "/homework", label: "Homework" },
  { href: "/quizzes", label: "Quizzes" },
  { href: "/subscription", label: "Subscription" },
  { href: "/account", label: "My Account" }
] as const;

export async function SiteHeader() {
  const publicProduction = isProductionPublicMode();
  const productionPlatform = isProductionPlatformMode();
  const mathNexa = publicProduction || productionPlatform;
  const items = productionPlatform ? consumerNavigation : publicProduction ? publicNavigation : navigation;
  return (
    <header className="site-header">
      <Container className="header-inner">
        <Link className="brand" href="/" aria-label={mathNexa ? "MathNexa home" : "Math Vocabulary Hunt home"}>
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
          <span className="brand-name">{mathNexa ? <>Math<strong>Nexa</strong></> : <>Math Vocabulary <strong>Hunt</strong></>}</span>
        </Link>
        <nav aria-label="Primary navigation">
          <ul className="nav-list">
            {items.map((item) => (
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
