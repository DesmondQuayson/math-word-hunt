begin;
create extension if not exists pgtap with schema extensions;
select plan(4);
\set phase7d_identity_model 'consumer-v1'
\ir ../helpers/select-identity-model.psql

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data
) values (
  'fa000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
  'deleted-admin-audit@example.invalid', crypt('AdminPass123', gen_salt('bf')), now(), '{}'
);

insert into public.admin_users (id, user_id, role) values (
  'fa100000-0000-0000-0000-000000000001',
  'fa000000-0000-0000-0000-000000000001', 'owner'
);

set local role service_role;
select lives_ok(
  $$select public.record_admin_audit_event(
    'fa100000-0000-0000-0000-000000000001',
    'admin.session.started', null, '{}', null, 'pgTAP'
  )$$,
  'audit evidence is recorded against the synthetic admin identity'
);
reset role;

select throws_ok(
  $$update public.admin_audit_log
      set admin_user_id = null
      where admin_user_id = 'fa100000-0000-0000-0000-000000000001'$$,
  'P0001', 'admin_audit_log is append-only',
  'a direct actor-reference rewrite is still rejected'
);

select lives_ok(
  $$delete from auth.users where id = 'fa000000-0000-0000-0000-000000000001'$$,
  'deleting an auth identity can cascade through the protected admin boundary'
);

select results_eq(
  $$select action, admin_user_id is null
      from public.admin_audit_log
      where action = 'admin.session.started' and user_agent = 'pgTAP'$$,
  $$values ('admin.session.started'::text, true)$$,
  'the immutable audit event remains while its deleted actor reference is anonymized'
);

select * from finish();
rollback;
\ir ../helpers/assert-identity-model-restored.psql
