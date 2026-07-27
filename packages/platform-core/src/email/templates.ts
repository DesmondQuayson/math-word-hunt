export type EmailTemplateKey = "billing-support" | "payment-failure" | "cancellation" | "deletion-requested" | "deletion-completed" | "account-restricted";
export type EmailTemplate = Readonly<{ subject: string; text: string; html: string }>;
function escape(value: string) { return value.replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[c] ?? c); }
export function renderEmailTemplate(key: EmailTemplateKey, input: Readonly<{ teacherName: string; applicationOrigin: string }>): EmailTemplate | null {
  const name = input.teacherName.trim();
  let origin: URL;
  try { origin = new URL(input.applicationOrigin); } catch { return null; }
  if (!name || name.length > 80 || !/^https?:$/.test(origin.protocol) || origin.origin !== input.applicationOrigin || /[\r\n]/.test(name)) return null;
  const copy: Record<EmailTemplateKey, [string,string]> = {
    "billing-support":["Billing support update","Your billing question has been received."], "payment-failure":["Payment needs attention","Your test payment could not be confirmed. Access is determined by verified provider records."], cancellation:["Cancellation update","Your cancellation status was updated."], "deletion-requested":["Deletion request received","Your deletion request was received. No permanent deletion has occurred."], "deletion-completed":["Deletion completed","Your approved account deletion has completed."], "account-restricted":["Account access restricted","Your account access is restricted. Contact support for assistance."]
  };
  const [subject, message] = copy[key]; const safeName=escape(name); const safeMessage=escape(message); const safeOrigin=escape(origin.origin);
  return Object.freeze({ subject, text:`Hello ${name},\n\n${message}\n\nVisit ${origin.origin}/account`, html:`<p>Hello ${safeName},</p><p>${safeMessage}</p><p><a href="${safeOrigin}/account">Visit your account</a></p>` });
}

