# Billing catalog contract

`packages/platform-core/src/billing` freezes provider-independent plan identity, interval, display name, proposal lifecycle, and feature mapping. It contains no provider IDs and rejects invented paid amounts.

| Plan | Interval | Price | Proposed features |
| --- | --- | --- | --- |
| Free | none | free | basic play, limited content |
| Teacher Pro Monthly | month | owner decision | basic play, limited content, complete library, classroom tools, premium game modes |
| Teacher Pro Annual | year | owner decision | same proposed Pro bundle |

Teacher reporting is excluded because real reporting is unapproved. All plans remain `proposed`. Currency/country, amounts, annual discount, tax, trials, promotions, and refunds need approval. In Phase 2B, server configuration maps each paid internal key to one environment-specific Stripe Price ID; the browser never submits a Price ID. Price version/effective-date support is deferred until actual pricing exists. Retired keys must remain readable for existing subscriptions rather than silently remapped.

