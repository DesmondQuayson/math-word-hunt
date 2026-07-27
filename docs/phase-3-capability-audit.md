# Phase 3 capability audit

This inventory describes code that exists in the repository. It is not a marketing roadmap. Authorization is decided by `packages/platform-core/src/capabilities` and resolved with server-owned state by `apps/platform-web/lib/capabilities/server.ts`.

## Teacher-facing routes

| Route | Classification | Current evidence and boundary |
| --- | --- | --- |
| `/`, `/play` | Public | Product introduction and an ungated link to preserved canonical v7. |
| `/pricing` | Public / account management | Honest Free/Pro comparison. Test amounts and Checkout appear only in a configured non-production sandbox. |
| `/sign-up`, `/sign-in`, `/forgot-password`, `/update-password`, `/auth/callback` | Public identity | Teacher-only email/password verification and recovery. No student or social identity. |
| `/teacher` | Public preview or signed-in Free/Pro | Public state is explicitly a preview. Signed-in state prioritizes v7, saved planning records, usage, then plan information. |
| `/teacher/classes` | Signed-in Free/Pro | Lists only owned classes, including preserved above-limit data. |
| `/teacher/classes/new` | Signed-in Free/Pro with limit | Creation requires server authorization and the transactional database function. Limits are 2 Free and 25 Pro active classes. |
| `/teacher/classes/[classId]` | Signed-in Free/Pro, owner only | View, safe edit, and archive of an owned record. No ownership reassignment. |
| `/teacher/activities` | Signed-in Free/Pro | Lists owned, active activity drafts. |
| `/teacher/activities/new` | Signed-in Free/Pro with limit | Creation requires server authorization and a transactional database function. Limits are 3 Free and 100 Pro active drafts. |
| `/teacher/activities/[activityId]` | Signed-in Free/Pro, owner only | View, safe edit, class attachment to an owned active class, and archive. |
| `/teacher/curriculum` | Public information / signed-in navigation | Displays real curriculum readiness and Combine Mode guidance; it does not claim teacher review is complete. |
| `/teacher/sessions`, `/teacher/sessions/new` | Planned but unavailable | Informational structure only. No managed session, remote join, or persistence. |
| `/teacher/reports` | Planned but unavailable | Informational structure only. No report or student data exists. |
| `/account` | Account management | Server-owned profile, status, plan, usage, test billing state, recovery, and deletion request. |
| `/checkout/status` | Account management | Displays provider-verified state; the return URL grants nothing. |
| `/api/billing/webhook` | Internal/support only | Signed raw-body test webhook and authoritative reconciliation; not teacher navigation. |

## Mutation and repository audit

| Boundary | Capability | Enforcement |
| --- | --- | --- |
| `createClassAction` | `class.create` | Central decision first; database derives owner, serializes count, and inserts atomically. |
| `updateClassAction` | `class.edit` | Central ownership decision; RLS owner filter; allowed above a downgraded limit. |
| `archiveClassAction` | `class.archive` | Central ownership decision; archive releases active capacity. |
| `createActivityAction` | `activity.create` | Central decision first; database derives owner, validates attached class, serializes count, and inserts atomically. |
| `updateActivityAction` | `activity.edit`, `activity.attach_to_class` | Central ownership decisions; no new constrained record is created. |
| `archiveActivityAction` | `activity.archive` | Central ownership decision; archive releases active capacity. |
| `startCheckoutAction` | `billing.checkout` | Server-resolved account and entitlement; allowlisted plan and return path; sandbox only. |
| `openBillingPortalAction` | `billing.portal` | Server-resolved owner/customer; sandbox only; suspended and deletion-requested accounts deny. |
| profile/deletion actions | `account.manage` | Server-owned teacher context and existing account lifecycle rules. |

The class and activity repositories cannot directly insert constrained rows as the authenticated browser role. Creation uses `create_teacher_class` and `create_teacher_activity`; direct inserts are revoked. Reads and safe edits keep their existing owner-scoped RLS.

## Navigation classification

The global public navigation contains Home, Play, Curriculum, Teacher workspace, Pricing, and Account. Teacher navigation contains Overview, Classes, Activities, Sessions, Reports, Curriculum, and Account. Sessions and Reports remain visible so their unavailable state is discoverable; they never masquerade as included Free or Pro capabilities.

## Deliberately unavailable

Student accounts, rosters, assignments, managed sessions, remote participation, realtime multiplayer, persisted reports, individual or aggregate student analytics, mastery claims, predictive insights, AI reporting, school/district administration, seat billing, usage billing, and production payment acceptance are not operational and are not included in either plan.
