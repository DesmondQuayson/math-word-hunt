# Proposed `/.well-known/security.txt` — OWNER-GATED, NOT PUBLISHED

A `security.txt` tells a researcher who finds a flaw where to send it, instead of
guessing or going public. It is cheap and generally worth having.

**It is not published, and this work did not publish it.** Publishing commits
MathNexa to a contact address and an implied response expectation, and it invites
reports that someone then has to read. That is the owner's decision, not a
technical one.

## Proposed content

Served at `/.well-known/security.txt`, using contact details the owner already
publishes:

```
Contact: mailto:<the address the owner chooses to publish>
Expires: <one year from publication, ISO 8601>
Preferred-Languages: en
Canonical: https://mathnexa.com/.well-known/security.txt
```

## Decide before publishing

1. **Which address.** A dedicated alias is better than a personal one: it can be
   redirected later without invalidating a published file.
2. **`Expires` has to be maintained.** An expired `security.txt` is worse than
   none, because it signals abandonment. It needs a calendar reminder.
3. **Whether to write a policy page.** The `Policy:` field is optional. Omit the
   line rather than publish a dead link.
4. **What response expectation to set.** Publishing implies somebody reads that
   inbox. For a small team, saying nothing about timelines is more honest than
   promising a 24-hour reply.

## Implementation, when approved

Add `app/.well-known/security.txt/route.ts` returning `text/plain`. It should be
reachable on production only — on a locked staging environment it ought to `404`
like everything else, since a hidden environment advertising a security contact
is a contradiction.

No code for this has been written.
