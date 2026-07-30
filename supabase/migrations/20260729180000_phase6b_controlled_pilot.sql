-- Phase 6B controlled pilot: organization labels are prohibited. Existing
-- non-null values are retained, but no caller may insert or change one.
create or replace function private.provision_teacher_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_display_name text;
begin
  requested_display_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '');
  if requested_display_name is null or char_length(requested_display_name) > 80 then
    requested_display_name := 'Teacher';
  end if;

  insert into public.teacher_profiles (
    user_id,
    display_name,
    school_or_organization_label,
    account_status
  ) values (
    new.id,
    requested_display_name,
    null,
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

create or replace function private.reject_controlled_pilot_organization_label()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.school_or_organization_label is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.school_or_organization_label is not distinct from old.school_or_organization_label then
    return new;
  end if;
  raise exception using
    errcode = '42501',
    message = 'organization_labels_prohibited_during_controlled_pilot';
end;
$$;
revoke all on function private.reject_controlled_pilot_organization_label() from public, anon, authenticated;

create trigger teacher_profiles_reject_controlled_pilot_organization_label
before insert or update of school_or_organization_label on public.teacher_profiles
for each row execute function private.reject_controlled_pilot_organization_label();

revoke update (school_or_organization_label) on public.teacher_profiles from authenticated;
