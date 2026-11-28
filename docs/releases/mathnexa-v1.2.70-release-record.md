# MathNexa v1.2.70 — confirmation guidance and trial Home exit

Released 2026-11-27 (America/Chicago) under explicit owner approval in this chat. Production website changes only; hosted Supabase Auth and Resend settings, DNS and billing were not changed.

## Source and scope

The first staging review commit `6ca6ccb` had an unrelated, unreleased SEO change relative to production. The final release was rebuilt from production's `origin/main` (`4d8ad62`) by applying only that fix commit. Its certified source is `3f985b79f97c204b4aba1648d213054174fa5532` (tree `2a64112d19395a50862d97f32caff7ca50337245`). Diff against the previously live runtime `70288f8` contains only the intended auth, trial and local template files; no homework-page SEO change.

Website behavior: signup and resend explain Spam/Junk and “Not spam”; a failed code exchange does not assert confirmation; signup email-send failures create only anonymous aggregate signals. The trial footer says exactly “Not ready yet? Go to Home and enjoy free games,” with the linked phrase going to `/`, a comfortable target and keyboard focus. The existing resend budget, cooldown, email verification, token expiry, redirect checks, checkout, subscriptions, access codes and entitlements remain intact.

The branded confirmation HTML and subject are committed for local configuration and later hosted staging application. **They are not active in hosted Supabase**; provider access and email-template verification remain open in [the delivery review](../auth-confirmation-delivery-review.md).

## Release evidence

- Production rollback retained: `dpl_B2GNxn1dqUyXEKs4KrhjMLDSzCQL` (previous v1.2.69 deployment). It was Ready and serving the apex at preflight.
- Corrected staging candidate: `dpl_2cg5Sx6SJQFKVvzdugR37FvwWcNA`, Ready, nine smoke checks passed including account sign-in and Home on the reviewed build.
- Locked dependency install, typecheck, build, app lint (eight existing warnings), 40 focused auth/Home tests, 325 security tests, two template tests passed. Earlier same-code local browser checks passed registration, confirmation, resend, used-link behavior, mobile and desktop Home, checkout fixture and paid-content protection.
- Production-environment candidate: `dpl_JAfePUe4JCBBKrywkrPerT2xhJNi`, built from `3f985b7` with `--prod --skip-domain`. Seven candidate probe groups passed before promotion: health, webhook, canonical-host redirects, scheduler denial, server errors, image optimizer and remote-image refusal.
- Promoted `dpl_JAfePUe4JCBBKrywkrPerT2xhJNi` to `mathnexa.com`; previous deployment retained. Live pipeline: 22/22 probe groups passed (apex identity, webhooks, sign-in/up and public routes, protected routes, forged access, headers, images, no server errors). Read-only Chromium at iPhone 13 and 1440px desktop: Home and free games visible, sign-in/signup 200, access-code page 200, paid runtime 401, subscription redirects for signed-out users, no horizontal overflow or page exceptions.

The live browser checks were anonymous. Signed-in Home and fixture checkout were exercised on staging/local. No production customer account or subscription was changed for release testing. Inbox placement, bounces/complaints and hosted confirmation template are not established by these website checks.

## Rollback

Run `vercel promote dpl_B2GNxn1dqUyXEKs4KrhjMLDSzCQL --scope bright-path-ed-tech --yes` as its own command, then verify `/api/health`, sign-in, Home, webhooks and protected routes. This restores the website only. There is no database migration or DNS change to reverse; hosted email settings were not changed.
