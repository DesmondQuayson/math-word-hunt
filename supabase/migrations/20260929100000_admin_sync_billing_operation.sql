-- Super Admin "Sync with Stripe": allow the 'sync-billing' operation row.
--
-- 20260907130000 taught prepare_admin_account_operation to accept
-- 'sync-billing', but the Phase 8G CHECK constraint on
-- admin_account_operations.operation (20260804000000) was never widened, so
-- the prepare INSERT raised check_violation and every Sync with Stripe
-- request ended as operation-failed before Stripe was contacted.
--
-- This replaces only that CHECK with the same eleven values plus
-- 'sync-billing'. No function, grant, policy, trigger or row changes; every
-- existing row satisfies the wider rule. The DROP is deliberately not
-- IF EXISTS: if the constraint is not the one this migration expects, the
-- migration fails and rolls back instead of leaving the column unconstrained.

alter table public.admin_account_operations
  drop constraint admin_account_operations_operation_check;

alter table public.admin_account_operations
  add constraint admin_account_operations_operation_check check (operation in (
    'resend-confirmation','revoke-sessions','suspend','restore','open-portal',
    'cancel-at-period-end','submit-refund-review','deny-refund-review',
    'grant-complimentary','remove-complimentary','emergency-revoke',
    'sync-billing'
  ));
