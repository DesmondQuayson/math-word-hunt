# Phase 9B product access and resource hierarchy

## Current product contract

`MATHNEXA_ALL_ACCESS` is the only customer product capability. One valid, server-verified trial, active subscription, renewal-grace period, or period-end cancellation window unlocks Games, MAP Prep, Homework, and Quizzes. Browser query parameters, cookies, local storage, Checkout return values, and browser clocks have no authorization authority.

The existing `consumer_game_entitlements` row remains the single projection. Phase 9B adds an exact capability discriminator to that row; it does not create per-module entitlements, prices, trials, or Checkout flows.

## Public content hierarchy

- Games are standalone catalog products: Games → Choose a Game → Play. Grade, Topic, and Lesson are optional discovery metadata only.
- Math Vocabulary Hunt is the migration-owned canonical entry with stable key and slug `math-vocabulary-hunt`, launch type `canonical`, protected route `/play`, published status, and display order 1.
- Hosted packages retain ZIP validation, private Storage, CSP, sandboxed delivery, asset tickets, and entitlement checks. Published package transitions synchronize a standalone catalog entry without deleting historical taxonomy assignments.
- External games require an exact enabled hostname in `game_external_allowed_hosts`, canonical HTTPS, a server entitlement check, and append-only destination-change audit evidence. No host is enabled by the Phase 9B migration.
- Homework remains Grade → Topic → Lesson.
- Current Quizzes are Grade → Topic. Topic inherits Grade; Lesson is not required.
- Existing lesson-scoped Quiz rows are preserved with `scope_status = 'legacy'`, excluded from the current public Quiz catalog, and reported deterministically through `legacy_lesson_quiz_report`. They are never silently reassigned or deleted.
- MAP Prep remains an independently configured, validated HTTPS destination under the same all-access capability.

## Migration safety and rollback

The migration is additive and migration-from-empty tested. Upgrade testing must fingerprint unrelated commercial rows before and after application. Expected changes are the new capability column/default, the canonical game infrastructure row and its audit row, resource-scope classification, and any standalone entries reconciled from already-published packages.

Rollback is application-first and non-destructive:

1. Restore the previous verified application deployment.
2. Leave additive columns and tables in place; old application code ignores them.
3. Disable newly enabled external game hosts if any were approved later.
4. Archive affected non-canonical catalog entries rather than delete content or package history.
5. Do not drop the capability column or rewrite entitlement, billing, consent, owner, MFA, Auth, or content records during an incident.

## Explicit later Super Admin scope

Phase 9B does not change Super Admin authentication, MFA, sessions, authorization, navigation, uploads, taxonomy, MAP Prep controls, or the Homework Draft route. A later owner-approved Admin phase should implement only:

1. Game Add: validated package upload or approved HTTPS URL, with no required Lesson.
2. Quiz upload: Grade and Topic only, with no Lesson, plus an explicit owner-reviewed legacy Quiz migration tool.
3. Homework Draft route repair while preserving Grade, Topic, and Lesson requirements.
