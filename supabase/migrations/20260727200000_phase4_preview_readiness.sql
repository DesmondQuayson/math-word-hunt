alter table public.account_deletion_requests
  add column lifecycle_state text not null default 'requested'
    check (lifecycle_state in ('requested','restricted','cooling_off','eligible','executing','completed','failed_manual_review')),
  add column restricted_at timestamptz,
  add column cooling_off_until timestamptz,
  add column idempotency_key text,
  add column last_error_code text check (last_error_code is null or last_error_code ~ '^[a-z0-9._-]{3,80}$');

update public.account_deletion_requests set idempotency_key = 'account-deletion:' || id::text;
alter table public.account_deletion_requests alter column idempotency_key set not null;
create unique index account_deletion_requests_idempotency_idx on public.account_deletion_requests (idempotency_key);

create or replace function private.set_deletion_idempotency_key()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.idempotency_key is null then new.idempotency_key := 'account-deletion:' || new.id::text; end if;
  return new;
end; $$;
create trigger account_deletion_request_idempotency before insert on public.account_deletion_requests
for each row execute function private.set_deletion_idempotency_key();

create table private.account_deletion_audit (
  id bigint generated always as identity primary key,
  request_id uuid not null,
  owner_fingerprint text not null check (owner_fingerprint ~ '^[0-9a-f]{64}$'),
  from_state text,
  to_state text not null,
  result_code text not null check (result_code ~ '^[a-z0-9._-]{3,80}$'),
  occurred_at timestamptz not null default now()
);
revoke all on table private.account_deletion_audit from public, anon, authenticated;
grant select, insert on table private.account_deletion_audit to service_role;
grant usage, select on sequence private.account_deletion_audit_id_seq to service_role;

create or replace function private.advance_account_deletion(check_request_id uuid, expected_owner uuid, next_state text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare current_state text; actual_owner uuid;
begin
  select lifecycle_state, owner_teacher_id into current_state, actual_owner
    from public.account_deletion_requests where id = check_request_id for update;
  if actual_owner is null or actual_owner <> expected_owner then raise exception using errcode='42501', message='Owner-scoped deletion request required'; end if;
  if next_state = 'executing' then raise exception using errcode='55000', message='destructive_execution_disabled'; end if;
  if not ((current_state='requested' and next_state='restricted') or (current_state='restricted' and next_state='cooling_off') or (current_state='cooling_off' and next_state='eligible') or (current_state='failed_manual_review' and next_state='eligible')) then
    raise exception using errcode='22023', message='invalid_deletion_transition';
  end if;
  update public.account_deletion_requests set lifecycle_state=next_state,
    restricted_at=case when next_state='restricted' then now() else restricted_at end
    where id=check_request_id;
  insert into private.account_deletion_audit(request_id,owner_fingerprint,from_state,to_state,result_code)
    values(check_request_id,encode(extensions.digest(expected_owner::text,'sha256'),'hex'),current_state,next_state,'transition.recorded');
  return next_state;
end; $$;
revoke all on function private.advance_account_deletion(uuid,uuid,text) from public, anon, authenticated;
grant usage on schema private to service_role;
grant execute on function private.advance_account_deletion(uuid,uuid,text) to service_role;

create or replace function public.plan_own_account_deletion()
returns table(request_id uuid, lifecycle_state text, idempotency_key text, destructive_execution_enabled boolean, action_count integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select id, d.lifecycle_state, d.idempotency_key, false, 5
  from public.account_deletion_requests d
  where owner_teacher_id=(select auth.uid()) and status='requested'
  order by requested_at desc limit 1
$$;
revoke all on function public.plan_own_account_deletion() from public, anon;
grant execute on function public.plan_own_account_deletion() to authenticated;
