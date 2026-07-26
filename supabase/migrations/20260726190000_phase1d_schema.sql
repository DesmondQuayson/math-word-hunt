create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.teacher_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (display_name = btrim(display_name) and char_length(display_name) between 1 and 80),
  school_or_organization_label text check (
    school_or_organization_label is null or
    (school_or_organization_label = btrim(school_or_organization_label) and char_length(school_or_organization_label) between 1 and 120)
  ),
  account_status text not null default 'active' check (account_status in ('active', 'suspended', 'deletion_requested')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (updated_at >= created_at)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  product_key text not null unique check (product_key = btrim(product_key) and char_length(product_key) between 1 and 80),
  display_name text not null check (display_name = btrim(display_name) and char_length(display_name) between 1 and 120),
  description text not null check (description = btrim(description) and char_length(description) between 1 and 500),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (updated_at >= created_at)
);

create table public.product_entitlements (
  id uuid primary key default gen_random_uuid(),
  teacher_user_id uuid not null references public.teacher_profiles(user_id) on delete cascade,
  product_key text not null references public.products(product_key) on update cascade on delete restrict,
  scope text not null check (scope in ('product', 'feature')),
  feature_key text,
  status text not null check (status in ('active', 'revoked')),
  source text not null check (source in ('system', 'manual', 'license', 'subscription')),
  source_reference text check (source_reference is null or char_length(source_reference) between 1 and 160),
  starts_at timestamptz not null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((scope = 'product' and feature_key is null) or (scope = 'feature' and feature_key is not null)),
  check (feature_key is null or feature_key in ('basic-play', 'limited-content', 'complete-library', 'classroom-tools', 'teacher-reporting', 'premium-game-modes')),
  check (expires_at is null or expires_at > starts_at),
  check (updated_at >= created_at)
);

create unique index product_entitlements_unique_scope
  on public.product_entitlements (teacher_user_id, product_key, scope, coalesce(feature_key, ''));
create index product_entitlements_teacher_idx on public.product_entitlements (teacher_user_id);

create table public.teacher_classes (
  id uuid primary key default gen_random_uuid(),
  owner_teacher_id uuid not null references public.teacher_profiles(user_id) on delete cascade,
  class_name text not null check (class_name = btrim(class_name) and char_length(class_name) between 2 and 80),
  grade_level text check (grade_level is null or grade_level in ('6', '7', '8')),
  period_or_section text check (
    period_or_section is null or
    (period_or_section = btrim(period_or_section) and char_length(period_or_section) between 1 and 40)
  ),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  check ((status = 'active' and archived_at is null) or (status = 'archived' and archived_at is not null)),
  check (updated_at >= created_at)
);
create index teacher_classes_owner_status_idx on public.teacher_classes (owner_teacher_id, status, created_at desc);

create table public.teacher_activities (
  id uuid primary key default gen_random_uuid(),
  owner_teacher_id uuid not null references public.teacher_profiles(user_id) on delete cascade,
  class_id uuid references public.teacher_classes(id) on delete restrict,
  grade_level text not null check (grade_level in ('6', '7', '8')),
  topic_key text not null check (topic_key in ('g6-expressions', 'g7-rational', 'g7-probability')),
  lesson_key text not null check (lesson_key in ('g6-3-6', 'g7-1-2', 'g7-7-3', 'g7-7-4')),
  game_mode_key text not null check (game_mode_key = 'team-hunt'),
  time_limit_minutes integer not null check (time_limit_minutes between 1 and 60),
  team_count integer not null check (team_count between 2 and 8),
  combine_mode_enabled boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'ready', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (updated_at >= created_at)
);
create index teacher_activities_owner_status_idx on public.teacher_activities (owner_teacher_id, status, created_at desc);
create index teacher_activities_class_idx on public.teacher_activities (class_id) where class_id is not null;

create table public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  owner_teacher_id uuid not null references public.teacher_profiles(user_id) on delete cascade,
  status text not null default 'requested' check (status in ('requested', 'resolved')),
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution_code text check (resolution_code is null or (resolution_code = btrim(resolution_code) and char_length(resolution_code) between 1 and 80)),
  check ((status = 'requested' and resolved_at is null and resolution_code is null) or (status = 'resolved' and resolved_at is not null)),
  check (resolved_at is null or resolved_at >= requested_at)
);
create unique index account_deletion_requests_one_open_idx
  on public.account_deletion_requests (owner_teacher_id) where status = 'requested';
create index account_deletion_requests_owner_idx on public.account_deletion_requests (owner_teacher_id, requested_at desc);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = statement_timestamp();
  return new;
end;
$$;

create trigger teacher_profiles_set_updated_at before update on public.teacher_profiles
for each row execute function private.set_updated_at();
create trigger products_set_updated_at before update on public.products
for each row execute function private.set_updated_at();
create trigger product_entitlements_set_updated_at before update on public.product_entitlements
for each row execute function private.set_updated_at();
create trigger teacher_classes_set_updated_at before update on public.teacher_classes
for each row execute function private.set_updated_at();
create trigger teacher_activities_set_updated_at before update on public.teacher_activities
for each row execute function private.set_updated_at();

create or replace function private.provision_teacher_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_display_name text;
  requested_school text;
begin
  requested_display_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '');
  if requested_display_name is null or char_length(requested_display_name) > 80 then
    requested_display_name := 'Teacher';
  end if;

  requested_school := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'school_or_organization_label', '')), '');
  if requested_school is not null and char_length(requested_school) > 120 then
    requested_school := null;
  end if;

  insert into public.teacher_profiles (
    user_id,
    display_name,
    school_or_organization_label,
    account_status
  ) values (
    new.id,
    requested_display_name,
    requested_school,
    'active'
  )
  on conflict (user_id) do nothing;

  return new;
exception
  when others then
    raise exception 'Teacher profile provisioning failed';
end;
$$;
revoke all on function private.provision_teacher_profile() from public, anon, authenticated;

create trigger provision_teacher_profile_after_auth_user
after insert on auth.users
for each row execute function private.provision_teacher_profile();

create or replace function private.prepare_class_archive()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'archived' and new.status <> 'archived' then
    raise exception 'Archived classes cannot be restored in Phase 1D';
  end if;
  if old.status = 'active' and new.status = 'archived' then
    new.archived_at = statement_timestamp();
  end if;
  return new;
end;
$$;
create trigger teacher_classes_prepare_archive before update on public.teacher_classes
for each row execute function private.prepare_class_archive();

create or replace function private.mark_deletion_requested()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.teacher_profiles
    set account_status = 'deletion_requested'
    where user_id = new.owner_teacher_id and account_status = 'active';
  if not found then
    raise exception 'Active teacher profile required';
  end if;
  return new;
end;
$$;
revoke all on function private.mark_deletion_requested() from public, anon, authenticated;
create trigger account_deletion_request_marks_profile
after insert on public.account_deletion_requests
for each row execute function private.mark_deletion_requested();
