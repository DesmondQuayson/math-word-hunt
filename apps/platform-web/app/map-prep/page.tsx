import Link from "next/link";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { loadMapPrepDestination } from "@/lib/resources/catalog";
import { requireProductAccess } from "@/lib/access/server";
import { redirect } from "next/navigation";
export const metadata={title:"MAP Prep"}; export const dynamic="force-dynamic";
export default async function MapPrepPage(){await requireProductAccess("/map-prep");const destination=await loadMapPrepDestination();if(destination)redirect("/map-prep/launch");return <Container className="page-stack" width="compact"><PageHeader eyebrow="Separate learning application" title="MAP Prep" description="MAP Prep opens the owner-configured external mathematics practice application."/><div className="public-resource-empty"><strong>MAP Prep is not configured</strong><p>Your subscription is active, but no enabled, verified destination has been published. Return later or contact support.</p></div><p><Link href="/">Return home</Link></p></Container>;}
