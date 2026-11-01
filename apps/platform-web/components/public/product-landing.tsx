import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { JsonLd } from "@/components/seo/json-ld";
import { AUTHORIZED_ACCESS_ANCHOR } from "@/lib/navigation/banner";
import { PRODUCT_PAGE_LINKS, productPageTrail, type BreadcrumbItem, type ProductPagePath } from "@/lib/seo/product-pages";
import { MONTHLY_PRICE_LABEL, TRIAL_HOURS } from "@/lib/seo/public-pages";
import { breadcrumbStructuredData } from "@/lib/seo/structured-data";

/**
 * The shared layout of the public product pages (lib/seo/product-pages.ts):
 * the visible breadcrumb and its BreadcrumbList, one heading, a button into the
 * product's own route (which still checks access), the page's own sections,
 * how to get access, and links to the other product pages.
 *
 * Server component with no client state: the pages are the same for every
 * visitor, and the header already offers the visitor's own next step.
 */

type ProductLandingProps = Readonly<{
  path: ProductPagePath;
  eyebrow: string;
  title: string;
  description: string;
  /** The buttons under the heading. */
  actions: ReactNode;
  /** "subscription": trial, then the monthly price. "free-game": any signed-in account. */
  access: "subscription" | "free-game";
  /** SCHOOL_ACCESS_DURATION_SECONDS / 3600; passed in because that module is server-only. */
  schoolAccessHours: number;
  children: ReactNode;
}>;

function Breadcrumb({ trail }: Readonly<{ trail: readonly BreadcrumbItem[] }>) {
  return <nav className="product-breadcrumb" aria-label="Breadcrumb">
    <ol>
      {trail.map((entry, index) => index === trail.length - 1
        ? <li key={entry.path}><span aria-current="page">{entry.name}</span></li>
        : <li key={entry.path}><Link href={entry.path}>{entry.name}</Link><span className="product-breadcrumb-separator" aria-hidden="true">›</span></li>)}
    </ol>
  </nav>;
}

function AccessSection({ access, schoolAccessHours }: Readonly<{ access: ProductLandingProps["access"]; schoolAccessHours: number }>) {
  return <section aria-labelledby="product-access">
    <h2 id="product-access">How to get access</h2>
    {access === "free-game"
      ? <p>Math Tug of War is free with any MathNexa account. Create an account, confirm your email address and sign in. You do not need a trial or subscription to play it.</p>
      : <ol>
        <li>Create a free MathNexa account and confirm your email address.</li>
        <li>Start the free {TRIAL_HOURS}-hour trial. Each eligible account gets one trial, and you add a payment method on Stripe’s secure checkout page before it starts.</li>
        <li>After the trial, the subscription renews at {MONTHLY_PRICE_LABEL} a month until you cancel. If you cancel before the trial ends, you are not charged.</li>
      </ol>}
    <p>Have a code from your school? Enter it in the <Link href={`/#${AUTHORIZED_ACCESS_ANCHOR}`}>Authorize Code box on the home page</Link>. It opens MathNexa resources in that browser for up to {schoolAccessHours} hours, without an account.</p>
    <p>Questions about accounts and access? See <Link href="/help">Help</Link>.</p>
  </section>;
}

function MoreFromMathNexa({ path }: Readonly<{ path: ProductPagePath }>) {
  return <section className="product-more" aria-labelledby="product-more-title">
    <h2 id="product-more-title">More from MathNexa</h2>
    <ul>
      {PRODUCT_PAGE_LINKS.filter((link) => link.path !== path).map((link) => <li key={link.path}><Link href={link.path}>{link.label}</Link></li>)}
    </ul>
  </section>;
}

/** An existing, approved artwork file, sized for the page column. */
export function ProductFigure({ src, alt, width, height }: Readonly<{ src: string; alt: string; width: number; height: number }>) {
  return <figure className="product-figure">
    <Image src={src} alt={alt} width={width} height={height} sizes="(max-width: 48rem) 92vw, 43rem" loading="eager" />
  </figure>;
}

export function ProductLanding({ path, eyebrow, title, description, actions, access, schoolAccessHours, children }: ProductLandingProps) {
  const trail = productPageTrail(path);
  return <Container className="page-stack product-landing">
    <Breadcrumb trail={trail} />
    <PageHeader eyebrow={eyebrow} title={title} description={description}>
      <div className="button-row">{actions}</div>
    </PageHeader>
    {children}
    <AccessSection access={access} schoolAccessHours={schoolAccessHours} />
    <MoreFromMathNexa path={path} />
    <JsonLd data={breadcrumbStructuredData(trail)} />
  </Container>;
}
