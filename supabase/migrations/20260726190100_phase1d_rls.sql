create or replace function private.is_active_teacher()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.teacher_profiles
    where user_id = (select auth.uid()) and account_status = 'active'
  );
$$;
revoke all on function private.is_active_teacher() from public, anon;
grant execute on function private.is_active_teacher() to authenticated;

create or replace function private.teacher_owns_active_class(check_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select check_class_id is null or exists (
    select 1 from public.teacher_classes
    where id = check_class_id
      and owner_teacher_id = (select auth.uid())
      and status = 'active'
  );
$$;
revoke all on function private.teacher_owns_active_class(uuid) from public, anon;
grant execute on function private.teacher_owns_active_class(uuid) to authenticated;

alter table public.teacher_profiles enable row level security;
alter table public.products enable row level security;
alter table public.product_entitlements enable row level security;
alter table public.teacher_classes enable row level security;
alter table public.teacher_activities enable row level security;
alter table public.account_deletion_requests enable row level security;

create policy teacher_profiles_select_own on public.teacher_profiles
for select to authenticated using (user_id = (select auth.uid()));
create policy teacher_profiles_update_own_active on public.teacher_profiles
for update to authenticated
using (user_id = (select auth.uid()) and (select private.is_active_teacher()))
with check (user_id = (select auth.uid()) and account_status = 'active');

create policy products_select_active on public.products
for select to anon, authenticated using (is_active);

create policy product_entitlements_select_own_active on public.product_entitlements
for select to authenticated
using (teacher_user_id = (select auth.uid()) and (select private.is_active_teacher()));

create policy teacher_classes_select_own_active_account on public.teacher_classes
for select to authenticated
using (owner_teacher_id = (select auth.uid()) and (select private.is_active_teacher()));
create policy teacher_classes_insert_own_active_account on public.teacher_classes
for insert to authenticated
with check (
  owner_teacher_id = (select auth.uid())
  and status = 'active'
  and archived_at is null
  and (select private.is_active_teacher())
);
create policy teacher_classes_update_own_active_account on public.teacher_classes
for update to authenticated
using (owner_teacher_id = (select auth.uid()) and (select private.is_active_teacher()))
with check (owner_teacher_id = (select auth.uid()) and (select private.is_active_teacher()));

create policy teacher_activities_select_own_active_account on public.teacher_activities
for select to authenticated
using (owner_teacher_id = (select auth.uid()) and (select private.is_active_teacher()));
create policy teacher_activities_insert_own_active_account on public.teacher_activities
for insert to authenticated
with check (
  owner_teacher_id = (select auth.uid())
  and status = 'draft'
  and (select private.is_active_teacher())
  and (select private.teacher_owns_active_class(class_id))
);
create policy teacher_activities_update_own_active_account on public.teacher_activities
for update to authenticated
using (owner_teacher_id = (select auth.uid()) and (select private.is_active_teacher()))
with check (
  owner_teacher_id = (select auth.uid())
  and (select private.is_active_teacher())
  and (select private.teacher_owns_active_class(class_id))
);

create policy account_deletion_requests_select_own on public.account_deletion_requests
for select to authenticated using (owner_teacher_id = (select auth.uid()));
create policy account_deletion_requests_insert_own_active on public.account_deletion_requests
for insert to authenticated
with check (
  owner_teacher_id = (select auth.uid())
  and status = 'requested'
  and resolved_at is null
  and resolution_code is null
  and (select private.is_active_teacher())
);

revoke all on table public.teacher_profiles from anon, authenticated;
revoke all on table public.products from anon, authenticated;
revoke all on table public.product_entitlements from anon, authenticated;
revoke all on table public.teacher_classes from anon, authenticated;
revoke all on table public.teacher_activities from anon, authenticated;
revoke all on table public.account_deletion_requests from anon, authenticated;

-- Reserved for local migration and test administration. Application code never
-- receives or uses this role; browser and ordinary server requests use the
-- publishable key plus the authenticated user's session.
grant all on table public.teacher_profiles, public.products, public.product_entitlements,
  public.teacher_classes, public.teacher_activities, public.account_deletion_requests to service_role;

grant select on table public.teacher_profiles to authenticated;
grant update (display_name, school_or_organization_label) on table public.teacher_profiles to authenticated;

grant select on table public.products to anon, authenticated;

grant select on table public.product_entitlements to authenticated;

grant select on table public.teacher_classes to authenticated;
grant insert (id, owner_teacher_id, class_name, grade_level, period_or_section) on table public.teacher_classes to authenticated;
grant update (class_name, grade_level, period_or_section, status) on table public.teacher_classes to authenticated;

grant select on table public.teacher_activities to authenticated;
grant insert (
  id,
  owner_teacher_id,
  class_id,
  grade_level,
  topic_key,
  lesson_key,
  game_mode_key,
  time_limit_minutes,
  team_count,
  combine_mode_enabled
) on table public.teacher_activities to authenticated;
grant update (
  class_id,
  grade_level,
  topic_key,
  lesson_key,
  game_mode_key,
  time_limit_minutes,
  team_count,
  combine_mode_enabled,
  status
) on table public.teacher_activities to authenticated;

grant select on table public.account_deletion_requests to authenticated;
grant insert (owner_teacher_id) on table public.account_deletion_requests to authenticated;
