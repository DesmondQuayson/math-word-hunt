import { randomUUID } from "node:crypto";

import type { AdminAccountView, AdminAccountsSnapshot } from "@/lib/admin/account-operations";
import { STEP_UP_ACCOUNT_OPERATIONS } from "@/lib/admin/session-policy";
import { AdminGuardedForm } from "./admin-guarded-form";
import { AdminOperationDialog } from "./admin-operation-dialog";

const date = (value:string|null) => value ? new Intl.DateTimeFormat("en-US",{dateStyle:"medium",timeStyle:"short"}).format(new Date(value)) : "not available";
const key=(account:AdminAccountView,operation:string)=>`phase8g:${account.id}:${operation}:${randomUUID()}`;
const dialog=(account:AdminAccountView,csrfToken:string,stepUpRequired:boolean,operation:string,label:string,description:string,reasonRequired=false,danger=false,extra:Readonly<{durationDays?:boolean;refundRequestId?:string}>={})=><AdminOperationDialog key={`${operation}-${extra.refundRequestId??""}`} csrfToken={csrfToken} targetUserId={account.id} operation={operation} idempotencyKey={key(account,operation)} label={label} description={description} reasonRequired={reasonRequired} danger={danger} stepUpRequired={stepUpRequired&&STEP_UP_ACCOUNT_OPERATIONS.has(operation)} {...extra}/>;

/** Plain-language outcomes for the step-up and duplicate-suppression results. */
const RESULT_MESSAGES:Readonly<Record<string,string>>={
  "step-up-required":"Enter a current authenticator code to confirm this action. Nothing was changed.",
  "step-up-failed":"The authenticator code was not accepted. Nothing was changed.",
  "step-up-rate-limited":"Too many verification attempts. Wait before trying again. Nothing was changed.",
  "step-up-unavailable":"Verification is unavailable right now. Nothing was changed.",
  "already-completed":"This request was already completed, so it was not run again.",
  "already-in-progress":"This request is already being processed, so it was not run again.",
  "already-failed":"This request already finished with a failure. Reload the page to try it again as a new request.",
  "already-in-review":"This request is already waiting for manual review, so it was not run again."
};
const dangerResult=(result:string)=>["failed","denied","invalid","required","unavailable","rate-limited"].some((marker)=>result.includes(marker))&&!result.startsWith("already-");

export function AdminAccountsLibrary({snapshot,csrfToken,result,mode,stepUpRequired=false}:Readonly<{snapshot:AdminAccountsSnapshot;csrfToken:string;result?:string;mode:"users"|"subscriptions";stepUpRequired?:boolean}>){return <div className="admin-resource-library admin-accounts-library">
  <header><p className="admin-eyebrow">Owner-only · minimized identity view</p><h1>{mode==="users"?"Accounts and access":"Subscriptions and refund reviews"}</h1><p>Safe operational summaries exclude passwords, hashes, MFA data, session tokens, full IP histories, card data, and provider secrets. Every mutation is bounded, idempotent, session-bound, and audited. Sensitive operations ask for a current authenticator code when your last verification is more than a few minutes old.</p></header>
  {result?<div className={`admin-state-banner ${dangerResult(result)?"admin-state-danger":""}`} role="status"><strong>{RESULT_MESSAGES[result]??`${result.replaceAll("-"," ")}.`}</strong> Server-owned account and provider state remains authoritative.</div>:null}
  {snapshot.state==="unavailable"?<div className="admin-state-banner admin-state-danger" role="alert"><strong>Account operations unavailable.</strong> No customer data or mutation controls are displayed.</div>:null}
  {snapshot.state==="ready"?<><div className="admin-state-banner"><strong>{snapshot.accounts.length} consumer accounts loaded.</strong>{snapshot.truncated?" The view is bounded to the first 100 Auth identities; use an exact account ID in a future approved search workflow.":" No fabricated account records are shown."}</div>
  {snapshot.accounts.length?<div className="admin-account-list">{snapshot.accounts.map(account=><article className="admin-account-card" key={account.id}>
    <header><div><p className="admin-eyebrow">{account.status.replaceAll("_"," ")}</p><h2>{account.email}</h2><code>{account.id}</code></div><span data-tone={account.status==="active"?"good":"warning"}>{account.confirmed?"confirmed":"unconfirmed"}</span></header>
    <dl className="admin-account-facts"><div><dt>Created</dt><dd>{date(account.createdAt)}</dd></div><div><dt>Last authenticated</dt><dd>{date(account.lastAuthenticatedAt)}</dd></div><div><dt>Trial</dt><dd>{account.trial}</dd></div><div><dt>Subscription</dt><dd>{account.subscription}</dd></div><div><dt>Current entitlement</dt><dd>{account.entitlement}{account.complimentaryExpiresAt?` through ${date(account.complimentaryExpiresAt)}`:""}</dd></div><div><dt>Paid through</dt><dd>{account.billing?date(account.billing.periodEnd):"not applicable"}</dd></div><div><dt>Last Stripe sync</dt><dd>{account.billing?`${date(account.billing.lastSynchronizedAt)} · ${account.billing.source??"webhook"}`:"not applicable"}</dd></div><div className="admin-account-wide"><dt>Billing consistency</dt><dd>{account.billing?.mismatch?<span data-tone="warning" data-testid="billing-mismatch">Mismatch: {account.billing.mismatch}</span>:account.billing?"consistent":"no subscription"}</dd></div><div><dt>Deletion</dt><dd>{account.deletion}</dd></div><div className="admin-account-wide"><dt>Consent versions</dt><dd>{account.consentVersions}</dd></div></dl>
    <section aria-label={`Safe operations for ${account.email}`}><h3>Safe operations</h3><div className="admin-operation-grid">
      {!account.confirmed?dialog(account,csrfToken,stepUpRequired,"resend-confirmation","Resend confirmation","Send a new confirmation message through the configured Auth email provider."):null}
      {dialog(account,csrfToken,stepUpRequired,"revoke-sessions","Revoke active sessions","Invalidate this account's active Auth sessions. A fresh owner session and reason are required.",true,true)}
      {account.status==="active"?dialog(account,csrfToken,stepUpRequired,"suspend","Suspend account","Deny protected account and game access and revoke active Auth sessions without changing billing authority.",true,true):account.status==="suspended"?dialog(account,csrfToken,stepUpRequired,"restore","Restore account","Restore application access only. Deletion-pending accounts cannot be restored here.",true):null}
      {account.complimentaryExpiresAt?dialog(account,csrfToken,stepUpRequired,"remove-complimentary","Remove complimentary access","End the active owner grant without changing Stripe subscription records.",true,true):dialog(account,csrfToken,stepUpRequired,"grant-complimentary","Grant complimentary access","Create one time-limited access grant, independently of authoritative billing.",true,false,{durationDays:true})}
      {account.billing?dialog(account,csrfToken,stepUpRequired,"sync-billing","Sync with Stripe","Re-read this account's subscriptions from Stripe and re-apply the canonical entitlement projection. Repairs stale local state; never charges, cancels, or refunds."):null}
      {dialog(account,csrfToken,stepUpRequired,"open-portal","Open Customer Portal","Open a short-lived, provider-validated Stripe Customer Portal session. The URL is never stored.")}
      {dialog(account,csrfToken,stepUpRequired,"cancel-at-period-end","Open cancellation portal","Open the validated portal where cancellation is constrained to the end of the paid period.")}
      {dialog(account,csrfToken,stepUpRequired,"submit-refund-review","Submit refund review","Create or reuse a review request only when a verified first charge is inside the configured review window.")}
      {account.refunds.filter(refund=>["requested","reviewing"].includes(refund.status)).map(refund=>dialog(account,csrfToken,stepUpRequired,"deny-refund-review","Deny refund review",`Record a reviewed denial for request ${refund.id}. No Stripe amount is changed.`,true,true,{refundRequestId:refund.id}))}
      {dialog(account,csrfToken,stepUpRequired,"emergency-revoke","Emergency revoke access","Immediately suspend application access, revoke Auth sessions, end complimentary access, and deny the derived game entitlement. Billing evidence remains intact.",true,true)}
    </div></section>
    <section className="admin-readonly-workflows" aria-labelledby={`readonly-${account.id}`}><h3 id={`readonly-${account.id}`}>Read-only safeguards</h3><p><strong>Refund approval:</strong> unavailable until an exact eligible Stripe payment can be provider-verified and refunded idempotently. <strong>Permanent deletion:</strong> unavailable until cancellation, retention, legal hold, and identity deletion checkpoints are satisfied.</p></section>
    <details><summary>Support notes and audit history</summary><AdminGuardedForm action="/admin/users/note" className="admin-support-note-form" submitLabel="Add audited note" submitClassName="admin-secondary-action"><input type="hidden" name="csrfToken" value={csrfToken}/><input type="hidden" name="targetUserId" value={account.id}/><label><span>Add immutable support note</span><textarea name="note" minLength={3} maxLength={1000} required/><small>Never include secrets, payment data, or student information.</small></label></AdminGuardedForm>
      <div className="admin-account-evidence"><div><h4>Support notes</h4>{account.notes.length?<ol>{account.notes.map(note=><li key={note.id}><span>{date(note.createdAt)}</span><p>{note.note}</p></li>)}</ol>:<p>None recorded.</p>}</div><div><h4>Relevant audit</h4>{account.audit.length?<ol>{account.audit.map((event,index)=><li key={`${event.createdAt}-${index}`}><span>{date(event.createdAt)}</span><p>{event.action.replaceAll("."," ")}</p></li>)}</ol>:<p>None recorded.</p>}</div></div>
    </details>
  </article>)}</div>:<div className="admin-library-empty"><strong>No consumer accounts</strong><p>Auth-only admin identities are intentionally excluded from the consumer operations view.</p></div>}</>:null}
</div>}
