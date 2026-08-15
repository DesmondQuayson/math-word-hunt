import { Container } from "@/components/layout/container";
import { PublicResourceLibrary } from "@/components/resources/public-resource-library";
import { loadPublicResourceLibrary } from "@/lib/resources/catalog";
import { requireProductAccess } from "@/lib/access/server";
export const metadata={title:"Homework"}; export const dynamic="force-dynamic";
export default async function HomeworkPage(){await requireProductAccess("/homework");return <Container className="page-stack" width="wide"><PublicResourceLibrary kind="homework" library={await loadPublicResourceLibrary("homework")}/></Container>;}
