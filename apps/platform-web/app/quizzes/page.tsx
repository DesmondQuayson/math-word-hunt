import { Container } from "@/components/layout/container";
import { PublicResourceLibrary } from "@/components/resources/public-resource-library";
import { loadPublicResourceCatalog } from "@/lib/resources/catalog";
export const metadata={title:"Quizzes"}; export const dynamic="force-dynamic";
export default async function QuizzesPage(){return <Container className="page-stack" width="wide"><PublicResourceLibrary kind="quizzes" resources={await loadPublicResourceCatalog("quizzes")}/></Container>;}
