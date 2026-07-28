# Phase 6 feedback specification

Status: local, owner-controlled, and non-persistent. No delivery channel is
approved.

## Allowed fields

- workflow being tested;
- approximate date/time supplied by the teacher;
- device category and browser category;
- impact level;
- accessibility observation;
- reproducible steps;
- expected behavior;
- observed behavior.

The local form prepares a plain-text summary and may copy it to the clipboard
after an explicit action. It sends no request, saves no browser state, performs
no analytics, and accepts no screenshot or file upload. Refreshing or leaving
the page clears the draft.

## Content safeguards

Field guidance prohibits student information, passwords, tokens, cookies,
provider secrets, payment details, raw authentication payloads, and email
addresses. Obvious prohibited patterns produce accessible validation. This is
a narrow safety check, not surveillance or a promise to detect every sensitive
value. The UI must never silently inspect content outside the submitted form.

## Delivery boundary

After summary preparation, the teacher follows the support instruction:
contact the pilot coordinator using the channel through which pilot access was
provided. The product does not choose or claim an address. The owner must
approve a final feedback-delivery method before Phase 6B.
