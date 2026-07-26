# Migration Safety Plan

This plan governs future architecture work. It does not authorize a migration.

## Golden master

The Phase 1A baseline is:

- docs/index.html SHA-256:
  8F957F59720816FE490E27BFD0C8214EB53D13F26A76BEB0176A4D8383319148
- docs/vocab.js SHA-256:
  CAEB8FBB590FFFD8CBC169F88F174A38C26DE2D16A7E1B0C1CF5E83AC9F01C46

The content audit fails if either canonical file changes unexpectedly. An
intentional new release must update the version, regression evidence,
documentation, and expected hash together.

## Preservation rules

1. Keep the static v7 build independently launchable throughout migration.
2. Build future platform foundations beside the current game before attempting
   integration.
3. Do not port or rewrite gameplay during identity, catalog, or entitlement
   foundation work.
4. Do not remove historical versions until rollback and archival policy receive
   owner approval.
5. Compare behavior, not only appearance, before changing the deployment entry.
6. Keep Pointer Events, keyboard behavior, focus, reduced motion, responsive
   layout, and audio fallbacks as acceptance criteria.
7. Keep curriculum content separate from account, billing, and authorization
   concerns.

## Future parallel migration

Future work may introduce a server-rendered platform shell, teacher identity,
server-side entitlements, and database-backed teacher features. That work must
remain a modular monolith and should initially link to or safely host the
preserved static game.

Premium content cannot be protected while it is shipped entirely in public
static JavaScript. Any later enforcement design must move protected resources
behind a server boundary without reducing the free game or classroom
reliability.

## Promotion gate

A future implementation may replace the GitHub Pages entry only after:

- current and new regression suites pass;
- curriculum counts and references match;
- keyboard, pointer, phone, tablet, and classroom-display tests pass;
- blocked-audio and reduced-motion behavior pass;
- a rollback artifact and rollback procedure are verified;
- owner review approves the cutover; and
- deployment is performed as a separate, explicit operation.
