# Signup confirmation template

Subject: **Confirm your MathNexa email address**

`confirmation.html` is configured for local Supabase email capture. It preserves
the provider-generated `{{ .ConfirmationURL }}` and does not alter the callback,
PKCE flow, token expiry, verification requirement, or redirect allowlist. It
contains no tracking, remote images, marketing, or user-metadata interpolation.

Hosted application deployments do not apply this local configuration. After
saving the existing hosted subject and template for rollback, apply this subject
and HTML to **Authentication → Email Templates → Confirm sign up** in the staging
Supabase project, then verify the captured/received email and the existing
confirmation flow before applying it to production. Keep email-provider link
tracking disabled so the confirmation URL is not rewritten. See the
[Supabase email-template guide](https://supabase.com/docs/guides/auth/auth-email-templates)
and [local template configuration](https://supabase.com/docs/guides/local-development/customizing-email-templates).

`confirmation.txt` is a plain-text wording reference, **not an active MIME
template**. The documented Supabase configuration exposes an HTML `content_path`
and subject; the [upstream SMTP mailer](https://github.com/supabase/auth/blob/master/internal/mailer/mailmeclient/mailmeclient.go)
sets `text/html` without adding a `text/plain` alternative. No unsupported
plain-text configuration has been added. Check the delivered message's MIME
parts in staging; a provider-supported multipart integration would be separate
work if a true plain-text part is required.

Local template edits take effect when the local stack reloads its configuration.
Coordinate that restart with any running tests. Do not copy local sender, rate
limit, site URL, or redirect settings into a hosted project.
