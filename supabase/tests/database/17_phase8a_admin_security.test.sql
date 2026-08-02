begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
\set phase7d_identity_model 'consumer-v1'
\ir ../helpers/select-identity-model.psql

select has_table('public', 'admin_users', 'admin identity allowlist exists');
select has_table('public', 'admin_sessions', 'server-owned admin sessions exist');
select has_table('public', 'admin_audit_log', 'append-only admin audit ledger exists');
select has_table('public', 'admin_auth_rate_limits', 'persistent admin rate limits exist');

select results_eq(
  $$select relname, relrowsecurity, relforcerowsecurity from pg_class
    where oid in ('public.admin_users'::regclass, 'public.admin_sessions'::regclass,
      'public.admin_audit_log'::regclass, 'public.admin_auth_rate_limits'::regclass)
    order by relname$$,
  $$values
    ('admin_audit_log'::name, true, true),
    ('admin_auth_rate_limits'::name, true, true),
    ('admin_sessions'::name, true, true),
    ('admin_users'::name, true, true)$$,
  'every admin table has enabled and forced RLS'
);

select results_eq(
  $$select role_name, table_name, privilege, has_table_privilege(role_name, table_name, privilege)
    from (values
      ('anon'::name, 'public.admin_users'::text, 'SELECT'::text),
      ('anon'::name, 'public.admin_audit_log'::text, 'INSERT'::text),
      ('authenticated'::name, 'public.admin_users'::text, 'SELECT'::text),
      ('authenticated'::name, 'public.admin_audit_log'::text, 'SELECT'::text),
      ('authenticated'::name, 'public.admin_sessions'::text, 'INSERT'::text),
      ('authenticated'::name, 'public.admin_auth_rate_limits'::text, 'UPDATE'::text)
    ) expected(role_name, table_name, privilege)$$,
  $$select role_name, table_name, privilege, false
    from (values
      ('anon'::name, 'public.admin_users'::text, 'SELECT'::text),
      ('anon'::name, 'public.admin_audit_log'::text, 'INSERT'::text),
      ('authenticated'::name, 'public.admin_users'::text, 'SELECT'::text),
      ('authenticated'::name, 'public.admin_audit_log'::text, 'SELECT'::text),
      ('authenticated'::name, 'public.admin_sessions'::text, 'INSERT'::text),
      ('authenticated'::name, 'public.admin_auth_rate_limits'::text, 'UPDATE'::text)
    ) expected(role_name, table_name, privilege)$$,
  'browser database roles have no admin data privileges'
);

select results_eq(
  $$select privilege, has_table_privilege('service_role', 'public.admin_audit_log', privilege)
    from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) privilege$$,
  $$values ('SELECT'::text,true),('INSERT'::text,false),('UPDATE'::text,false),('DELETE'::text,false),('TRUNCATE'::text,false)$$,
  'service role can inspect audit evidence but may append only through the bounded function'
);

select results_eq(
  $$select table_name, privilege, has_table_privilege('service_role', table_name, privilege)
    from (values
      ('public.admin_users'::text, 'UPDATE'::text),
      ('public.admin_sessions'::text, 'INSERT'::text),
      ('public.admin_sessions'::text, 'UPDATE'::text),
      ('public.admin_auth_rate_limits'::text, 'SELECT'::text)
    ) checks(table_name, privilege)$$,
  $$select table_name, privilege, false from (values
      ('public.admin_users'::text, 'UPDATE'::text),
      ('public.admin_sessions'::text, 'INSERT'::text),
      ('public.admin_sessions'::text, 'UPDATE'::text),
      ('public.admin_auth_rate_limits'::text, 'SELECT'::text)
    ) checks(table_name, privilege)$$,
  'service role must use bounded security-definer operations for every mutation'
);

select ok(
  has_function_privilege('service_role', 'public.revoke_admin_access(uuid,text,text,text)', 'EXECUTE'),
  'service role can invoke emergency revocation'
);
select ok(
  not has_function_privilege('authenticated', 'public.revoke_admin_access(uuid,text,text,text)', 'EXECUTE'),
  'authenticated users cannot invoke emergency revocation'
);

select results_eq(
  $$select id, public from storage.buckets where id = 'admin-assets'$$,
  $$values ('admin-assets'::text, false)$$,
  'future admin asset bucket is private from creation'
);
select results_eq(
  $$select count(*)::bigint from pg_policies where schemaname = 'storage'
    and policyname like 'admin_assets_%'$$,
  $$values (5::bigint)$$,
  'admin storage has explicit restrictive bucket and object policies'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data
) values (
  'f8000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
  'phase8a-owner@example.invalid', crypt('AdminPass123', gen_salt('bf')), now(), '{}'
);
insert into public.admin_users (id, user_id, role) values (
  'f8100000-0000-0000-0000-000000000001',
  'f8000000-0000-0000-0000-000000000001', 'owner'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$select * from public.admin_users$$, '42501', null, 'anonymous user cannot read the admin allowlist');
select throws_ok($$insert into public.admin_audit_log(action) values ('admin.forged')$$, '42501', null, 'anonymous user cannot forge audit events');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f8000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}', true);
select throws_ok($$select * from public.admin_users$$, '42501', null, 'even an AAL2 owner identity cannot query admin authorization client-side');
select throws_ok($$select public.mark_admin_mfa_enrolled('f8100000-0000-0000-0000-000000000001')$$, '42501', null, 'browser cannot promote its own MFA enrollment state');
reset role;

set local role service_role;
select lives_ok(
  $$select public.record_admin_audit_event(null, 'admin.login.failure', null, '{"reason":"credentials"}', '127.0.0.1', 'pgTAP')$$,
  'server can record a failed login without identifying an account'
);
select lives_ok(
  $$select public.mark_admin_mfa_enrolled('f8100000-0000-0000-0000-000000000001')$$,
  'server can mark verified MFA enrollment'
);
select lives_ok(
  $$select public.record_admin_audit_event('f8100000-0000-0000-0000-000000000001', 'admin.mfa.failure', null, '{"reason":"verification"}', null, 'pgTAP')$$,
  'server records failed MFA verification'
);
select lives_ok(
  $$select public.start_admin_session('f8100000-0000-0000-0000-000000000001', repeat('a',64), now() + interval '15 minutes', '127.0.0.1', 'pgTAP')$$,
  'server starts a short AAL2 admin session after MFA enrollment'
);
select lives_ok(
  $$select public.start_admin_session('f8100000-0000-0000-0000-000000000001', repeat('b',64), now() + interval '15 minutes', '127.0.0.1', 'pgTAP')$$,
  'server can create a second independently revocable short session'
);
select results_eq(
  $$select public.end_admin_session(repeat('b',64), 'expired', '127.0.0.1', 'pgTAP')$$,
  $$values (true)$$,
  'expired admin session is ended server-side and audited'
);
select results_eq(
  $$select public.revoke_admin_access('f8000000-0000-0000-0000-000000000001', 'pgTAP emergency test', '127.0.0.1', 'pgTAP')$$,
  $$values (1)$$,
  'emergency revocation invalidates the pre-existing admin session atomically'
);
select results_eq(
  $$select (revoked_at is not null), mfa_enrolled from public.admin_users where id = 'f8100000-0000-0000-0000-000000000001'$$,
  $$values (true,true)$$,
  'revoked admin remains identified but inactive'
);
select results_eq(
  $$select (revoked_at is not null), (ended_at is not null), end_reason from public.admin_sessions where token_hash = repeat('a',64)$$,
  $$values (true,true,'emergency-revocation'::text)$$,
  'pre-existing session is immediately ended and revoked server-side'
);
select results_eq(
  $$select action from public.admin_audit_log where admin_user_id = 'f8100000-0000-0000-0000-000000000001' order by action$$,
  $$values ('admin.mfa.failure'::text),('admin.revoked'::text),('admin.session.ended'::text),('admin.session.started'::text),('admin.session.started'::text)$$,
  'MFA failure, session start/end, and revocation evidence are appended'
);
select throws_ok(
  $$select public.start_admin_session('f8100000-0000-0000-0000-000000000001', repeat('c',64), now() + interval '15 minutes', null, 'pgTAP')$$,
  'P0001', 'Active MFA-enrolled admin required',
  'revoked admin cannot start another session'
);
reset role;

set local role service_role;
select results_eq(
  $$select public.consume_admin_auth_rate_limit('login', repeat('d',64), 1, 300, 900)$$,
  $$values (true)$$,
  'first login attempt is allowed by the atomic rate limiter'
);
select results_eq(
  $$select public.consume_admin_auth_rate_limit('login', repeat('d',64), 1, 300, 900)$$,
  $$values (false)$$,
  'attempt beyond the configured limit is blocked'
);
select lives_ok(
  $$select public.clear_admin_auth_rate_limit('login', repeat('d',64))$$,
  'server can clear the pseudonymous rate-limit subject after successful verification'
);
reset role;

select throws_ok(
  $$update public.admin_audit_log set action = 'admin.tampered'$$,
  'P0001', 'admin_audit_log is append-only',
  'table owner cannot rewrite append-only audit evidence'
);
select throws_ok(
  $$delete from public.admin_audit_log$$,
  'P0001', 'admin_audit_log is append-only',
  'table owner cannot delete append-only audit evidence'
);
select throws_ok(
  $$update public.admin_users set revoked_at = null where id = 'f8100000-0000-0000-0000-000000000001'$$,
  'P0001', 'admin identity boundary is immutable',
  'even the table owner cannot reverse emergency revocation in place'
);

select * from finish();
rollback;
\ir ../helpers/assert-identity-model-restored.psql
