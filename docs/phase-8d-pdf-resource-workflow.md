# Phase 8D PDF resource workflow

Phase 8D adds an owner-operated library for uploaded Homework and Quiz PDFs. It does not generate PDFs, fabricate curriculum, create student records, or expose storage objects directly.

## Workflow

1. An MFA-verified owner selects an existing Grade, Topic, and Lesson and supplies metadata.
2. The server normalizes filenames, inspects declared MIME type and file magic, checks size and PDF end markers, and rejects active content, launch actions, embedded files, rich media, external actions, and XFA.
3. Accepted PDFs and validated images enter the private `resource-files` bucket. Rejected evidence is marked quarantined and uses the private `resource-quarantine` bucket when it is safe to persist for review.
4. Every resource starts as a draft. The owner explicitly advances it through validation and review before publication. The database refuses to publish PDF resource types without an accepted file for the exact version.
5. Public catalog pages expose only published metadata and application URLs. Preview images and downloads are fetched through short-lived server-side signed URLs and proxied to the browser.
6. Downloads require the existing adult consumer account and entitlement decision. Successful authorization writes minimal download evidence. No student identity or learning history is collected.

Answer keys are separate resources and are visibly labeled. Thumbnail and preview uploads are optional. Oversized files fail closed before their bytes are read into the application process. Duplicate accepted checksums are rejected across resources.

## Operations and recovery

The additive rollback script removes the Phase 8D trigger, functions, metadata tables, policies, and private buckets only after operators have safely handled any stored objects. Existing content versions are not rewritten. Quarantined files never become publishable without a new accepted upload and review.

Local verification uses the local Supabase URL only, resets from empty, runs the complete pgTAP suite, exercises the protected browser workflow, and resets the local database afterward.
