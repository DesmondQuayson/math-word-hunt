# Number Cross protected HTTPS backup launch

This integration is retained as rollback infrastructure for the standalone
deployment. Normal MathNexa gameplay now uses the trusted native architecture
documented in `number-cross-native-integration.md`; the external origin must
remain protected until native Production Preview and a later owner-approved
Publish have been proven.

MathNexa is the authorization authority. A subscriber launch first passes the
existing server-owned `MATHNEXA_ALL_ACCESS` decision and then loads the trusted,
published `number-cross` catalog record. Super Admin preview first passes the
existing password, MFA, role, session, and concealment checks. Neither flow
accepts a browser-supplied destination or game identity.

For the exact backup origin `https://number-cross.vercel.app`, the retained
server adapter can sign
an HS256 JWT with issuer `mathnexa`, audience and `game` `number-cross`, current
`iat`, `exp` exactly 120 seconds later, a fresh unpredictable `jti`, and purpose
`play` or `admin-preview`. MathNexa redirects at the top level to
`/api/launch?launch=...`. Number Cross verifies the token, exchanges it for its
HttpOnly session cookie, and redirects to clean `/play`. No token is persisted.

Production requires the server-only `MATHNEXA_GAME_LAUNCH_SECRET` to contain
the same 32-byte-or-longer value already configured in Number Cross. Never use
a `NEXT_PUBLIC_` alias. The secret must not appear in source, Admin metadata,
HTML, client bundles, browser storage, URLs other than the signed bearer token,
or logs.

Direct access remains denied by Number Cross. If the backup adapter is used,
Draft and archived games receive
no authorization. Maintenance redirects to a MathNexa maintenance page without
signing. Admin preview uses the same protected exchange and has no bypass.
The standalone Number Cross deployment currently returns to its fixed server
configuration, `https://mathnexa.com/`; player input cannot override it. Moving
that link to `/games` is optional follow-up work in the Number Cross Vercel
configuration. It is not used by the native player route.
