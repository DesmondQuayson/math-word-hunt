import { SubscriberManagementPage } from "@/components/consumer/subscriber-management-page";

export const metadata = { title: "Cancel subscription" };
export const dynamic = "force-dynamic";

export default function CancellationPage() {
  return <SubscriberManagementPage />;
}
