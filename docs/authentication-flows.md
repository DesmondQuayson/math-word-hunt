# Authentication flows

- `/sign-up`: teacher-only email/password registration, password confirmation, display name, privacy guidance, and email verification. Phase 6B prohibits and server-rejects organization labels.
- `/sign-in`: generic credential failure wording prevents account enumeration.
- `/forgot-password`: sends the local recovery message and always returns generic receipt wording.
- `/auth/callback`: exchanges an authorization code and allows only `/teacher`, `/account`, or `/update-password` redirects.
- `/update-password`: requires a valid recovery user and confirmed password.
- Sign-out is a server action that clears the Supabase session and redirects to `/sign-in?signedOut=1`.

These flows are local-development validation, not a production account launch. Tokens are never logged. Mailpit at the local URL captures verification and recovery messages. Password policy is 8–128 characters with at least one letter and number.
