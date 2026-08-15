-- Phase 8G adds bounded owner operations around consumer accounts. It never
-- exposes raw Auth, billing, or entitlement tables as an admin editor.

create table public.admin_account_operations (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique check (idempotency_key ~ '^[A-Za-z0-9:_-]{16,160}$'),
  admin_user_id uuid references public.admin_users(id) on delete set null,
  admin_session_id uuid references public.admin_sessions(id) on delete set null,
  target_user_id uuid not null,
  operation text not null check (operation in (
    'resend-confirmation','revoke-sessions','suspend','restore','open-portal',
    'cancel-at-period-end','submit-refund-review','deny-refund-review',
    'grant-complimentary','remove-complimentary','emergency-revoke'
  )),
  operation_state text not null default 'prepared'
    check (operation_state in ('prepared','succeeded','failed','manual_review')),
  reason text check (reason is null or (reason=btrim(reason) and char_length(reason) between 3 and 500)),
  before_snapshot jsonb not null check (jsonb_typeof(before_snapshot)='object' and octet_length(before_snapshot::text)<=4096),
  after_snapshot jsonb check (after_snapshot is null or (jsonb_typeof(after_snapshot)='object' and octet_length(after_snapshot::text)<=4096)),
  error_code text check (error_code is null or error_code ~ '^[a-z0-9][a-z0-9._-]{2,79}$'),
  created_at timestamptz not null default statement_timestamp(),
  completed_at timestamptz,
  check ((operation_state='prepared')=(completed_at is null))
);
create index admin_account_operations_target_idx on public.admin_account_operations(target_user_id,created_at desc);

create table public.admin_user_support_notes (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null,
  admin_user_id uuid references public.admin_users(id) on delete set null,
  note text not null check (note=btrim(note) and char_length(note) between 3 and 1000),
  created_at timestamptz not null default statement_timestamp()
);
create index admin_user_support_notes_target_idx on public.admin_user_support_notes(target_user_id,created_at desc);

create table public.consumer_complimentary_entitlements (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.consumer_accounts(user_id) on delete cascade,
  granted_by_admin_id uuid references public.admin_users(id) on delete set null,
  reason text not null check (reason=btrim(reason) and char_length(reason) between 3 and 500),
  starts_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by_admin_id uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  check (expires_at>starts_at and expires_at<=starts_at+interval '90 days'),
  check ((revoked_at is null)=(revoked_by_admin_id is null)),
  check (revoked_at is null or revoked_at>=starts_at)
);
create unique index consumer_complimentary_one_unrevoked_idx
  on public.consumer_complimentary_entitlements(owner_user_id) where revoked_at is null;

alter table public.admin_account_operations enable row level security;
alter table public.admin_account_operations force row level security;
alter table public.admin_user_support_notes enable row level security;
alter table public.admin_user_support_notes force row level security;
alter table public.consumer_complimentary_entitlements enable row level security;
alter table public.consumer_complimentary_entitlements force row level security;
revoke all on table public.admin_account_operations,public.admin_user_support_notes,
  public.consumer_complimentary_entitlements from public,anon,authenticated,service_role;
grant select on table public.admin_account_operations,public.admin_user_support_notes,
  public.consumer_complimentary_entitlements to service_role;

create or replace function private.require_admin_account_session(
  p_admin_user_id uuid,p_admin_session_id uuid,p_require_fresh boolean
) returns void language plpgsql security invoker set search_path='' as $$
begin
  if not exists(
    select 1 from public.admin_users au join public.admin_sessions s on s.admin_user_id=au.id
    where au.id=p_admin_user_id and au.role='owner' and au.revoked_at is null and au.mfa_enrolled
      and s.id=p_admin_session_id and s.assurance_level='aal2' and s.ended_at is null
      and s.revoked_at is null and s.expires_at>statement_timestamp()
      and (not p_require_fresh or s.started_at>=statement_timestamp()-interval '5 minutes')
  ) then raise insufficient_privilege using message=case when p_require_fresh then 'Fresh owner reauthentication required' else 'Active owner session required' end;
  end if;
end;$$;
revoke all on function private.require_admin_account_session(uuid,uuid,boolean) from public,anon,authenticated,service_role;

create or replace function private.admin_consumer_snapshot(p_target_user_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object(
    'account_status',a.account_status,
    'email_confirmed',a.email_confirmed_at is not null,
    'deletion_requested',a.deletion_requested_at is not null,
    'entitlement_state',coalesce(e.entitlement_state,'no-entitlement'),
    'subscription_state',coalesce(s.subscription_status,'none'),
    'complimentary_active',coalesce(c.active,false)
  )
  from public.consumer_accounts a
  left join public.consumer_game_entitlements e on e.user_id=a.user_id
  left join lateral(select subscription_status from public.billing_subscriptions where owner_consumer_id=a.user_id order by updated_at desc limit 1)s on true
  left join lateral(select true active from public.consumer_complimentary_entitlements where owner_user_id=a.user_id and revoked_at is null and expires_at>statement_timestamp() limit 1)c on true
  where a.user_id=p_target_user_id;
$$;
revoke all on function private.admin_consumer_snapshot(uuid) from public,anon,authenticated,service_role;

create or replace function public.prepare_admin_account_operation(
  p_admin_user_id uuid,p_admin_session_id uuid,p_target_user_id uuid,p_operation text,
  p_idempotency_key text,p_reason text
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_sensitive boolean;v_before jsonb;
begin
  v_sensitive:=p_operation in ('revoke-sessions','suspend','restore','deny-refund-review','grant-complimentary','remove-complimentary','emergency-revoke');
  if p_operation not in ('resend-confirmation','revoke-sessions','suspend','restore','open-portal','cancel-at-period-end','submit-refund-review','deny-refund-review','grant-complimentary','remove-complimentary','emergency-revoke')
    or p_idempotency_key!~'^[A-Za-z0-9:_-]{16,160}$' then raise exception 'Invalid bounded account operation';end if;
  perform private.require_admin_account_session(p_admin_user_id,p_admin_session_id,v_sensitive);
  if exists(select 1 from public.admin_users where user_id=p_target_user_id and revoked_at is null) then raise exception 'Active admin identities require the emergency admin revocation workflow';end if;
  if v_sensitive and (btrim(coalesce(p_reason,''))='' or char_length(btrim(p_reason))>500) then raise exception 'A bounded operation reason is required';end if;
  v_before:=private.admin_consumer_snapshot(p_target_user_id);
  if v_before is null then raise exception 'Consumer account not found';end if;
  insert into public.admin_account_operations(idempotency_key,admin_user_id,admin_session_id,target_user_id,operation,reason,before_snapshot)
    values(p_idempotency_key,p_admin_user_id,p_admin_session_id,p_target_user_id,p_operation,nullif(btrim(coalesce(p_reason,'')),''),v_before)
    on conflict(idempotency_key) do nothing returning id into v_id;
  if v_id is null then
    select id into v_id from public.admin_account_operations where idempotency_key=p_idempotency_key
      and admin_user_id=p_admin_user_id and target_user_id=p_target_user_id and operation=p_operation;
    if v_id is null then raise exception 'Idempotency ownership conflict';end if;
  else
    insert into public.admin_audit_log(admin_user_id,action,target,metadata)
      values(p_admin_user_id,'admin.account.operation.prepared',p_target_user_id::text,jsonb_build_object('operation',p_operation,'operation_id',v_id));
  end if;
  return v_id;
end;$$;
revoke all on function public.prepare_admin_account_operation(uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.prepare_admin_account_operation(uuid,uuid,uuid,text,text,text) to service_role;

create or replace function public.finish_admin_account_operation(
  p_admin_user_id uuid,p_admin_session_id uuid,p_operation_id uuid,p_outcome text,p_error_code text
) returns void language plpgsql security definer set search_path='' as $$
declare v_operation public.admin_account_operations%rowtype;v_after jsonb;
begin
  perform private.require_admin_account_session(p_admin_user_id,p_admin_session_id,false);
  if p_outcome not in ('succeeded','failed','manual_review') or (p_error_code is not null and p_error_code!~'^[a-z0-9][a-z0-9._-]{2,79}$') then raise exception 'Invalid operation outcome';end if;
  select * into v_operation from public.admin_account_operations where id=p_operation_id and admin_user_id=p_admin_user_id for update;
  if not found then raise exception 'Admin operation not found';end if;
  if v_operation.operation_state<> 'prepared' then return;end if;
  v_after:=private.admin_consumer_snapshot(v_operation.target_user_id);
  update public.admin_account_operations set operation_state=p_outcome,after_snapshot=v_after,error_code=p_error_code,completed_at=statement_timestamp() where id=p_operation_id;
  insert into public.admin_audit_log(admin_user_id,action,target,metadata)
    values(p_admin_user_id,'admin.account.operation.'||p_outcome,v_operation.target_user_id::text,jsonb_build_object('operation',v_operation.operation,'operation_id',p_operation_id,'error_code',p_error_code));
end;$$;
revoke all on function public.finish_admin_account_operation(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.finish_admin_account_operation(uuid,uuid,uuid,text,text) to service_role;

create or replace function public.set_admin_consumer_account_status(
  p_admin_user_id uuid,p_admin_session_id uuid,p_operation_id uuid,p_target_user_id uuid,p_status text
) returns text language plpgsql security definer set search_path='' as $$
declare v_operation text;v_current text;
begin
  perform private.require_admin_account_session(p_admin_user_id,p_admin_session_id,true);
  select operation into v_operation from public.admin_account_operations where id=p_operation_id and admin_user_id=p_admin_user_id and target_user_id=p_target_user_id and operation_state='prepared';
  if v_operation is null or p_status not in ('active','suspended') or
    (v_operation='restore' and p_status<>'active') or (v_operation in ('suspend','emergency-revoke') and p_status<>'suspended') then raise exception 'Prepared status operation required';end if;
  select account_status into v_current from public.consumer_accounts where user_id=p_target_user_id for update;
  if v_current='deletion_pending' then raise exception 'Deletion-pending accounts cannot be restored or overwritten';end if;
  update public.consumer_accounts set account_status=p_status where user_id=p_target_user_id;
  if v_operation='emergency-revoke' then
    update public.consumer_complimentary_entitlements set revoked_at=coalesce(revoked_at,statement_timestamp()),revoked_by_admin_id=coalesce(revoked_by_admin_id,p_admin_user_id) where owner_user_id=p_target_user_id and revoked_at is null;
    update public.consumer_game_entitlements set entitlement_state='subscription-expired',trial_started_at=null,trial_ends_at=null,grace_ends_at=null,current_period_ends_at=coalesce(current_period_ends_at,statement_timestamp()),authoritative_version=authoritative_version+1 where user_id=p_target_user_id;
  end if;
  return p_status;
end;$$;
revoke all on function public.set_admin_consumer_account_status(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.set_admin_consumer_account_status(uuid,uuid,uuid,uuid,text) to service_role;

create or replace function public.revoke_admin_consumer_sessions(
  p_admin_user_id uuid,p_admin_session_id uuid,p_operation_id uuid,p_target_user_id uuid
) returns integer language plpgsql security definer set search_path='' as $$
declare v_operation text;v_count integer;
begin
  perform private.require_admin_account_session(p_admin_user_id,p_admin_session_id,true);
  select operation into v_operation from public.admin_account_operations where id=p_operation_id and admin_user_id=p_admin_user_id and target_user_id=p_target_user_id and operation_state='prepared';
  if v_operation not in ('revoke-sessions','suspend','emergency-revoke') then raise exception 'Prepared session revocation required';end if;
  if exists(select 1 from public.admin_users where user_id=p_target_user_id and revoked_at is null) then raise exception 'Active admin sessions require the emergency admin revocation workflow';end if;
  delete from auth.sessions where user_id=p_target_user_id;
  get diagnostics v_count=row_count;
  return v_count;
end;$$;
revoke all on function public.revoke_admin_consumer_sessions(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.revoke_admin_consumer_sessions(uuid,uuid,uuid,uuid) to service_role;

create or replace function public.grant_admin_complimentary_entitlement(
  p_admin_user_id uuid,p_admin_session_id uuid,p_operation_id uuid,p_target_user_id uuid,p_expires_at timestamptz
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_reason text;v_id uuid;
begin
  perform private.require_admin_account_session(p_admin_user_id,p_admin_session_id,true);
  select reason into v_reason from public.admin_account_operations where id=p_operation_id and admin_user_id=p_admin_user_id and target_user_id=p_target_user_id and operation='grant-complimentary' and operation_state='prepared';
  if v_reason is null or p_expires_at<=statement_timestamp()+interval '1 hour' or p_expires_at>statement_timestamp()+interval '90 days' then raise exception 'Prepared bounded complimentary grant required';end if;
  update public.consumer_complimentary_entitlements set revoked_at=statement_timestamp(),revoked_by_admin_id=p_admin_user_id where owner_user_id=p_target_user_id and revoked_at is null and expires_at<=statement_timestamp();
  insert into public.consumer_complimentary_entitlements(owner_user_id,granted_by_admin_id,reason,expires_at) values(p_target_user_id,p_admin_user_id,v_reason,p_expires_at) returning id into v_id;
  return v_id;
end;$$;
revoke all on function public.grant_admin_complimentary_entitlement(uuid,uuid,uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.grant_admin_complimentary_entitlement(uuid,uuid,uuid,uuid,timestamptz) to service_role;

create or replace function public.revoke_admin_complimentary_entitlement(
  p_admin_user_id uuid,p_admin_session_id uuid,p_operation_id uuid,p_target_user_id uuid
) returns boolean language plpgsql security definer set search_path='' as $$
begin
  perform private.require_admin_account_session(p_admin_user_id,p_admin_session_id,true);
  if not exists(select 1 from public.admin_account_operations where id=p_operation_id and admin_user_id=p_admin_user_id and target_user_id=p_target_user_id and operation='remove-complimentary' and operation_state='prepared') then raise exception 'Prepared complimentary revocation required';end if;
  update public.consumer_complimentary_entitlements set revoked_at=statement_timestamp(),revoked_by_admin_id=p_admin_user_id where owner_user_id=p_target_user_id and revoked_at is null;
  return found;
end;$$;
revoke all on function public.revoke_admin_complimentary_entitlement(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.revoke_admin_complimentary_entitlement(uuid,uuid,uuid,uuid) to service_role;

create or replace function public.add_admin_user_support_note(
  p_admin_user_id uuid,p_admin_session_id uuid,p_target_user_id uuid,p_note text
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  perform private.require_admin_account_session(p_admin_user_id,p_admin_session_id,false);
  if not exists(select 1 from public.consumer_accounts where user_id=p_target_user_id) or btrim(coalesce(p_note,''))='' or char_length(btrim(p_note))>1000 then raise exception 'Invalid support note';end if;
  insert into public.admin_user_support_notes(target_user_id,admin_user_id,note) values(p_target_user_id,p_admin_user_id,btrim(p_note)) returning id into v_id;
  insert into public.admin_audit_log(admin_user_id,action,target,metadata) values(p_admin_user_id,'admin.account.support-note.added',p_target_user_id::text,jsonb_build_object('note_id',v_id));
  return v_id;
end;$$;
revoke all on function public.add_admin_user_support_note(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.add_admin_user_support_note(uuid,uuid,uuid,text) to service_role;

create or replace function public.submit_admin_refund_review(
  p_admin_user_id uuid,p_admin_session_id uuid,p_operation_id uuid,p_target_user_id uuid
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_subscription_id uuid;v_request_id uuid;
begin
  perform private.require_admin_account_session(p_admin_user_id,p_admin_session_id,false);
  if not exists(select 1 from public.admin_account_operations where id=p_operation_id and admin_user_id=p_admin_user_id and target_user_id=p_target_user_id and operation='submit-refund-review' and operation_state='prepared') then raise exception 'Prepared refund review required';end if;
  select id into v_subscription_id from public.billing_subscriptions where owner_consumer_id=p_target_user_id and first_paid_at is not null and first_paid_at>=statement_timestamp()-interval '7 days' order by first_paid_at desc limit 1;
  if v_subscription_id is null then raise exception 'No verified eligible first charge';end if;
  insert into public.consumer_refund_requests(owner_user_id,billing_subscription_id) values(p_target_user_id,v_subscription_id)
    on conflict(owner_user_id,billing_subscription_id) do update set owner_user_id=excluded.owner_user_id returning id into v_request_id;
  return v_request_id;
end;$$;
revoke all on function public.submit_admin_refund_review(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.submit_admin_refund_review(uuid,uuid,uuid,uuid) to service_role;

create or replace function public.deny_admin_refund_review(
  p_admin_user_id uuid,p_admin_session_id uuid,p_operation_id uuid,p_target_user_id uuid,p_request_id uuid
) returns boolean language plpgsql security definer set search_path='' as $$
begin
  perform private.require_admin_account_session(p_admin_user_id,p_admin_session_id,true);
  if not exists(select 1 from public.admin_account_operations where id=p_operation_id and admin_user_id=p_admin_user_id and target_user_id=p_target_user_id and operation='deny-refund-review' and operation_state='prepared') then raise exception 'Prepared refund decision required';end if;
  update public.consumer_refund_requests set request_status='declined',resolved_at=statement_timestamp() where id=p_request_id and owner_user_id=p_target_user_id and request_status in('requested','reviewing');
  return found;
end;$$;
revoke all on function public.deny_admin_refund_review(uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.deny_admin_refund_review(uuid,uuid,uuid,uuid,uuid) to service_role;

create or replace function public.get_own_active_complimentary_entitlement()
returns table(expires_at timestamptz) language sql stable security definer set search_path='' as $$
  select c.expires_at from public.consumer_complimentary_entitlements c
  join public.consumer_accounts a on a.user_id=c.owner_user_id
  where c.owner_user_id=(select auth.uid()) and a.account_status='active'
    and c.revoked_at is null and c.expires_at>statement_timestamp() order by c.expires_at desc limit 1;
$$;
revoke all on function public.get_own_active_complimentary_entitlement() from public,anon;
grant execute on function public.get_own_active_complimentary_entitlement() to authenticated;

create or replace function private.reject_phase8g_evidence_mutation()
returns trigger language plpgsql security invoker set search_path='' as $$begin raise exception 'Phase 8G evidence is append-only';end;$$;
revoke all on function private.reject_phase8g_evidence_mutation() from public,anon,authenticated,service_role;
create trigger admin_user_support_notes_immutable before update or delete on public.admin_user_support_notes for each row execute function private.reject_phase8g_evidence_mutation();

comment on table public.admin_account_operations is 'Bounded, idempotent Phase 8G operation evidence. Provider URLs, tokens, secrets, full IPs, and payment details are prohibited.';
comment on table public.consumer_complimentary_entitlements is 'Time-limited owner grants independent of authoritative Stripe billing projections.';
