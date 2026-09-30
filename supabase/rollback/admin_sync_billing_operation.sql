-- Rollback for 20260929100000_admin_sync_billing_operation.sql.
-- Restores the Phase 8G eleven-value rule, so Sync with Stripe fails at
-- prepare again. NOT VALID keeps any 'sync-billing' rows already written:
-- they are audit evidence and must not be deleted; new rows are still checked.
-- No application rollback is needed: the same build runs before and after.

alter table public.admin_account_operations
  drop constraint admin_account_operations_operation_check;

alter table public.admin_account_operations
  add constraint admin_account_operations_operation_check check (operation in (
    'resend-confirmation','revoke-sessions','suspend','restore','open-portal',
    'cancel-at-period-end','submit-refund-review','deny-refund-review',
    'grant-complimentary','remove-complimentary','emergency-revoke'
  )) not valid;
