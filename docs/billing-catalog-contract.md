# Billing catalog contract

`packages/platform-core/src/billing` freezes provider-independent plan identity, interval, display name, proposal lifecycle, and feature mapping. It contains no provider IDs and rejects invented paid amounts.

| Plan | Interval | Price | Proposed features |
| --- | --- | --- | --- |
| Free | none | free | basic play, limited content |
| Teacher Pro Monthly | month | owner decision | basic play, limited content, complete library, classroom tools, premium game modes |
| Teacher Pro Annual | year | owner decision | same proposed Pro bundle |

Teacher reporting is excluded because real reporting is unapproved. Phase 2 authorizes monthly USD 9.99 and annual USD 79.99 only for local/test-mode validation; it does not approve production pricing. Server configuration maps each paid internal key to one environment-specific Stripe Price ID and validates the retrieved Price; the browser never submits a Price ID. Tax, trials, promotions, automatic refunds, and production commercial terms remain unapproved. Price version/effective-date support is deferred until actual production pricing exists. Retired keys must remain readable for existing subscriptions rather than silently remapped.
