# Phase 8F — structured CMS, media, and legal publication

Phase 8F adds an owner-only, MFA-protected CMS without a raw HTML or JavaScript editor. The server accepts only the documented block types: hero, section, feature list, announcement, FAQ list, link list, HTTPS external link, and legal section. The editable keys cover the homepage, featured collections, announcements, FAQ/help/support/pricing copy, SEO/social metadata, MAP Prep destination, navigation, footer, Terms, Privacy, cancellation, and refunds.

## Publication and legal history

Documents move from draft to ready for review to published. A newer draft never removes the last published version. Terms, Privacy, cancellation, and refund content use the same version ledger, and database triggers reject any update or deletion of a published version. Rollback creates another published version rather than rewriting history. Only the bounded service-role functions can mutate state; every action records immutable admin-audit evidence.

## Media boundary

Originals and quarantine objects are private. Accepted images must pass magic-byte and dimension checks and are decoded through Sharp with a bounded pixel count; the public derivative is a resized WebP. Audio must match MP3, Ogg, or WAV signatures. PDFs reuse the structural fail-closed inspection. Visual media requires alt text, and every asset retains caption, attribution, license, checksum, usage, and additive version metadata. Duplicate accepted checksums are rejected. Media referenced by published CMS cannot be archived.

Public clients never receive storage paths or storage credentials. `/media/{assetId}` resolves only a published, accepted derivative through the server and sends `nosniff`, immutable cache, and same-site resource headers. Quarantined and draft media return genuine 404 responses.

## Operational checks

Run `npm run phase8f:verify`. The gate migrates from empty, executes the complete pgTAP suite, repeats inherited Phase 8A route-concealment coverage, completes the CMS/media browser lifecycle, performs a static security audit, typechecks, validates the diff, and reconfirms protected game hashes.

Rollback SQL is additive-schema cleanup for an unused local/staging installation. Never run it after CMS publication without first preserving legal, audit, media, and usage history.
