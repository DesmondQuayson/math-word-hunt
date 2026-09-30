begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
\set phase7d_identity_model 'consumer-v1'
\ir ../helpers/select-identity-model.psql

-- Schema ------------------------------------------------------------------------
select col_not_null('public', 'admin_sessions', 'last_activity_at', 'last activity is always recorded');
select col_not_null('public', 'admin_sessions', 'step_up_at', 'step-up time is always recorded');
select is(
  (select count(*)::int from pg_constraint where conrelid = 'public.admin_sessions'::regclass and contype = 'c'
    and pg_get_constraintdef(oid) like '%''00:30:00''::interval%'),
  0, 'the 30-minute ceiling is gone');
select is(
  (select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.admin_sessions'::regclass
    and conname = 'admin_sessions_absolute_lifetime_check'),
  'CHECK ((expires_at <= (started_at + ''02:00:00''::interval)))', 'the database enforces a 2-hour ceiling');
select ok(
  (select pg_get_constraintdef(oid) like '%''idle-expired''::text%' from pg_constraint
    where conrelid = 'public.admin_sessions'::regclass and conname = 'admin_sessions_end_reason_check'),
  'idle-expired is a recorded end reason');

-- Fixtures ----------------------------------------------------------------------
insert into auth.users(id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data) values
  ('a2b00000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'session-owner@example.invalid', 'x', now(), '{}'),
  ('a2b00000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'session-account@example.invalid', 'x', now(), '{}'),
  ('a2b00000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'session-other-owner@example.invalid', 'x', now(), '{}');
insert into public.admin_users(id, user_id, role, mfa_enrolled) values
  ('a2b10000-0000-4000-8000-000000000001', 'a2b00000-0000-4000-8000-000000000001', 'owner', true),
  ('a2b10000-0000-4000-8000-000000000002', 'a2b00000-0000-4000-8000-000000000003', 'owner', true);

-- id suffix: purpose
--   01 fresh (MFA a minute ago)          02 live, step-up 30 minutes old
--   03 idle for 61 minutes               04 idle for 59 minutes
--   05 past its absolute expiry          06 active 30 seconds ago (throttled)
--   07 active 5 minutes ago (touchable)  08 another admin's live session
--   09 signed out                        10 emergency-revoked
--   11 100 minutes old, active           12 to be ended as idle
insert into public.admin_sessions(id, admin_user_id, token_hash, assurance_level, started_at, expires_at) values
  ('a2b20000-0000-4000-8000-000000000001', 'a2b10000-0000-4000-8000-000000000001', repeat('0', 62) || '01', 'aal2', now() - interval '1 minute', now() + interval '119 minutes');
insert into public.admin_sessions(id, admin_user_id, token_hash, assurance_level, started_at, expires_at, last_activity_at) values
  ('a2b20000-0000-4000-8000-000000000002', 'a2b10000-0000-4000-8000-000000000001', repeat('0', 62) || '02', 'aal2', now() - interval '30 minutes', now() + interval '90 minutes', now() - interval '2 minutes'),
  ('a2b20000-0000-4000-8000-000000000003', 'a2b10000-0000-4000-8000-000000000001', repeat('0', 62) || '03', 'aal2', now() - interval '90 minutes', now() + interval '30 minutes', now() - interval '61 minutes'),
  ('a2b20000-0000-4000-8000-000000000004', 'a2b10000-0000-4000-8000-000000000001', repeat('0', 62) || '04', 'aal2', now() - interval '90 minutes', now() + interval '30 minutes', now() - interval '59 minutes'),
  ('a2b20000-0000-4000-8000-000000000005', 'a2b10000-0000-4000-8000-000000000001', repeat('0', 62) || '05', 'aal2', now() - interval '125 minutes', now() - interval '5 minutes', now() - interval '10 minutes'),
  ('a2b20000-0000-4000-8000-000000000006', 'a2b10000-0000-4000-8000-000000000001', repeat('0', 62) || '06', 'aal2', now() - interval '10 minutes', now() + interval '110 minutes', now() - interval '30 seconds'),
  ('a2b20000-0000-4000-8000-000000000007', 'a2b10000-0000-4000-8000-000000000001', repeat('0', 62) || '07', 'aal2', now() - interval '10 minutes', now() + interval '110 minutes', now() - interval '5 minutes'),
  ('a2b20000-0000-4000-8000-000000000011', 'a2b10000-0000-4000-8000-000000000001', repeat('0', 62) || '11', 'aal2', now() - interval '100 minutes', now() + interval '20 minutes', now() - interval '5 minutes'),
  ('a2b20000-0000-4000-8000-000000000012', 'a2b10000-0000-4000-8000-000000000001', repeat('0', 62) || '12', 'aal2', now() - interval '20 minutes', now() + interval '100 minutes', now() - interval '1 minute');
insert into public.admin_sessions(id, admin_user_id, token_hash, assurance_level, started_at, expires_at) values
  ('a2b20000-0000-4000-8000-000000000008', 'a2b10000-0000-4000-8000-000000000002', repeat('0', 62) || '08', 'aal2', now() - interval '1 minute', now() + interval '60 minutes');
insert into public.admin_sessions(id, admin_user_id, token_hash, assurance_level, started_at, expires_at, ended_at, end_reason) values
  ('a2b20000-0000-4000-8000-000000000009', 'a2b10000-0000-4000-8000-000000000001', repeat('0', 62) || '09', 'aal2', now() - interval '20 minutes', now() + interval '100 minutes', now() - interval '1 minute', 'signed-out');
insert into public.admin_sessions(id, admin_user_id, token_hash, assurance_level, started_at, expires_at, ended_at, revoked_at, end_reason) values
  ('a2b20000-0000-4000-8000-000000000010', 'a2b10000-0000-4000-8000-000000000001', repeat('0', 62) || '10', 'aal2', now() - interval '20 minutes', now() + interval '100 minutes', now() - interval '1 minute', now() - interval '1 minute', 'emergency-revocation');

select results_eq(
  $$select last_activity_at = started_at, step_up_at = started_at from public.admin_sessions where id = 'a2b20000-0000-4000-8000-000000000001'$$,
  $$values (true, true)$$, 'a new session starts active and stepped-up at its MFA sign-in');

-- Absolute lifetime ---------------------------------------------------------------
select lives_ok(
  $$insert into public.admin_sessions(admin_user_id, token_hash, assurance_level, started_at, expires_at)
    values ('a2b10000-0000-4000-8000-000000000001', repeat('1', 64), 'aal2', now(), now() + interval '120 minutes')$$,
  'a 120-minute session is accepted');
select throws_ok(
  $$insert into public.admin_sessions(admin_user_id, token_hash, assurance_level, started_at, expires_at)
    values ('a2b10000-0000-4000-8000-000000000001', repeat('2', 64), 'aal2', now(), now() + interval '121 minutes')$$,
  '23514', null, 'a session longer than 120 minutes is rejected by the table');

set local role service_role;
select lives_ok(
  $$select public.start_admin_session('a2b10000-0000-4000-8000-000000000001', repeat('3', 64), now() + interval '120 minutes', '127.0.0.1', 'pgTAP')$$,
  'start_admin_session accepts 120 minutes');
select lives_ok(
  $$select public.start_admin_session('a2b10000-0000-4000-8000-000000000001', repeat('4', 64), now() + interval '31 minutes', '127.0.0.1', 'pgTAP')$$,
  'start_admin_session accepts sessions past the old 30-minute ceiling');
select lives_ok(
  $$select public.start_admin_session('a2b10000-0000-4000-8000-000000000001', repeat('5', 64), statement_timestamp() + interval '120 minutes 30 seconds', '127.0.0.1', 'pgTAP')$$,
  'a request within one minute of the ceiling (clock skew) is accepted');
select throws_ok(
  $$select public.start_admin_session('a2b10000-0000-4000-8000-000000000001', repeat('6', 64), statement_timestamp() + interval '122 minutes', '127.0.0.1', 'pgTAP')$$,
  'P0001', 'Invalid admin session expiry', 'start_admin_session rejects more than 120 minutes');
reset role;
select is(
  (select max(expires_at - started_at) from public.admin_sessions where token_hash in (repeat('3', 64), repeat('5', 64))),
  interval '2 hours', 'no started session lasts longer than 2 hours, even when the request is clamped');
select results_eq(
  $$select metadata->>'idle_timeout_minutes' from public.admin_audit_log where action = 'admin.session.started'
      and target = (select id::text from public.admin_sessions where token_hash = repeat('3', 64))$$,
  $$values ('60'::text)$$, 'session start is audited with its idle timeout');

-- The owner session contract (used by every privileged database operation) --------
select lives_ok(
  $$select private.require_admin_account_session('a2b10000-0000-4000-8000-000000000001', 'a2b20000-0000-4000-8000-000000000011', false)$$,
  'a session 100 minutes old is still valid (well past the old 15-minute limit)');
select throws_ok(
  $$select private.require_admin_account_session('a2b10000-0000-4000-8000-000000000001', 'a2b20000-0000-4000-8000-000000000003', false)$$,
  '42501', 'Active owner session required', 'a session idle for 61 minutes is refused');
select lives_ok(
  $$select private.require_admin_account_session('a2b10000-0000-4000-8000-000000000001', 'a2b20000-0000-4000-8000-000000000004', false)$$,
  'a session idle for 59 minutes is still valid');
select throws_ok(
  $$select private.require_admin_account_session('a2b10000-0000-4000-8000-000000000001', 'a2b20000-0000-4000-8000-000000000005', false)$$,
  '42501', 'Active owner session required', 'a session past its absolute expiry is refused');
select throws_ok(
  $$select private.require_admin_account_session('a2b10000-0000-4000-8000-000000000001', 'a2b20000-0000-4000-8000-000000000009', false)$$,
  '42501', 'Active owner session required', 'a signed-out session is refused');
select throws_ok(
  $$select private.require_admin_account_session('a2b10000-0000-4000-8000-000000000001', 'a2b20000-0000-4000-8000-000000000010', false)$$,
  '42501', 'Active owner session required', 'a revoked session is refused');
select throws_ok(
  $$select private.require_admin_account_session('a2b10000-0000-4000-8000-000000000001', 'a2b20000-0000-4000-8000-000000000008', false)$$,
  '42501', 'Active owner session required', 'another admin''s session is refused');

-- Activity refresh ---------------------------------------------------------------
set local role service_role;
select is(public.touch_admin_session(repeat('0', 62) || '06'), false, 'activity is recorded at most once a minute');
select is(public.touch_admin_session(repeat('0', 62) || '07'), true, 'activity older than a minute is refreshed');
select is(public.touch_admin_session(repeat('0', 62) || '03'), false, 'an idle-expired session cannot be revived by activity');
select is(public.touch_admin_session(repeat('0', 62) || '05'), false, 'a session past its absolute expiry cannot be revived');
select is(public.touch_admin_session(repeat('0', 62) || '09'), false, 'a signed-out session cannot be revived');
select is(public.touch_admin_session('not-a-hash'), false, 'a malformed token hash is ignored');
reset role;
select results_eq(
  $$select last_activity_at > now() - interval '1 minute', expires_at = started_at + interval '120 minutes'
      from public.admin_sessions where id = 'a2b20000-0000-4000-8000-000000000007'$$,
  $$values (true, true)$$, 'refreshed activity moves the idle window but never the absolute expiry');
select results_eq(
  $$select last_activity_at = now() - interval '30 seconds' from public.admin_sessions where id = 'a2b20000-0000-4000-8000-000000000006'$$,
  $$values (true)$$, 'a throttled refresh writes nothing');
select throws_ok(
  $$update public.admin_sessions set last_activity_at = expires_at + interval '1 second' where id = 'a2b20000-0000-4000-8000-000000000007'$$,
  '23514', null, 'activity can never be recorded past the absolute expiry');

-- Step-up --------------------------------------------------------------------------
select throws_ok(
  $$select private.require_admin_account_session('a2b10000-0000-4000-8000-000000000001', 'a2b20000-0000-4000-8000-000000000002', true)$$,
  '42501', 'Fresh owner reauthentication required', 'a step-up older than 5 minutes is stale for sensitive operations');
select lives_ok(
  $$select private.require_admin_account_session('a2b10000-0000-4000-8000-000000000001', 'a2b20000-0000-4000-8000-000000000001', true)$$,
  'the sign-in MFA counts as a fresh step-up');
set local role service_role;
select throws_ok(
  $$select public.record_admin_step_up('a2b10000-0000-4000-8000-000000000001', 'a2b20000-0000-4000-8000-000000000003', '127.0.0.1', 'pgTAP')$$,
  '42501', 'Active owner session required', 'an idle-expired session cannot step up');
select throws_ok(
  $$select public.record_admin_step_up('a2b10000-0000-4000-8000-000000000001', 'a2b20000-0000-4000-8000-000000000005', '127.0.0.1', 'pgTAP')$$,
  '42501', 'Active owner session required', 'an expired session cannot step up');
select throws_ok(
  $$select public.record_admin_step_up('a2b10000-0000-4000-8000-000000000001', 'a2b20000-0000-4000-8000-000000000010', '127.0.0.1', 'pgTAP')$$,
  '42501', 'Active owner session required', 'a revoked session cannot step up');
select throws_ok(
  $$select public.record_admin_step_up('a2b10000-0000-4000-8000-000000000001', 'a2b20000-0000-4000-8000-000000000008', '127.0.0.1', 'pgTAP')$$,
  '42501', 'Active owner session required', 'an admin cannot step up another admin''s session');
select lives_ok(
  $$select public.record_admin_step_up('a2b10000-0000-4000-8000-000000000001', 'a2b20000-0000-4000-8000-000000000002', '127.0.0.1', 'pgTAP')$$,
  'a verified TOTP step-up is recorded for a live session');
reset role;
select results_eq(
  $$select step_up_at > now() - interval '1 minute', last_activity_at > now() - interval '1 minute', expires_at = started_at + interval '120 minutes'
      from public.admin_sessions where id = 'a2b20000-0000-4000-8000-000000000002'$$,
  $$values (true, true, true)$$, 'step-up refreshes step_up_at and activity without extending the session');
select lives_ok(
  $$select private.require_admin_account_session('a2b10000-0000-4000-8000-000000000001', 'a2b20000-0000-4000-8000-000000000002', true)$$,
  'after step-up the sensitive operation is allowed');
select results_eq(
  $$select action, metadata->>'method' from public.admin_audit_log where target = 'a2b20000-0000-4000-8000-000000000002'$$,
  $$values ('admin.step-up.success'::text, 'totp'::text)$$, 'step-up success is audited without the code');

-- Duplicate-safe account operations ---------------------------------------------------
update public.admin_sessions set step_up_at = started_at where id = 'a2b20000-0000-4000-8000-000000000002';
set local role service_role;
select results_eq(
  $$select created, operation_state from public.begin_admin_account_operation('a2b10000-0000-4000-8000-000000000001', 'a2b20000-0000-4000-8000-000000000002',
      'a2b00000-0000-4000-8000-000000000002', 'sync-billing', 'session2b:sync:account-000001', null)$$,
  $$values (true, 'prepared'::text)$$, 'an ordinary safe operation does not need a fresh step-up');
select results_eq(
  $$select created, operation_state from public.begin_admin_account_operation('a2b10000-0000-4000-8000-000000000001', 'a2b20000-0000-4000-8000-000000000002',
      'a2b00000-0000-4000-8000-000000000002', 'sync-billing', 'session2b:sync:account-000001', null)$$,
  $$values (false, 'prepared'::text)$$, 'a duplicate while the first request is running is suppressed');
select lives_ok(
  $$select public.finish_admin_account_operation('a2b10000-0000-4000-8000-000000000001', 'a2b20000-0000-4000-8000-000000000002',
      (select id from public.admin_account_operations where idempotency_key = 'session2b:sync:account-000001'), 'succeeded', null)$$,
  'the first request finishes normally');
select results_eq(
  $$select created, operation_state from public.begin_admin_account_operation('a2b10000-0000-4000-8000-000000000001', 'a2b20000-0000-4000-8000-000000000002',
      'a2b00000-0000-4000-8000-000000000002', 'sync-billing', 'session2b:sync:account-000001', null)$$,
  $$values (false, 'succeeded'::text)$$, 'a duplicate of a completed operation reports the completed result instead of running again');
select throws_ok(
  $$select * from public.begin_admin_account_operation('a2b10000-0000-4000-8000-000000000001', 'a2b20000-0000-4000-8000-000000000002',
      'a2b00000-0000-4000-8000-000000000002', 'resend-confirmation', 'session2b:sync:account-000001', null)$$,
  'P0001', 'Idempotency ownership conflict', 'a key cannot be reused for a different operation');
select throws_ok(
  $$select * from public.begin_admin_account_operation('a2b10000-0000-4000-8000-000000000001', 'a2b20000-0000-4000-8000-000000000002',
      'a2b00000-0000-4000-8000-000000000002', 'open-portal', 'session2b:portal:account-00001', null)$$,
  '42501', 'Fresh owner reauthentication required', 'the Stripe portal now needs a fresh step-up');
select throws_ok(
  $$select * from public.begin_admin_account_operation('a2b10000-0000-4000-8000-000000000001', 'a2b20000-0000-4000-8000-000000000002',
      'a2b00000-0000-4000-8000-000000000002', 'suspend', 'session2b:suspend:account-0001', 'Verified owner review')$$,
  '42501', 'Fresh owner reauthentication required', 'suspension needs a fresh step-up');
select lives_ok(
  $$select public.record_admin_step_up('a2b10000-0000-4000-8000-000000000001', 'a2b20000-0000-4000-8000-000000000002', '127.0.0.1', 'pgTAP')$$,
  'the owner steps up');
select throws_ok(
  $$select * from public.begin_admin_account_operation('a2b10000-0000-4000-8000-000000000001', 'a2b20000-0000-4000-8000-000000000002',
      'a2b00000-0000-4000-8000-000000000002', 'suspend', 'session2b:suspend:account-0001', null)$$,
  'P0001', 'A bounded operation reason is required', 'a fresh step-up does not remove the reason requirement');
select results_eq(
  $$select created from public.begin_admin_account_operation('a2b10000-0000-4000-8000-000000000001', 'a2b20000-0000-4000-8000-000000000002',
      'a2b00000-0000-4000-8000-000000000002', 'suspend', 'session2b:suspend:account-0001', 'Verified owner review')$$,
  $$values (true)$$, 'with a fresh step-up and a reason the suspension is prepared');
select results_eq(
  $$select created from public.begin_admin_account_operation('a2b10000-0000-4000-8000-000000000001', 'a2b20000-0000-4000-8000-000000000002',
      'a2b00000-0000-4000-8000-000000000002', 'open-portal', 'session2b:portal:account-00001', null)$$,
  $$values (true)$$, 'with a fresh step-up the portal operation is prepared');
select throws_ok(
  $$select * from public.begin_admin_account_operation('a2b10000-0000-4000-8000-000000000001', 'a2b20000-0000-4000-8000-000000000002',
      'a2b00000-0000-4000-8000-000000000001', 'sync-billing', 'session2b:sync:admin-0000001', null)$$,
  'P0001', 'Active admin identities require the emergency admin revocation workflow', 'admin identities are still protected');
select throws_ok(
  $$select * from public.begin_admin_account_operation('a2b10000-0000-4000-8000-000000000001', 'a2b20000-0000-4000-8000-000000000003',
      'a2b00000-0000-4000-8000-000000000002', 'sync-billing', 'session2b:sync:idle-00000001', null)$$,
  '42501', 'Active owner session required', 'an idle-expired session cannot start an operation');
reset role;
select results_eq(
  $$select action, metadata->>'operation_state' from public.admin_audit_log
      where action = 'admin.account.operation.duplicate-suppressed' order by created_at, metadata->>'operation_state'$$,
  $$values ('admin.account.operation.duplicate-suppressed'::text, 'prepared'::text), ('admin.account.operation.duplicate-suppressed'::text, 'succeeded'::text)$$,
  'each suppressed duplicate is audited with the state it found');
select is(
  (select count(*)::int from public.admin_account_operations where idempotency_key = 'session2b:sync:account-000001'),
  1, 'a duplicated key never creates a second operation');

-- Session end reasons ------------------------------------------------------------------
set local role service_role;
select is(public.end_admin_session(repeat('0', 62) || '12', 'idle-expired', '127.0.0.1', 'pgTAP'), true, 'an idle session is ended as idle-expired');
select throws_ok($$select public.end_admin_session(repeat('0', 62) || '04', 'forever', null, 'pgTAP')$$,
  'P0001', 'Invalid admin session end reason', 'unknown end reasons are rejected');
select is(public.end_admin_session(repeat('0', 62) || '07', 'signed-out', '127.0.0.1', 'pgTAP'), true, 'logout ends the session');
reset role;
select results_eq(
  $$select end_reason, (select metadata->>'reason' from public.admin_audit_log a where a.target = s.id::text and a.action = 'admin.session.ended')
      from public.admin_sessions s where s.id in ('a2b20000-0000-4000-8000-000000000012', 'a2b20000-0000-4000-8000-000000000007') order by s.id$$,
  $$values ('signed-out'::text, 'signed-out'::text), ('idle-expired'::text, 'idle-expired'::text)$$,
  'idle expiration and logout are audited with their reasons');
select throws_ok(
  $$select private.require_admin_account_session('a2b10000-0000-4000-8000-000000000001', 'a2b20000-0000-4000-8000-000000000007', false)$$,
  '42501', 'Active owner session required', 'a logged-out session is invalid immediately');

-- Emergency revocation still ends every session -------------------------------------------
update public.admin_sessions set step_up_at = started_at where id = 'a2b20000-0000-4000-8000-000000000002';
set local role service_role;
select throws_ok(
  $$select public.set_platform_feature_flag('a2b10000-0000-4000-8000-000000000001', 'a2b20000-0000-4000-8000-000000000002', 'admin-emergency-disabled', true, null,
      'Emergency verification', (select version from public.platform_feature_flags where flag_key = 'admin-emergency-disabled'))$$,
  '42501', 'Fresh owner reauthentication required', 'emergency controls need a fresh step-up');
select lives_ok(
  $$select public.set_platform_feature_flag('a2b10000-0000-4000-8000-000000000001', 'a2b20000-0000-4000-8000-000000000001', 'admin-emergency-disabled', true, null,
      'Emergency verification', (select version from public.platform_feature_flags where flag_key = 'admin-emergency-disabled'))$$,
  'a freshly stepped-up owner can trigger the emergency switch');
reset role;
select is(
  (select count(*)::int from public.admin_sessions where ended_at is null and revoked_at is null),
  0, 'the emergency switch still revokes every live admin session');

-- Privileges ---------------------------------------------------------------------------
select results_eq(
  $$select signature,
      has_function_privilege('anon', signature, 'EXECUTE'),
      has_function_privilege('authenticated', signature, 'EXECUTE'),
      has_function_privilege('service_role', signature, 'EXECUTE'),
      (select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid = signature::regprocedure)
    from (values
      ('public.begin_admin_account_operation(uuid,uuid,uuid,text,text,text)'),
      ('public.record_admin_step_up(uuid,uuid,text,text)'),
      ('public.touch_admin_session(text)')
    ) functions(signature) order by signature$$,
  $$values
    ('public.begin_admin_account_operation(uuid,uuid,uuid,text,text,text)'::text, false, false, true, true),
    ('public.record_admin_step_up(uuid,uuid,text,text)'::text, false, false, true, true),
    ('public.touch_admin_session(text)'::text, false, false, true, true)$$,
  'the new session functions are server-only security definers with a pinned search_path');
select is(
  coalesce((select bool_or(acl.grantee = 0 and acl.privilege_type = 'EXECUTE') from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    where p.oid in ('public.begin_admin_account_operation(uuid,uuid,uuid,text,text,text)'::regprocedure,
      'public.record_admin_step_up(uuid,uuid,text,text)'::regprocedure, 'public.touch_admin_session(text)'::regprocedure)), false),
  false, 'PUBLIC cannot execute the new session functions');
select is(has_table_privilege('service_role', 'public.admin_sessions', 'UPDATE'), false, 'sessions still change only through bounded functions');

select * from finish();
rollback;
