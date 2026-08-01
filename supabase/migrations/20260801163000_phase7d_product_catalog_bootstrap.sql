-- Required application catalog data must exist after migrations alone. Keep the
-- canonical row in one owner-only function so local seed application can verify
-- the same contract without maintaining a second upsert definition.
create or replace function private.ensure_mathnexa_product_catalog()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  canonical_id constant uuid := '8d2f7667-2da8-4d6f-99bd-57ca6671df13';
  canonical_key constant text := 'math-vocabulary-hunt';
  canonical_name constant text := 'Math Vocabulary Hunt';
  canonical_description constant text := 'The current classroom vocabulary game and its future teacher tools.';
  catalog_row public.products%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('mathnexa:catalog:math-vocabulary-hunt', 0)
  );

  if exists (
    select 1 from public.products
    where id = canonical_id and product_key <> canonical_key
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'phase7d_product_catalog_conflict:canonical_id';
  end if;

  insert into public.products (
    id,
    product_key,
    display_name,
    description,
    is_active
  ) values (
    canonical_id,
    canonical_key,
    canonical_name,
    canonical_description,
    true
  )
  on conflict (product_key) do nothing;

  select * into strict catalog_row
  from public.products
  where product_key = canonical_key;

  if catalog_row.id <> canonical_id
     or catalog_row.display_name <> canonical_name
     or catalog_row.description <> canonical_description
     or catalog_row.is_active is not true then
    raise exception using
      errcode = 'P0001',
      message = 'phase7d_product_catalog_conflict:canonical_values';
  end if;
end;
$$;

revoke all on function private.ensure_mathnexa_product_catalog() from public, anon, authenticated, service_role;

select private.ensure_mathnexa_product_catalog();
