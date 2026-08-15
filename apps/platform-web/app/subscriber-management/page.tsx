import { SubscriberManagementPage } from "@/components/consumer/subscriber-management-page";

export const metadata = { title: "Subscriber management", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function StableSubscriberManagementPage() {
  return <SubscriberManagementPage rollbackSafe />;
}
