# ShowMe Math access gate

ShowMe Math (Online Math Prep and the Worksheet Generator) is served at `showme.mathnexa.com` from its own
repository. It is a static site with no accounts. This document describes how access to it is enforced, and
MathNexa's half of that.

## The problem it closes

Until November 2026 only MathNexa's own entries checked access:

- `/map-prep` and `/worksheets` ran `requireProductAccess` and then redirected to ShowMe.
- ShowMe itself served every page to anyone who had the address, with no check. Search engines could index it, and
  an advertisement could link straight into it.

So the product was reachable without an account, a trial, a subscription or an access code.

## The rule

A ShowMe page opens only for a browser that MathNexa has confirmed. The check is the one MathNexa already makes for
its own entries:

- an account with a free trial or a subscription (`MATHNEXA_ALL_ACCESS`, module `map_prep`), or
- a school access code (authorized access).

Nothing about that rule is decided in ShowMe. ShowMe only checks that MathNexa has said yes, recently.

## How it works

1. **ShowMe refuses.** The ShowMe host runs a small check before it serves any file
   (`hosting/access-gate/middleware.mjs` in the ShowMe repository). A request without a valid pass is not served:
   - a person opening a page is redirected to `https://mathnexa.com/map-prep/pass?to=<the page they asked for>`;
   - anything else (a script, an image, a crawler's `HEAD`) is answered `401`.
2. **MathNexa checks.** `app/map-prep/pass/route.ts` calls `getGameAccessView()` and `requireProductAccess("/map-prep")`.
   A visitor without access goes through the ordinary flow: `/access`, `/confirmation-required` or `/subscription`,
   each with `next=/map-prep`.
3. **MathNexa issues the pass.** A visitor with access gets the cookie `mathnexa-showme-pass` and a `307` back to the
   ShowMe page they asked for.
4. **ShowMe serves.** The browser now sends the pass with every request to ShowMe.

The pass lasts twelve hours. When it expires, the next page the visitor opens goes round steps 1 to 4 again; for a
visitor who still has access that is two redirects and no screen.

## The pass

`payload.signature`, both base64url.

- **Payload:** JSON with exactly `v` (1), `iat` and `exp`, whole seconds, twelve hours apart.
- **Signature:** HMAC-SHA256 of the payload text under a secret the two sites share.
- **No identity:** it holds no account id, email address or session. It says "MathNexa confirmed access at this
  time" and nothing about who.

The cookie is `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, `Max-Age=43200`. On the live site it is set with
`Domain=mathnexa.com`, so that `showme.mathnexa.com` receives it. It is the only cookie MathNexa sets with a domain.
Anywhere else (a local rehearsal, a staging preview on `vercel.app`) it stays on the host that set it.

`lib/showme-access/pass.ts` holds the rules. The test vector in `lib/showme-access/pass.test.ts` is asserted in the
ShowMe repository too, so the two sides cannot drift apart.

## Where a visitor can be sent

- `to` is a path on ShowMe. Anything that is not a plain absolute path becomes the home page.
- `site=staging` chooses `https://showme-staging.mathnexa.com`; anything else means `https://showme.mathnexa.com`.
  Both origins are constants in the code.

Nothing in a request can send the pass, or the visitor, to another origin.

**The page is remembered across a detour.** A visitor without access who asked for a page other than the home page
gets the cookie `mathnexa-showme-return` (`HttpOnly`, `Path=/map-prep`, 30 minutes). After they sign in, subscribe or
enter a code, MathNexa's own entry sends them to the ShowMe home page, ShowMe sends them back here, and they are sent
on to the page they first asked for. This is what makes a student's assignment link work after the student enters
the access code.

## When access ends

- **Sign-out** and **Exit authorized access** clear the pass at once (`clearShowMePass`).
- **A subscription that lapses, or a trial that ends,** stops a new pass being issued. A pass already issued keeps
  working until it expires, at most twelve hours later. This is the one deliberate looseness in the design: the pass
  holds no identity, so ShowMe cannot ask MathNexa about a particular account.

## Configuration

| Where | Variable | Meaning |
| --- | --- | --- |
| MathNexa (Vercel project `mathnexa-platform-production`) | `MVH_SHOWME_ACCESS_SECRET` | The shared key, 32 to 256 printable characters. Unset or malformed: `/map-prep/pass` answers 404 and no pass is issued. |
| ShowMe (Vercel projects `showme-map-prep-production`, `showme-map-prep-staging`) | `SHOWME_PASS_SECRET` | The same value. Missing: every ShowMe page answers 503 with a link to MathNexa. It never opens. |
| ShowMe | `SHOWME_REVIEW_KEY` | A separate key the release checks present in a request header to read a candidate. Not a pass; a browser never has it. |

Both sides fail closed. The order of a release matters:

1. Set `MVH_SHOWME_ACCESS_SECRET` and release MathNexa. The new route issues passes; nothing else changes, and
   ShowMe is still open.
2. Set `SHOWME_PASS_SECRET` and `SHOWME_REVIEW_KEY`, then release ShowMe with the gate.

To rotate the key, set the new value on both sides and redeploy both; visitors holding an old pass are sent round
once and receive a new one.

## What stays open on ShowMe

- `/privacy`
- `robots.txt` and the icons
- the hashed build files under `/_next/static/`, which are the same for everyone and are not lesson pages

Everything else needs a pass: every lesson, practice set, worksheet, teacher page and assignment link, and the
images, narration and fonts they load.

## The Online Math Prep destination check

Super Admin verifies the Online Math Prep destination when it is saved (`lib/admin/external-destination-health.ts`):
a `HEAD` request that must not be answered with a redirect. The gate answers a `HEAD` without a pass with `401`,
which that check accepts as reachable, so saving the destination keeps working.

## Verifying

- `npm run test --workspace @math-vocabulary-hunt/platform-web -- lib/showme-access test/security/showme-pass-route.test.ts`
- `npm run test:e2e:school-access` (a code holder gets a pass, is sent to the remembered page, and loses the pass on
  exit)
- On the live site, signed out: `https://mathnexa.com/map-prep/pass?to=/grades/6` answers a redirect to
  `/access?next=/map-prep` and sets no `mathnexa-showme-pass` cookie.

## Turning it off

Release ShowMe without the gate file (or promote the previous ShowMe deployment). MathNexa needs no change: a pass
nobody asks for does nothing.
