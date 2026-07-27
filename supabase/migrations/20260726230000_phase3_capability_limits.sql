-- Phase 3 keeps product limits provider-independent and enforces creation in a
-- single database transaction. Browser roles cannot edit policy or entitlement
-- state and can no longer insert constrained resources directly.
create table private.product_capability_policy (
  product_key text primary key check (product_key = 'math-vocabulary-hunt'),
  billing_environment text not null check (billing_environment in ('test', 'live')),
  free_active_class_limit integer not null check (free_active_class_limit between 0 and 1000),
  pro_active_class_limit integer not null check (pro_active_class_limit >= free_active_class_limit),
  free_active_activity_limit integer not null check (free_active_activity_limit between 0 and 1000),
  pro_active_activity_limit integer not null check (pro_active_activity_limit >= free_active_activity_limit),
  emergency_pro_deny boolean not null default false,
  updated_at timestamptz not null default now()
);
revoke all on table private.product_capability_policy from public, anon, authenticated;

insert into private.product_capability_policy (
  product_key, billing_environment, free_active_class_limit,
  pro_active_class_limit, free_active_activity_limit,
  pro_active_activity_limit, emergency_pro_deny
) values ('math-vocabulary-hunt', 'test', 2, 25, 3, 100, false);

create or replace function private.effective_teacher_plan(check_teacher_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when exists (
    select 1
    from public.teacher_profiles profile
    join public.product_entitlements entitlement
      on entitlement.teacher_user_id = profile.user_id
    join public.billing_subscriptions subscription
      on subscription.id = entitlement.billing_subscription_id
    join private.product_capability_policy policy
      on policy.product_key = entitlement.product_key
    where profile.user_id = check_teacher_id
      and profile.account_status = 'active'
      and policy.emergency_pro_deny = false
      and entitlement.product_key = 'math-vocabulary-hunt'
      and entitlement.scope = 'feature'
      and entitlement.feature_key = 'classroom-tools'
      and entitlement.status = 'active'
      and entitlement.source = 'subscription'
      and entitlement.starts_at <= statement_timestamp()
      and entitlement.expires_at > statement_timestamp()
      and subscription.owner_teacher_id = check_teacher_id
      and subscription.stripe_environment = policy.billing_environment
      and subscription.plan_key in ('teacher-pro-monthly', 'teacher-pro-annual')
      and subscription.subscription_status = 'active'
      and subscription.current_period_end > statement_timestamp()
  ) then (
    select subscription.plan_key
    from public.product_entitlements entitlement
    join public.billing_subscriptions subscription
      on subscription.id = entitlement.billing_subscription_id
    join private.product_capability_policy policy
      on policy.product_key = entitlement.product_key
    where entitlement.teacher_user_id = check_teacher_id
      and entitlement.product_key = 'math-vocabulary-hunt'
      and entitlement.scope = 'feature'
      and entitlement.feature_key = 'classroom-tools'
      and entitlement.status = 'active'
      and entitlement.source = 'subscription'
      and entitlement.starts_at <= statement_timestamp()
      and entitlement.expires_at > statement_timestamp()
      and subscription.owner_teacher_id = check_teacher_id
      and subscription.stripe_environment = policy.billing_environment
      and subscription.plan_key in ('teacher-pro-monthly', 'teacher-pro-annual')
      and subscription.subscription_status = 'active'
      and subscription.current_period_end > statement_timestamp()
    order by subscription.updated_at desc
    limit 1
  ) else 'free' end;
$$;
revoke all on function private.effective_teacher_plan(uuid) from public, anon, authenticated;

create or replace function public.get_teacher_capability_usage()
returns table (
  plan_key text,
  plan_expires_at timestamptz,
  active_class_count integer,
  active_class_limit integer,
  active_activity_count integer,
  active_activity_limit integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_plan text;
  v_expires_at timestamptz;
  v_policy private.product_capability_policy%rowtype;
begin
  if v_owner is null then raise insufficient_privilege using message = 'Authentication required'; end if;
  if not exists (
    select 1 from public.teacher_profiles
    where user_id = v_owner and account_status in ('active', 'suspended', 'deletion_requested')
  ) then raise insufficient_privilege using message = 'Teacher profile required'; end if;
  select * into strict v_policy from private.product_capability_policy where product_key = 'math-vocabulary-hunt';
  v_plan := private.effective_teacher_plan(v_owner);
  if v_plan <> 'free' then
    select least(entitlement.expires_at, subscription.current_period_end)
      into v_expires_at
    from public.product_entitlements entitlement
    join public.billing_subscriptions subscription on subscription.id = entitlement.billing_subscription_id
    where entitlement.teacher_user_id = v_owner
      and entitlement.product_key = 'math-vocabulary-hunt'
      and entitlement.scope = 'feature'
      and entitlement.feature_key = 'classroom-tools'
      and entitlement.status = 'active'
      and entitlement.source = 'subscription'
      and subscription.plan_key = v_plan
      and subscription.subscription_status = 'active'
    order by subscription.updated_at desc
    limit 1;
  end if;
  return query select
    v_plan,
    v_expires_at,
    (select count(*)::integer from public.teacher_classes where owner_teacher_id = v_owner and status = 'active'),
    case when v_plan = 'free' then v_policy.free_active_class_limit else v_policy.pro_active_class_limit end,
    (select count(*)::integer from public.teacher_activities where owner_teacher_id = v_owner and status in ('draft', 'ready')),
    case when v_plan = 'free' then v_policy.free_active_activity_limit else v_policy.pro_active_activity_limit end;
end;
$$;
revoke all on function public.get_teacher_capability_usage() from public, anon;
grant execute on function public.get_teacher_capability_usage() to authenticated;

create or replace function public.create_teacher_class(
  p_class_id uuid,
  p_class_name text,
  p_grade_level text default null,
  p_period_or_section text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_plan text;
  v_limit integer;
  v_count integer;
begin
  if v_owner is null then raise insufficient_privilege using message = 'Authentication required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text, 73001));
  if not exists (select 1 from public.teacher_profiles where user_id = v_owner and account_status = 'active') then
    raise insufficient_privilege using message = 'Active teacher account required';
  end if;
  v_plan := private.effective_teacher_plan(v_owner);
  select case when v_plan = 'free' then free_active_class_limit else pro_active_class_limit end
    into strict v_limit from private.product_capability_policy where product_key = 'math-vocabulary-hunt';
  select count(*)::integer into v_count from public.teacher_classes where owner_teacher_id = v_owner and status = 'active';
  if v_count >= v_limit then raise exception using errcode = 'P0001', message = 'capability_limit_reached:class.create'; end if;
  insert into public.teacher_classes (id, owner_teacher_id, class_name, grade_level, period_or_section)
    values (p_class_id, v_owner, p_class_name, p_grade_level, p_period_or_section);
  return p_class_id;
end;
$$;
revoke all on function public.create_teacher_class(uuid, text, text, text) from public, anon;
grant execute on function public.create_teacher_class(uuid, text, text, text) to authenticated;

create or replace function public.create_teacher_activity(
  p_activity_id uuid,
  p_class_id uuid,
  p_grade_level text,
  p_topic_key text,
  p_lesson_key text,
  p_game_mode_key text,
  p_time_limit_minutes integer,
  p_team_count integer,
  p_combine_mode_enabled boolean
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_plan text;
  v_limit integer;
  v_count integer;
begin
  if v_owner is null then raise insufficient_privilege using message = 'Authentication required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text, 73002));
  if not exists (select 1 from public.teacher_profiles where user_id = v_owner and account_status = 'active') then
    raise insufficient_privilege using message = 'Active teacher account required';
  end if;
  if p_class_id is not null and not exists (
    select 1 from public.teacher_classes where id = p_class_id and owner_teacher_id = v_owner and status = 'active'
  ) then raise insufficient_privilege using message = 'Owned active class required'; end if;
  v_plan := private.effective_teacher_plan(v_owner);
  select case when v_plan = 'free' then free_active_activity_limit else pro_active_activity_limit end
    into strict v_limit from private.product_capability_policy where product_key = 'math-vocabulary-hunt';
  select count(*)::integer into v_count from public.teacher_activities
    where owner_teacher_id = v_owner and status in ('draft', 'ready');
  if v_count >= v_limit then raise exception using errcode = 'P0001', message = 'capability_limit_reached:activity.create'; end if;
  insert into public.teacher_activities (
    id, owner_teacher_id, class_id, grade_level, topic_key, lesson_key,
    game_mode_key, time_limit_minutes, team_count, combine_mode_enabled
  ) values (
    p_activity_id, v_owner, p_class_id, p_grade_level, p_topic_key, p_lesson_key,
    p_game_mode_key, p_time_limit_minutes, p_team_count, p_combine_mode_enabled
  );
  return p_activity_id;
end;
$$;
revoke all on function public.create_teacher_activity(uuid, uuid, text, text, text, text, integer, integer, boolean) from public, anon;
grant execute on function public.create_teacher_activity(uuid, uuid, text, text, text, text, integer, integer, boolean) to authenticated;

drop policy if exists teacher_classes_insert_own_active_account on public.teacher_classes;
drop policy if exists teacher_activities_insert_own_active_account on public.teacher_activities;
revoke insert on table public.teacher_classes from authenticated;
revoke insert on table public.teacher_activities from authenticated;
