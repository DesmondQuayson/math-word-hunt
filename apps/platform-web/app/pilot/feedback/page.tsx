import { Notice } from "@/components/feedback/notice";
import { PilotFeedbackForm } from "@/components/pilot/pilot-feedback-form";
import { PilotShell } from "@/components/pilot/pilot-shell";

export const metadata = { title: "Pilot feedback" };

export default function PilotFeedbackPage() {
  return <PilotShell currentPath="/pilot/feedback">
    <header className="page-header"><p className="eyebrow">Pilot field guide · feedback</p><h1>Prepare feedback without sending or saving it.</h1><p className="lede">Build a structured plain-text summary locally, review it, then share it only through the future owner-approved pilot channel.</p></header>
    <Notice label="Feedback privacy" tone="warning"><strong>Keep people and secrets out.</strong><p>No student data, email addresses, passwords, tokens, cookies, payment details, screenshots, files, or raw authentication content. Automated checks catch only obvious patterns.</p></Notice>
    <PilotFeedbackForm />
  </PilotShell>;
}
