import Link from "next/link";

import { Notice } from "@/components/feedback/notice";
import { PilotShell } from "@/components/pilot/pilot-shell";

export const metadata = { title: "Pilot privacy and data use" };

export default function PilotPrivacyPage() {
  return <PilotShell currentPath="/pilot/privacy">
    <header className="page-header"><p className="eyebrow">Pilot field guide · privacy</p><h1>Bring teacher planning—not student records.</h1><p className="lede">This concise summary supports a restricted adult-teacher test. The fuller privacy and acceptable-use draft still requires owner and appropriate legal/privacy review.</p></header>
    <Notice label="Draft policy status" tone="information"><strong>This is draft pilot language, not legal advice.</strong><p>No district approval, compliance certification, final retention period, or Production claim is made.</p></Notice>
    <section className="pilot-rule-grid" aria-labelledby="pilot-collected-heading"><div><p className="eyebrow">Limited collection</p><h2 id="pilot-collected-heading">What the current platform may hold</h2></div><ul><li>Authentication email managed by the identity provider</li><li>Teacher display name; organization labels are prohibited</li><li>General, non-identifying planning labels and activity drafts</li><li>Account and staged deletion-request state</li><li>Sanitized, low-cardinality operational events</li></ul></section>
    <section className="pilot-rule-grid pilot-rule-grid-danger" aria-labelledby="pilot-prohibited-heading"><div><p className="eyebrow">Never enter</p><h2 id="pilot-prohibited-heading">What must stay outside</h2></div><ul><li>Student names, emails, IDs, rosters, work, or grades</li><li>School, district, classroom, institution, or organization names</li><li>IEP, disability, behavioral, or sensitive school information</li><li>Passwords, tokens, cookies, one-time links, or provider secrets</li><li>Payment details, screenshots, files, or raw authentication payloads</li></ul></section>
    <section aria-labelledby="pilot-access-heading"><h2 id="pilot-access-heading">Access, retention, and exit</h2><p className="section-description">Verified identity, RLS, ownership, account status, and server authorization control teacher data. Pilot readiness grants nothing. No final retention duration is approved; permanent deletion stays disabled. A participant can log out, stop participation, request immediate restriction, and request staged deletion review.</p><p className="pilot-footnote"><Link href="/pilot/exit">Read the participation exit steps</Link></p></section>
  </PilotShell>;
}
