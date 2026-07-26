# Phase 1C.5B Decisions

Status: implemented for owner review on 2026-07-26.

## Decisions embodied in the prototype

- The teacher experience is organized by classroom tasks, not analytics-first
  dashboard widgets.
- The stable navigation is Overview, Classes, Activities, Live Sessions,
  Reports, Curriculum, and Account.
- Classes do not imply student accounts or a roster. The form explicitly warns
  against student names.
- Activity authoring uses curriculum references and Combine Mode guidance;
  missing content remains unavailable.
- Current v7 shared-display play is visually separated from a future managed
  session. Only the v7 gateway is actionable.
- Reports are aggregate, teacher-supporting, and non-predictive.
- Account pages do not fabricate identity, security, or subscription state.
- Optional demo records are server-only, exact-opt-in, visibly labeled, and
  impossible to enable in production.

## Explicitly not decided or implemented

No provider, schema, authentication, persistence, realtime protocol,
entitlement, billing, subscription, deployment, retention period, report
calculation, standards alignment, or student model is implemented by this
phase. Static v7, its vocabulary, and historical files are unchanged.

## Owner decisions before the next implementation phase

- Approve the teacher navigation and primary workflow sequence.
- Approve the minimal class fields and archive/deletion distinction.
- Approve which activity modes belong in the first persisted model.
- Decide whether managed sessions are necessary before teacher identity.
- Approve aggregate reporting purpose, event inputs, retention, and deletion.
- Confirm curriculum review ownership and how thin/missing lessons surface.
