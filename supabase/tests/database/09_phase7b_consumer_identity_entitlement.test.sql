begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
\set phase7d_identity_model 'consumer-v1'
\ir ../helpers/select-identity-model.psql

select has_table('public', 'consumer_accounts', 'minimal consumer accounts exist');
select has_table('public', 'consumer_game_entitlements', 'server-owned game entitlements exist');
select has_table('public', 'consumer_account_deletion_requests', 'consumer deletion requests exist');
select hasnt_column('public', 'consumer_accounts', 'email', 'email is not duplicated outside Auth');
select hasnt_column('public', 'consumer_accounts', 'display_name', 'consumer account collects no display name');
select hasnt_column('public', 'consumer_accounts', 'role', 'consumer account has no role');
select hasnt_column('public', 'consumer_accounts', 'school_or_organization_label', 'consumer account has no organization label');
select results_eq(
  $$select identity_model from private.platform_identity_policy where singleton$$,
  $$values ('consumer-v1'::text)$$,
  'consumer entitlement fixtures explicitly select the consumer identity model'
);

set local role service_role;
select lives_ok(
  $$select public.set_platform_identity_model('consumer-v1')$$,
  'service-only setup selects consumer identity for an isolated Production project'
);
reset role;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data
) values
  ('90000000-0000-0000-0000-000000000001','authenticated','authenticated','consumer-a@example.invalid',crypt('ConsumerPass123',gen_salt('bf')),now(),'{"display_name":"Forged Teacher","role":"teacher","school_or_organization_label":"Forged School","grade":"7","progress":100}'),
  ('90000000-0000-0000-0000-000000000002','authenticated','authenticated','consumer-b@example.invalid',crypt('ConsumerPass123',gen_salt('bf')),now(),'{"role":"student","class":"Forged Class"}');

select results_eq(
  $$select count(*)::bigint from public.consumer_accounts where user_id in ('90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000002')$$,
  $$values (2::bigint)$$,
  'consumer mode provisions one minimal account per Auth user'
);
select results_eq(
  $$select count(*)::bigint from public.teacher_profiles where user_id in ('90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000002')$$,
  $$values (0::bigint)$$,
  'consumer mode cannot create teacher profiles'
);
select results_eq(
  $$select count(*)::bigint from public.teacher_classes where owner_teacher_id in ('90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000002')$$,
  $$values (0::bigint)$$,
  'consumer mode creates no classes'
);
select results_eq(
  $$select count(*)::bigint from public.teacher_activities where owner_teacher_id in ('90000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000002')$$,
  $$values (0::bigint)$$,
  'consumer mode creates no activities or progress'
);

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"90000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select results_eq(
  $$select user_id from public.consumer_accounts$$,
  $$values ('90000000-0000-0000-0000-000000000001'::uuid)$$,
  'account A sees only its own minimal account'
);
select throws_ok(
  $$insert into public.consumer_accounts (user_id) values ('90000000-0000-0000-0000-000000000001')$$,
  '42501', null, 'browser cannot create an account projection'
);
select throws_ok(
  $$update public.consumer_accounts set trial_redeemed_at=now() where user_id='90000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'browser cannot start or extend a trial'
);
select throws_ok(
  $$insert into public.consumer_game_entitlements (user_id,entitlement_state) values ('90000000-0000-0000-0000-000000000001','subscription-active')$$,
  '42501', null, 'browser cannot forge game entitlement'
);
reset role;

set local role service_role;
select lives_ok(
  $$update public.consumer_accounts set trial_redeemed_at=created_at where user_id='90000000-0000-0000-0000-000000000001'$$,
  'service can record the one trial exactly once'
);
select throws_ok(
  $$update public.consumer_accounts set trial_redeemed_at=trial_redeemed_at + interval '1 second' where user_id='90000000-0000-0000-0000-000000000001'$$,
  '23514', 'consumer_trial_redemption_is_immutable', 'trial redemption cannot be replayed or extended'
);
select lives_ok(
  $$insert into public.consumer_game_entitlements (user_id,entitlement_state,trial_started_at,trial_ends_at) values ('90000000-0000-0000-0000-000000000001','trial-active',now(),now()+interval '24 hours')$$,
  'exact 24-hour trial evidence is accepted from the server role'
);
select throws_ok(
  $$insert into public.consumer_game_entitlements (user_id,entitlement_state,trial_started_at,trial_ends_at) values ('90000000-0000-0000-0000-000000000002','trial-active',now(),now()+interval '25 hours')$$,
  '23514', null, 'a browser-independent database constraint rejects trial extension'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"90000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select is_empty(
  $$select * from public.consumer_game_entitlements$$,
  'account B cannot read account A entitlement'
);
select lives_ok(
  $$select public.request_own_consumer_account_deletion()$$,
  'account B may request deletion without browser-controlled status'
);
select results_eq(
  $$select account_status from public.consumer_accounts$$,
  $$values ('deletion_pending'::text)$$,
  'deletion request applies the server-owned account override'
);
reset role;

set local role authenticated;
select throws_ok(
  $$select public.set_platform_identity_model('legacy-preview')$$,
  '42501', null, 'browser roles cannot switch the project identity model'
);
reset role;

select * from finish();
rollback;
\ir ../helpers/assert-identity-model-restored.psql
