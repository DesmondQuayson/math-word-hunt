insert into public.products (
  id,
  product_key,
  display_name,
  description,
  is_active
) values (
  '8d2f7667-2da8-4d6f-99bd-57ca6671df13',
  'math-vocabulary-hunt',
  'Math Vocabulary Hunt',
  'The current classroom vocabulary game and its future teacher tools.',
  true
)
on conflict (product_key) do update set
  display_name = excluded.display_name,
  description = excluded.description,
  is_active = excluded.is_active;
