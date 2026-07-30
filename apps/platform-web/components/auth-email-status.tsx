import { Notice } from "@/components/feedback/notice";
import { getAuthEmailExperience } from "@/lib/email/server";

export function AuthEmailStatus({ label = "Auth email status" }: Readonly<{ label?: string }>) {
  const email = getAuthEmailExperience();
  return <div data-auth-email-state={email.state}>
    <Notice label={label} tone={email.tone} live>
      <strong>{email.title}</strong>
      <p>{email.description}</p>
    </Notice>
  </div>;
}
