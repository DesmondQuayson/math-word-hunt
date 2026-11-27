# Confirmation delivery and trial Home action — 2026-11-27

## Scope and evidence

Supabase Auth owns signup, verification, PKCE links and sessions. Application billing notifications use Resend. The hosted staging provisioning script configures Resend SMTP (`smtp.resend.com:587`, user `resend`), sender `MathNexa <no-reply@auth.mathnexa.com>`, subject `Confirm your MathNexa account`, a 60-second send interval and 30 emails/hour. These are recorded settings, **not a verified read of current production settings**.

Current production SMTP configuration could not be read: the saved Supabase management token and Resend runtime credential each returned HTTP 401. The connected Supabase plugin can query Auth logs and aggregate account state, but cannot read SMTP configuration. No customer records, private analytics exports, credentials or confirmation tokens are stored in this repository. Auth send timestamps alone cannot establish delivery, inbox placement, or a common cause for incomplete registration. Available Auth logs do not provide the missing bounce, complaint or suppression evidence.

Public DNS inspection found one SPF TXT record on `send.auth.mathnexa.com`: `v=spf1 include:amazonses.com ~all`; the Resend DKIM public key exists at `resend._domainkey.auth.mathnexa.com`; `_dmarc.auth.mathnexa.com` is `v=DMARC1; p=none`. Apex TXT contains Google site verification; no apex SPF or DMARC was observed. Nameservers are Vercel. No DNS was changed. The absence of apex SPF does not establish a fault: SPF authenticates the envelope sender. Actual SPF/DKIM/DMARC alignment requires received message headers.

## Changes

- Exact bold trial footer: “Not ready yet? Go to Home and enjoy free games”. The linked phrase uses `/`, visible underline, a comfortable touch target and keyboard focus styling.
- Signup and resend guidance explains Spam/Junk and marking mail “Not spam”; users should use the newest link.
- An unsuccessful code exchange no longer asserts that the email was confirmed. Expired/used/cross-browser failures direct users to sign in and request another confirmation if necessary.
- Signup email failures now emit only a coarse aggregate signal. Sending limits are distinguished from delivery errors and unrelated registration failures.

Existing verification requirements, token expiry, redirect allowlist, server resend budget, 60-second cooldown, commercial consent, Stripe code and entitlement restrictions remain in place. Home itself has no automatic trial redirect. No existing account was confirmed, resent, deleted, or subscribed by this work.

## Remaining provider steps

1. In the **production** Supabase project, Authentication → Email → SMTP Settings, inspect the current settings before editing. Confirm custom SMTP is enabled, with the existing verified MathNexa sender. If it is using the default sender, configure the already-used Resend account: host `smtp.resend.com`, user `resend`, its sending key entered privately, and the port shown in Resend SMTP settings (the existing integration uses STARTTLS port 587). Preserve working settings rather than rotating credentials unnecessarily. Keep Confirm email enabled and preserve expiry and refresh-token protections.
2. In Resend → Domains, verify `auth.mathnexa.com` is Verified, including DKIM and its return-path SPF/MX. Preserve existing records and mail services. Do not add a second SPF record. Keep DMARC `p=none` until all legitimate senders and received authentication results have been assessed; do not tighten enforcement as part of this fix.
3. In Resend → Emails, inspect the affected signup times privately for accepted, delivered, delayed, bounced, complained and suppressed events; inspect account quotas and sending restrictions. Compare against Supabase Auth logs. SMTP acceptance and a “delivered” event do not guarantee inbox placement. Do not mass resend or remove suppressions without investigating their cause.
4. Inspect one controlled received email's headers: From, Reply-To, Return-Path, DKIM `d=` and selector, Authentication-Results SPF/DKIM/DMARC, and the link host. With `From: …@auth.mathnexa.com`, DKIM should align with that domain; `send.auth.mathnexa.com` aligns under relaxed SPF. Do not paste private headers or token-bearing URLs into public issues. Confirm Reply-To is a monitored support mailbox; Supabase SMTP settings may not expose custom Reply-To, so record the actual header and use a support link in the template rather than inventing a setting or replacing the auth transport.
5. Inspect Authentication → URL Configuration: production Site URL should be `https://mathnexa.com`; preserve the established callback allowlist and secure destinations. Confirmation links may legitimately start at the project's Supabase host and return to MathNexa. Do not rewrite tokens or introduce an unverified custom auth domain.
6. Review Authentication → Email Templates → Confirm signup. Apply the reviewed template in staging first, preserving `{{ .ConfirmationURL }}` and the provider's verification flow. Subject: `Confirm your MathNexa email address`. Inspect the delivered HTML **and** plain-text MIME parts. Disable click tracking for authentication messages if enabled, and test scanner/cross-browser handling before broader changes.
7. Send a single controlled staging signup to an owned test mailbox, verify the actual email and secure confirmation, then test resend cooldown, expired/used links and sign-in. Check another mailbox provider if available. Never use an existing customer's account for this test. Production release follows the repository's staged candidate/probe/promotion process after preview review.

Provider references: [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [Supabase templates](https://supabase.com/docs/guides/auth/auth-email-templates), [Resend Supabase integration](https://resend.com/docs/send-with-supabase-smtp), [Resend domains](https://resend.com/docs/dashboard/domains/introduction).

## Rollback

Before production promotion, record the currently serving Vercel deployment. Roll back by promoting that recorded deployment, then probe sign-in, Home and protected routes. There is no database migration or DNS rollback for these code changes. Restore the prior confirmation template separately if a hosted template is subsequently changed; retain verification, expiry, sender authentication and rate limits. Do not assume the older deployment ID in a historical release record is still current.
