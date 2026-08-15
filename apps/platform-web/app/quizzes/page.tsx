import { Container } from "@/components/layout/container";
import { PublicResourceLibrary } from "@/components/resources/public-resource-library";
import { loadPublicResourceLibrary } from "@/lib/resources/catalog";
import { requireProductAccess } from "@/lib/access/server";
export const metadata={title:"Quizzes"}; export const dynamic="force-dynamic";
export default async function QuizzesPage(){await requireProductAccess("/quizzes");return <Container className="page-stack" width="wide"><PublicResourceLibrary kind="quizzes" library={await loadPublicResourceLibrary("quizzes")}/></Container>;}
