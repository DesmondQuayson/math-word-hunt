import Link from "next/link";

import { signOutAction } from "@/app/auth-actions";
import { exitSchoolAccessAction } from "@/app/school-access-actions";
import { Container } from "@/components/layout/container";
import { PrimaryNav } from "@/components/layout/primary-nav";
import { isProductionPublicMode } from "@/lib/environment/production-public";
import { isProductionPlatformMode } from "@/lib/environment/production-platform";
import { getGameAccessView } from "@/lib/game-access/server";

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
  const access = productionPlatform ? await getGameAccessView() : null;
  const schoolAccess = access?.source === "school-access";
  const signedIn = schoolAccess || (access !== null && access.context.status !== "anonymous" && access.context.status !== "unconfigured");
  return (
    <header className="site-header">
      <Container className="header-inner">
        <Link className="brand" href="/" aria-label={mathNexa ? "MathNexa home" : "Math Vocabulary Hunt home"}>
          {mathNexa ? (
            // The approved MathNexa mark, generated from the same artwork as the
            // app icons by scripts/generate-brand-mark.mjs. A static first-party
            // PNG at 3x its 48 px display size, with intrinsic width and height
            // so the header reserves the space before the image arrives and the
            // navigation never shifts. Decorative on purpose: the link already
            // carries the accessible name, so alt text here would make a screen
            // reader announce the brand twice.
            <span className="brand-mark brand-mark-photo" aria-hidden="true">
              {/* eslint-disable-next-line @next/next/no-img-element -- a fixed
                  48 px mark is already delivered at its final size (12 KB), so
                  next/image would add a runtime optimisation round trip and buy
                  nothing. Deliberately a plain first-party asset. */}
              <img src="/brand/mathnexa-mark.png" alt="" width={144} height={144} decoding="async" />
            </span>
          ) : (
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
          )}
          <span className="brand-name">{mathNexa ? <>Math<strong>Nexa</strong></> : <>Math Vocabulary <strong>Hunt</strong></>}</span>
        </Link>
        <nav aria-label="Primary navigation">
          <PrimaryNav items={items}>
            {signedIn ? <li className="nav-account-action">
              <form action={schoolAccess ? exitSchoolAccessAction : signOutAction}>
                <button type="submit">{schoolAccess ? "Exit authorized access" : "Sign out"}</button>
              </form>
            </li> : null}
          </PrimaryNav>
        </nav>
      </Container>
    </header>
  );
}
