import Link from "next/link";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { loadMapPrepDestination } from "@/lib/resources/catalog";
import { requireProductAccess } from "@/lib/access/server";
import { MISSOURI_ALIGNMENT_NOTE, platformProductLabel } from "@/lib/seo/platform-positioning";
import { redirect } from "next/navigation";
// The route path, the "map-prep" product identifier and the entitlement key
// are unchanged; only the customer-facing name is. Missouri MAP alignment is
// stated as a supported use case inside Online Math Prep, not as its identity.
const productLabel = platformProductLabel("/map-prep");
export const metadata={title:productLabel}; export const dynamic="force-dynamic";
export default async function MapPrepPage(){await requireProductAccess("/map-prep");const destination=await loadMapPrepDestination();if(destination)redirect("/map-prep/launch");return <Container className="page-stack" width="compact"><PageHeader eyebrow="Grades 3–8 · Separate learning application" title={productLabel} description={`${productLabel} opens MathNexa's Grades 3–8 mathematics practice application: Learn, Practice, Review, and a worksheet generator. ${MISSOURI_ALIGNMENT_NOTE}`}/><div className="public-resource-empty"><strong>{productLabel} is not configured</strong><p>Your subscription is active, but no enabled, verified destination has been published. Return later or contact support.</p></div><p><Link href="/">Return home</Link></p></Container>;}
