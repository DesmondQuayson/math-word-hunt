# Teacher Workflow Map

Status: prototype navigation and task sequence, not implemented persistence.

## Primary classroom path

```text
Overview
  -> choose or describe a class context
  -> choose curriculum and activity settings
  -> review session setup and readiness
  -> open the current v7 game on a shared display
  -> future: complete a managed session
  -> future: review aggregate lesson/session information
```

The current working path ends at the v7 launch gateway. Managed-session and
reporting steps are visible only to test comprehension and future information
architecture; their actions are disabled or presented as honest empty states.

## Supporting paths

- Curriculum can be opened before authoring to check ready, thin,
  coming-soon, and teacher-review-pending content.
- Classes can be inspected before activity planning, but the prototype does not
  ask for a roster or student names.
- Account describes future teacher profile and lifecycle controls without
  fabricating a signed-in identity.
- Reports describe useful aggregate categories without making student mastery,
  standards-alignment, ranking, or predictive claims.

## Recovery concepts

A future managed session must identify Setup, Ready, Active, Reconnecting, and
Complete states. Recovery UI must state what was preserved and let the teacher
resume or end safely. This phase includes the language and state map only; no
realtime channel, session token, or recovery store exists.
