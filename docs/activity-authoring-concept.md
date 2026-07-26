# Activity Authoring Concept

Status: form and validation prototype only; no assignment delivery.

## Proposed flow

1. Select grade, topic, and lesson through a future curriculum adapter.
2. Select game mode, time limit, and team count.
3. Enable Combine Mode when thin vocabulary would not form a useful grid.
4. Review the setup before a future save or launch action.

The prototype uses a deliberately small readiness summary; it is not a second
curriculum source and must not grow into one. Missing content is disabled and
described as coming soon. Thin lessons remain selectable with Combine Mode
guidance. All definitions still require teacher review.

## Validation and cancellation

Labels are programmatically associated. Required status appears in text. On
submit, an error summary receives focus and links to inline messages; invalid
fields expose `aria-invalid` and descriptions. Time limits accept 1–60 minutes.
Cancellation is always available and returns to Activities. A valid prototype
submission says “Nothing was assigned or saved.”

## Future adapter contract

A future authoring service should accept stable curriculum references, validate
them again on a trusted server, deny unknown/malformed references, and return a
readiness result. Browser-supplied labels, access claims, class ownership, and
entitlement values cannot be authoritative.
