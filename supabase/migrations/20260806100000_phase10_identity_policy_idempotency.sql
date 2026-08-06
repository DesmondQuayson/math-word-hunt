-- Phase 10 narrow preservation hardening. Semantic no-ops must not rewrite
-- durable identity-policy timestamps, and hosted verification must be able to
-- fail closed if the policy changes concurrently.
create or replace function public.set_platform_identity_model(p_identity_model text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_identity_model not in ('legacy-preview', 'consumer-v1') then
    raise exception using errcode = '22023', message = 'invalid_identity_model';
  end if;
  update private.platform_identity_policy
    set identity_model = p_identity_model, updated_at = statement_timestamp()
    where singleton and identity_model is distinct from p_identity_model;
end;
$$;

create or replace function public.ensure_platform_identity_model(
  p_expected_current text,
  p_identity_model text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_model text;
begin
  if p_expected_current not in ('legacy-preview', 'consumer-v1')
    or p_identity_model not in ('legacy-preview', 'consumer-v1') then
    raise exception using errcode = '22023', message = 'invalid_identity_model';
  end if;

  select identity_model into current_model
    from private.platform_identity_policy
    where singleton
    for update;
  if current_model is null then
    raise exception using errcode = 'P0001', message = 'identity_model_missing';
  end if;
  if current_model is distinct from p_expected_current then
    raise exception using errcode = '40001', message = 'identity_model_concurrent_change';
  end if;
  if current_model is not distinct from p_identity_model then
    return false;
  end if;

  update private.platform_identity_policy
    set identity_model = p_identity_model, updated_at = statement_timestamp()
    where singleton and identity_model is not distinct from p_expected_current;
  if not found then
    raise exception using errcode = '40001', message = 'identity_model_concurrent_change';
  end if;
  return true;
end;
$$;

revoke all on function public.ensure_platform_identity_model(text,text) from public, anon, authenticated;
grant execute on function public.ensure_platform_identity_model(text,text) to service_role;

comment on function public.ensure_platform_identity_model(text,text) is
  'Service-only compare-and-set identity policy guard. Semantic no-ops preserve updated_at.';
