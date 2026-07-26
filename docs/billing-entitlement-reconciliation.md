# Billing entitlement reconciliation

The only authority flow is `Stripe -> verified reconciliation -> internal subscription projection -> product entitlement -> account-status override -> access decision`. UI status is informational and never authorizes.

| Projection | Outcome |
| --- | --- |
| active + approved plan/environment + future confirmed end | allow to that end |
| trialing | deny unless trials are separately approved/configured; then allow only to confirmed end |
| incomplete / incomplete_expired / past_due | temporary/default denial; no grace approved |
| unpaid / paused / canceled / deleted | revoke |
| cancel at period end while active | allow only through confirmed end |
| unknown/malformed, unapproved price, mode mismatch, duplicate current subscription | manual review and deny |
| replacement | end old derived entitlement before enabling one valid replacement |
| delay/outage | use only last verified active projection to stored end; never extend/upgrade |

Suspended, deletion-requested, closed, or missing profiles deny regardless of payment. Billing display status, entitlement authorization, and account access are distinct. Projection and entitlement writes share one retry-safe transaction.

