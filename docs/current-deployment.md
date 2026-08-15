# Current Deployment

## MathNexa public Production boundary

The public MathNexa platform is released from a separate Vercel Production
project under the explicit `production-public` contract. It provides public
information and links to the canonical GitHub Pages game. It has no
Supabase/Auth, teacher workspace, pilot, invitation, billing, student-data,
organization-label, fixture, email, or deletion integration. See
`production-public-architecture.md` and `production-public-testing.md`.

The canonical game deployment below remains independently operational and
unchanged.

## Source

The current production structure is GitHub Pages deployed from the main branch
and the /docs directory. There is no build step.

GitHub Pages serves:

- docs/index.html as the application entry
- docs/vocab.js as the only curriculum dependency
- docs/404.html as the fallback page
- docs/robots.txt as crawler guidance
- docs/.nojekyll to disable Jekyll processing

Historical root files are not part of the /docs deployment. The v5 and v6
backup HTML files under docs remain directly addressable historical artifacts
but are not linked as the canonical entry.

## Local parity

Run npm run serve and open:

http://127.0.0.1:4173/docs/index.html

The test server uses no transformations and therefore exercises the same file
relationship as GitHub Pages: index.html loads its sibling vocab.js.

## Update safety

1. Run npm run lint.
2. Run npm run test:content.
3. Run npm run test:e2e:canonical.
4. Confirm the intended release version is visible in the footer.
5. Record the new canonical hashes.
6. Obtain owner approval for deployment.
7. Update GitHub Pages only in a separate deployment task.

GitHub Pages and browser caches may delay visible updates. Version labels and
hashes are the authoritative way to identify a release.

## Rollback

The current preserved rollback references are docs/index-v6-backup.html and
docs/index-v5-backup.html. Rollback must be intentional and must preserve a
copy of the release being replaced.

Phase 1A makes no deployment configuration or production change.
