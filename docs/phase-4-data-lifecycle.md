# Data retention and deletion lifecycle

The lifecycle is `requested → restricted → cooling_off → eligible → executing → completed`, with `executing → failed_manual_review → eligible` for reviewed recovery. Phase 4 implements planning and the first three administrative transitions only. Entering `executing` is hard-disabled in SQL and the CLI refuses `--execute`.

The teacher creates only an owner-scoped request. A database trigger immediately restricts writes. Later transitions require the server/operator role, expected owner ID, current-state validation, and a deterministic `account-deletion:<request UUID>` key. Browsers cannot update lifecycle fields. Cross-account plans and transitions fail. The dry-run command is `npm run deletion:plan -- --owner=<teacher UUID>`; it reads only the named owner and changes nothing.

Proposed final treatment, requiring owner approval:

| Record | Proposed treatment |
|---|---|
| teacher profile | delete after approved cooling-off period |
| classes and activities | cascade delete |
| subscription projection | anonymize/minimize after provider cancellation is verified |
| billing event metadata | retain only legally/operationally necessary non-PII receipt |
| support/audit | minimize and retain for approved incident/legal period |
| authentication identity | delete separately through identity provider after application deletion succeeds |
| legal hold | pause transition and record a non-PII hold reason |

Application deletion and provider deletion are separate checkpoints. Before execution, rollback means restoring account status and closing the request after documented identity verification. After provider identity deletion, rollback may be impossible; backups must not silently resurrect deleted accounts. The owner must decide cooling-off/retention period, legal-hold authority, audit retention, payment metadata retention, backup retention, and recovery window before an execution migration can exist.

