# Account status behavior

- `active`: may update approved profile fields, create/read/archive own classes, create/read own activity drafts, read own entitlement rows, and request deletion.
- `suspended`: may authenticate if Auth permits, but profile policy and UI fail closed for classes, activities, and entitlements. The UI shows a safe status notice.
- `deletion_requested`: may read the own status and pending request; new class/activity writes and entitlement use are denied. No browser reversal exists.
- missing or malformed profile: protected operations deny and the UI gives a safe recovery/support message.

Sessions and reports remain unavailable for every status. No status can be changed by ordinary browser requests.
