# Owner-run Stripe test lifecycle

No credential was available during Phase 4, so no external result is claimed. With an owner-controlled `sk_test_…` value only:

1. Verify account test mode and run `npm run billing:provision:test -- --dry-run`; review create/reuse plan.
2. Run approved provisioning without `--dry-run`; keep generated IDs in ignored owner configuration.
3. Configure the preview origin and a test-mode CLI/webhook endpoint. Confirm the endpoint secret is test-only.
4. Test monthly then annual Checkout, successful signed webhook projection, and that redirect alone grants nothing.
5. Test duplicate-subscription prevention and portal access.
6. Cancel at period end; verify access through the paid end and Free downgrade after it.
7. Use test clocks/cards for payment failure and recovery.
8. Send out-of-order, duplicate, stale, forged-signature, replay, and reconciliation cases. Run reconciliation dry-run before any apply.
9. Activate emergency deny and prove access falls safely to Free.
10. Record resource labels, timestamps, event IDs in an owner-controlled evidence log; never record keys or webhook payload PII.

Monthly, annual, failure/recovery, cancellation/downgrade, portal, replay, and external reconciliation all remain pending owner execution.

