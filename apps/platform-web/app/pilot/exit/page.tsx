import Link from "next/link";

import { Notice } from "@/components/feedback/notice";
import { PilotShell } from "@/components/pilot/pilot-shell";
import { LinkButton } from "@/components/ui/link-button";

export const metadata = { title: "Leave the pilot" };

export default function PilotExitPage() {
  return <PilotShell currentPath="/pilot/exit">
    <header className="page-header"><p className="eyebrow">Pilot field guide · exit</p><h1>Stop participation without ambiguity.</h1><p className="lede">The pilot is inactive now. These instructions define a truthful future exit: log out, stop using the Preview, and use the access-provisioning channel for owner-controlled restriction or staged deletion review.</p></header>
    <ol className="pilot-exit-steps">
      <li><span>1</span><div><h2>Log out</h2><p>End the browser session so protected teacher data is no longer available in that session.</p></div></li>
      <li><span>2</span><div><h2>Stop using the Preview</h2><p>Do not continue testing while an exit, privacy, access, or security request is pending.</p></div></li>
      <li><span>3</span><div><h2>Request account restriction</h2><p>Contact the pilot coordinator using the channel through which access was provided. Do not include student data or account secrets.</p></div></li>
      <li><span>4</span><div><h2>Request staged deletion review if needed</h2><p>The existing request restricts new protected activity. Permanent deletion execution remains separately controlled and disabled.</p></div></li>
    </ol>
    <Notice label="Permanent deletion status" tone="information"><strong>Permanent deletion is not automatic.</strong><p>The owner must approve retention, identity verification, record scope, provider removal, and irreversible execution in a later phase.</p></Notice>
    <div className="button-row"><LinkButton href="/sign-in" variant="secondary">Go to sign in or logout path</LinkButton><Link href="/pilot/support" className="text-link">Review incident guidance</Link></div>
  </PilotShell>;
}
