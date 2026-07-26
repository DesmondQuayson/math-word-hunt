# Phase 1C.5C Owner Decision Register

Status: freeze candidate on 2026-07-26. “Phase requirement” means the structure
was required for this prototype; it does not imply approval of future operations
or policy. Pending items must not be treated as approved defaults.

| # | Decision | Proposed default | Rationale | Privacy or accessibility effect | Backend impact | Owner approval status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Teacher navigation order | Overview, Classes, Activities, Live Sessions, Reports, Curriculum, Account | Matches plan→play→review tasks | Stable order supports orientation and keyboard use | Route authorization must preserve order and explain unavailable destinations | Phase requirement; product sign-off pending |
| 2 | Required class fields | Class name and teacher ownership; IDs/status/timestamps are system fields | Minimum useful teacher-owned grouping | Avoids roster data and reduces form burden | Ownership must be trusted server data | Phase requirement |
| 3 | Optional class fields | Grade and period/section | Helps teacher recognition without requiring student data | Labels warn against student names | Nullable fields; no roster inference | Phase requirement; wording sign-off pending |
| 4 | Class archive behavior | Reversible active→archived transition with timestamp | Safer routine removal than deletion | Reduces accidental loss | Requires archive/restore commands and ownership checks | Pending owner approval |
| 5 | Class deletion-request behavior | Request receipt only; no immediate permanent delete | Deletion policy and recovery window are unresolved | Prevents accidental destructive action | Requires later queue, confirmation, retention, and completion process | Pending owner/privacy approval |
| 6 | Initial activity modes | Keep a validated mode key; do not freeze the enumeration | Prototype modes have not been validated with teachers | Avoids presenting unsupported choices as final | Provider must validate against a later owner-approved catalog | Unresolved |
| 7 | Default time-limit choices | No default product choice frozen; valid range 1–60 minutes | Classroom timing needs research | Avoids a misleading preset | Contract validates range; UI preset remains prototype-only | Unresolved |
| 8 | Default team-count choices | No default product choice frozen; valid range 2–8 teams | Room size varies | Keeps anonymous team play flexible | Contract validates range | Unresolved |
| 9 | Combine Mode behavior | Optional teacher choice; recommend below four placeable terms; preserve source lessons | Matches current v7 graceful behavior | Prevents thin content from being disguised | Future adapter must return readiness and source lesson references | Phase requirement; threshold/product wording sign-off pending |
| 10 | Current v7 versus managed sessions | v7 is independent and available now; managed sessions remain unavailable | Prevents fictional functionality | Clear available/unavailable text supports comprehension | Future service cannot replace v7 without separate migration approval | Phase requirement |
| 11 | Aggregate reporting purpose | Help teachers choose vocabulary to revisit using class/activity/lesson/session aggregates | Supports planning without individual surveillance | Excludes student tracking and inferred ability | Store only approved aggregate inputs | Purpose proposed; owner/privacy approval pending |
| 12 | Report retention | No period selected | No operational or legal evidence supports a number | Prevents silent over-retention | Retention, deletion, backup, export, and legal-hold rules required | Unresolved |
| 13 | Curriculum review ownership | Assign a named qualified teacher/curriculum owner before claiming review complete | Technical validation is not instructional approval | Avoids misleading educators | Review status and provenance need a future source | Unresolved |
| 14 | Thin lesson presentation | Show “Thin—Combine Mode recommended” and the count | Honest and actionable | Text does not rely on color | Curriculum adapter must expose thin status | Phase requirement; teacher validation pending |
| 15 | Missing lesson presentation | Show Coming soon and keep unavailable choices disabled | Prevents empty or broken activities | Disabled choices require visible explanation | Adapter must deny missing lesson selection | Phase requirement; final wording pending |
| 16 | Identity before managed sessions | Proposed: teacher identity and ownership before managed-session persistence | Managed records need a trusted owner | Reduces cross-account exposure | Authentication/RLS must precede writable session repositories | Pending owner approval |
| 17 | Data minimization commitments | No student accounts, names, emails, IDs, behavioral streams, predictions, or hidden scores | Initial team/anonymous model does not require them | Reduces privacy risk and interface burden | Schemas and adapters must reject excluded fields | Phase requirement; any expansion requires a new review |

No pending or unresolved row may become a database default, billing rule,
retention job, or production claim without an owner decision recorded in the
durable decision log.
