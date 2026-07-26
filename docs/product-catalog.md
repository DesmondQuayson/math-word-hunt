# Product Catalog Contract

Status: Phase 1B contract. Feature-to-plan mapping and pricing are deliberately
not defined.

## Stable product identity

The permanent product key is `math-vocabulary-hunt`. Display names may change;
the key must not be reused for another product or changed to match marketing
copy. No other product is part of this repository's catalog.

## Registered feature keys

| Key | Intended capability boundary | Phase 1B status |
| --- | --- | --- |
| `basic-play` | Core round setup and play | Registered, mapping pending |
| `limited-content` | A deliberately limited curriculum set | Registered, mapping pending |
| `complete-library` | The complete reviewed curriculum library | Registered, mapping pending |
| `classroom-tools` | Teacher-led classroom controls | Registered, mapping pending |
| `teacher-reporting` | Teacher-visible reports | Registered, mapping pending |
| `premium-game-modes` | Additional game modes | Registered, mapping pending |

Registration does not mean a feature exists today, is paid, or belongs to a
specific plan. Those are product and owner decisions for a later phase.

## Key policy

- Keys are lowercase, hyphenated, stable identifiers.
- New keys require an owner-approved catalog change and tests.
- Duplicate keys fail validation.
- Unknown keys never inherit access and must be denied.
- Removing or renaming a persisted key requires a migration and compatibility
  plan; deprecate before removal.
- Display labels, descriptions, and ordering are presentation metadata and may
  change without changing the key.

## Catalog versus commercial plans

The catalog says what products and capabilities exist. A plan says what may be
purchased. An entitlement says what a particular user may access. Keeping
these concepts separate prevents price or provider changes from leaking into
gameplay policy.

The current contract registers one product and six provisional feature
boundaries. No price, plan, checkout, subscription, or provider identifiers
are introduced in Phase 1B.

## Validation

`packages/platform-core/src/catalog` exports readonly registries, runtime key
guards, parsers, and a product-catalog constructor through the package public
API. Unit tests assert the exact registered keys, reject duplicates, and verify
that unknown values follow default-deny parsing.
