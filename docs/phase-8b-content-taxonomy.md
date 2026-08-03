# Phase 8B content taxonomy and resource contracts

Phase 8B introduces one owner-managed hierarchy for MathNexa content:

`Grade -> Topic -> Lesson -> Resource assignment -> Versioned resource`

The migration supports grade numbers 1 through 9, but deliberately creates no curriculum rows. Content must be supplied and reviewed by the owner; no lesson, definition, game, homework, quiz, or MAP Prep destination is inferred by the application.

## Data model

- `content_grades`, `content_topics`, and `content_lessons` hold stable UUIDs, hierarchy-scoped slugs and order, publication state, optimistic lock versions, timestamps, and creating/updating admin identities.
- `content_resources` is the stable identity for a game, PDF, image, thumbnail, or MAP Prep link.
- `content_resource_versions` preserves resource metadata and manifest history. A published version cannot be updated or deleted.
- `lesson_resource_assignments` gives a resource its lesson-scoped slug and deterministic order without coupling the resource identity to presentation order.

Approved resource types are `game`, `homework_pdf`, `homework_answer_key`, `quiz_pdf`, `quiz_answer_key`, `preview_image`, `thumbnail`, and `map_prep_link`. Approved states are `draft`, `validating`, `ready_for_review`, `published`, and `archived`.

MAP Prep is only an HTTPS external destination. Phase 8B does not import, copy, or execute the separate application.

## Authorization and publication

All six tables have forced Row Level Security and no browser policy. `anon` and `authenticated` receive no direct table or function privileges. `service_role` can read the model but can mutate it only through the twelve bounded `SECURITY DEFINER` functions. Each function uses an empty `search_path` and requires an active, MFA-enrolled Phase 8A owner identity.

Publication must move through draft, validation, and owner review. Browser values never confer publication authority. Every mutation checks an expected lock version. A stale expected version fails closed.

Publishing freezes the version. Editing a published resource creates a new draft version. Rolling back copies a prior published version into a new published version with a `source_version_id`; it never rewrites or deletes history. Published resource identities cannot be hard deleted and must instead be archived.

Create, update, publish, archive, and rollback operations append Phase 8A audit records. Audit immutability remains enforced by the Phase 8A database boundary.

## Rollback and recovery

Application-level recovery uses `rollback_content_resource`, which preserves all resource history. The schema rollback at `supabase/rollback/phase8b_content_taxonomy_resources.sql` refuses to run when published content exists. This protects owner-created publication history from accidental removal.

The protected v7 game, vocabulary file, historical builds, and backup files are outside this model and remain unchanged.
