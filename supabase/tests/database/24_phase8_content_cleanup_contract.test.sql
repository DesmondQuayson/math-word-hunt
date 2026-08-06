begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select results_eq(
  $$select id from storage.buckets where id in (
      'admin-assets','resource-files','resource-quarantine','game-packages',
      'game-package-quarantine','cms-media','cms-media-quarantine'
    ) order by id$$,
  $$values
    ('admin-assets'::text),('cms-media'::text),('cms-media-quarantine'::text),
    ('game-package-quarantine'::text),('game-packages'::text),
    ('resource-files'::text),('resource-quarantine'::text)$$,
  'the cleanup contract retains exactly seven managed infrastructure bucket definitions'
);

select results_eq(
  $$select id,public,file_size_limit,
      case when allowed_mime_types is null then null else
        (select array_agg(value order by value) from unnest(allowed_mime_types) value) end
    from storage.buckets where id in (
      'admin-assets','resource-files','resource-quarantine','game-packages',
      'game-package-quarantine','cms-media','cms-media-quarantine'
    ) order by id$$,
  $$values
    ('admin-assets'::text,false,10485760::bigint,array['image/jpeg','image/png','image/webp']::text[]),
    ('cms-media'::text,false,20971520::bigint,array['application/pdf','audio/mpeg','audio/ogg','audio/wav','image/jpeg','image/png','image/webp']::text[]),
    ('cms-media-quarantine'::text,false,20971520::bigint,array['application/octet-stream']::text[]),
    ('game-package-quarantine'::text,false,26214400::bigint,array['application/octet-stream','application/zip']::text[]),
    ('game-packages'::text,false,20971520::bigint,null::text[]),
    ('resource-files'::text,false,20971520::bigint,array['application/pdf','image/jpeg','image/png','image/webp']::text[]),
    ('resource-quarantine'::text,false,20971520::bigint,array['application/octet-stream','application/pdf']::text[])$$,
  'all managed buckets remain private with the exact size and MIME policies'
);

select results_eq(
  $$select count(*)::bigint from storage.objects where bucket_id in (
      'admin-assets','resource-files','resource-quarantine','game-packages',
      'game-package-quarantine','cms-media','cms-media-quarantine'
    )$$,
  $$values (0::bigint)$$,
  'migration-from-empty starts with zero managed Storage objects'
);

select results_eq(
  $$select count(*)::bigint from storage.buckets where id not in (
      'admin-assets','resource-files','resource-quarantine','game-packages',
      'game-package-quarantine','cms-media','cms-media-quarantine'
    )$$,
  $$values (0::bigint)$$,
  'migration-from-empty creates no unknown temporary bucket'
);

select ok(
  exists(
    select 1 from pg_trigger
    where tgrelid='public.admin_audit_log'::regclass
      and tgname='admin_audit_log_reject_mutation'
      and not tgisinternal
  ),
  'normal admin audit rows retain the append-only mutation-rejection trigger'
);

select ok(
  not has_table_privilege('service_role','public.admin_audit_log','DELETE'),
  'service_role receives no general-purpose audit-delete table privilege'
);

select is(
  (select confdeltype from pg_constraint where conname='game_catalog_destination_audit_catalog_entry_id_fkey'),
  'r'::"char",
  'normal catalog deletion remains blocked while destination audit evidence exists'
);

select ok(
  exists(
    select 1 from pg_trigger
    where tgrelid='public.game_catalog_destination_audit'::regclass
      and tgname='game_catalog_destination_audit_reject_mutation'
      and not tgisinternal
  ),
  'normal game destination audit evidence retains its append-only trigger'
);

select throws_ok(
  $$delete from public.game_catalog_destination_audit where catalog_entry_id='9b000000-0000-4000-8000-000000000001'$$,
  'P0001', 'Game catalog destination audit is append-only',
  'normal application operations cannot delete destination audit evidence'
);

select results_eq(
  $$select count(*)::bigint from public.admin_audit_log$$,
  $$values (0::bigint)$$,
  'migration-from-empty starts with no synthetic audit residue'
);

select * from finish();
rollback;
