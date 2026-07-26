# Row Level Security

RLS is enabled on every application table. Table privileges and policies both enforce least privilege.

| Resource | Anonymous | Active owner | Suspended/deletion requested | Cross-account | Browser writes |
| --- | --- | --- | --- | --- | --- |
| Profiles | Deny | Read; update display/organization only | Own profile read | Deny | No ID/status changes |
| Products | Active safe fields read | Read | Read | Not personal | No writes |
| Entitlements | Deny | Own read | Deny | Deny | No writes |
| Classes | Deny | Own select/insert/approved update/archive | Deny | Deny | No delete/reassign/restore |
| Activities | Deny | Own select/insert/approved update | Deny | Deny | No delete/reassign/foreign class |
| Deletion requests | Deny | Own select/insert | Own select | Deny | No resolution changes |

`private.is_active_teacher()` and `private.teacher_owns_active_class(uuid)` are minimal security-definer helpers with a fixed empty search path and explicit execute grants. The service role is reserved for local migration/test administration and is never available to application or browser code.
