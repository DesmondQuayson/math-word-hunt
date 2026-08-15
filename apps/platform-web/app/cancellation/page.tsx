import { SubscriberManagementPage } from "@/components/consumer/subscriber-management-page";
import { Container } from "@/components/layout/container";
import { StructuredCmsContent } from "@/components/cms/structured-cms-content";
import { loadPublishedCmsDocument } from "@/lib/cms/public";

export const metadata = { title: "Cancel subscription" };
export const dynamic = "force-dynamic";

export default async function CancellationPage() {
  const managed=await loadPublishedCmsDocument("cancellation");
  return <>{managed?<Container className="page-stack"><StructuredCmsContent document={managed}/></Container>:null}<SubscriberManagementPage /></>;
}
