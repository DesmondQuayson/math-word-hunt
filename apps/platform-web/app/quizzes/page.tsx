import { Container } from "@/components/layout/container";
import { PublicResourceLibrary } from "@/components/resources/public-resource-library";
import { loadPublicResourceLibrary } from "@/lib/resources/catalog";
import { requireProductAccess } from "@/lib/access/server";
export const metadata={title:"Quiz PDFs"}; export const dynamic="force-dynamic";
// Speed V2: the entitlement decision and the public library read are independent and run in parallel; the access redirect still wins.
export default async function QuizzesPage(){const [, library]=await Promise.all([requireProductAccess("/quizzes"),loadPublicResourceLibrary("quizzes")]);return <Container className="page-stack" width="wide"><PublicResourceLibrary kind="quizzes" library={library}/></Container>;}
