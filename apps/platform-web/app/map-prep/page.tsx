import Link from "next/link";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { recordAggregateSignal } from "@/lib/operations/server";
import { loadMapPrepDestination } from "@/lib/resources/catalog";
import { requireProductAccess } from "@/lib/access/server";
import { MISSOURI_ALIGNMENT_NOTE, platformProductLabel } from "@/lib/seo/platform-positioning";
// The route path, the "map-prep" product identifier and the entitlement key
// are unchanged; only the customer-facing name is. Missouri MAP alignment is
// stated as a supported use case inside Online Math Prep, not as its identity.
const productLabel = platformProductLabel("/map-prep");
export const metadata={title:productLabel}; export const dynamic="force-dynamic";
/**
 * Speed V2. One server execution per click: the entitlement decision (never
 * cached, still server-side) and the one-minute-cached destination lookup run
 * in parallel, and an entitled visitor is redirected straight to the approved
 * destination. The former hop through /map-prep/launch is gone for clicks: a
 * client-side navigation cannot follow that Route Handler's cross-origin 303,
 * so the RSC fetch failed and the browser re-requested the launch route as a
 * full navigation — three server executions and a duplicated launch counter.
 * /map-prep/launch still serves direct hits. The launch counter is written
 * after the redirect has been sent, so analytics never delays the journey.
 */
export default async function MapPrepPage(){const [, destination]=await Promise.all([requireProductAccess("/map-prep"),loadMapPrepDestination()]);if(destination){after(()=>recordAggregateSignal({metricKey:"map-prep-launch",outcome:"success",source:"runtime"}));redirect(destination.destinationUrl);}return <Container className="page-stack" width="compact"><PageHeader eyebrow="Grades 3–8 · Separate learning application" title={productLabel} description={`${productLabel} opens MathNexa's Grades 3–8 mathematics practice application: Learn, Practice, Review, and a worksheet generator. ${MISSOURI_ALIGNMENT_NOTE}`}/><div className="public-resource-empty"><strong>{productLabel} is not configured</strong><p>Your subscription is active, but no enabled, verified destination has been published. Return later or contact support.</p></div><p><Link href="/">Return home</Link></p></Container>;}
