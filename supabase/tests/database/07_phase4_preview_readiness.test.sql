begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users (id,aud,role,email,encrypted_password,email_confirmed_at,raw_user_meta_data) values
 ('70000000-0000-0000-0000-000000000001','authenticated','authenticated','phase4-owner@example.invalid',crypt('TeacherPass123',gen_salt('bf')),now(),'{"display_name":"Owner"}'),
 ('70000000-0000-0000-0000-000000000002','authenticated','authenticated','phase4-other@example.invalid',crypt('TeacherPass123',gen_salt('bf')),now(),'{"display_name":"Other"}');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"70000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
insert into public.account_deletion_requests(owner_teacher_id) values ('70000000-0000-0000-0000-000000000001');
select is((select lifecycle_state from public.plan_own_account_deletion()),'requested','Owner receives current lifecycle state');
select is((select destructive_execution_enabled from public.plan_own_account_deletion()),false,'Deletion plan is non-destructive');
select is((select action_count from public.plan_own_account_deletion()),5,'Deletion plan lists bounded actions');
select throws_ok($$update public.account_deletion_requests set lifecycle_state='completed' where owner_teacher_id='70000000-0000-0000-0000-000000000001'$$,'42501',null,'Browser cannot forge deletion state');
select is_empty($$select * from public.account_deletion_requests where owner_teacher_id='70000000-0000-0000-0000-000000000002'$$,'Cross-account request is invisible');
select set_config('request.jwt.claims','{"sub":"70000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select is_empty($$select * from public.plan_own_account_deletion()$$,'Other account cannot plan owner deletion');
reset role;
set local role service_role;
select lives_ok($$select private.advance_account_deletion((select id from public.account_deletion_requests where owner_teacher_id='70000000-0000-0000-0000-000000000001'),'70000000-0000-0000-0000-000000000001','restricted')$$,'Server operator can record staged restriction');
select throws_ok($$select private.advance_account_deletion((select id from public.account_deletion_requests where owner_teacher_id='70000000-0000-0000-0000-000000000001'),'70000000-0000-0000-0000-000000000002','cooling_off')$$,'42501','Owner-scoped deletion request required','Cross-account transition is denied');
select throws_ok($$select private.advance_account_deletion((select id from public.account_deletion_requests where owner_teacher_id='70000000-0000-0000-0000-000000000001'),'70000000-0000-0000-0000-000000000001','completed')$$,'22023','invalid_deletion_transition','State skipping is denied');
select lives_ok($$select private.advance_account_deletion((select id from public.account_deletion_requests where owner_teacher_id='70000000-0000-0000-0000-000000000001'),'70000000-0000-0000-0000-000000000001','cooling_off')$$,'Cooling-off can be recorded');
select lives_ok($$select private.advance_account_deletion((select id from public.account_deletion_requests where owner_teacher_id='70000000-0000-0000-0000-000000000001'),'70000000-0000-0000-0000-000000000001','eligible')$$,'Eligibility can be recorded after review');
select throws_ok($$select private.advance_account_deletion((select id from public.account_deletion_requests where owner_teacher_id='70000000-0000-0000-0000-000000000001'),'70000000-0000-0000-0000-000000000001','executing')$$,'55000','destructive_execution_disabled','Destructive execution is impossible in Phase 4');
select is((select count(*)::integer from private.account_deletion_audit),3,'Only successful transitions are audited');
reset role;
select has_function('public','plan_own_account_deletion',array[]::text[],'Dry-run plan function exists');
select function_privs_are('public','plan_own_account_deletion',array[]::text[], 'authenticated',array['EXECUTE'],'Only authenticated users can plan their own deletion');
select * from finish(); rollback;
