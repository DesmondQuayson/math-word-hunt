import Link from "next/link";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { loadMapPrepDestination } from "@/lib/resources/catalog";
export const metadata={title:"MAP Prep"}; export const dynamic="force-dynamic";
export default async function MapPrepPage(){const destination=await loadMapPrepDestination();return <Container className="page-stack" width="compact"><PageHeader eyebrow="Separate learning application" title="MAP Prep" description="MAP Prep opens the owner-configured external mathematics practice application."/>{destination?<a className="button button-primary" href={destination} rel="noopener noreferrer">Open MAP Prep</a>:<div className="public-resource-empty"><strong>MAP Prep is not configured</strong><p>No external destination has been published. Return later or contact support.</p></div>}<p><Link href="/">Return home</Link></p></Container>;}
