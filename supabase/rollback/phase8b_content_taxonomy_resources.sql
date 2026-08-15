-- Phase 8B rollback. Refuses to erase published history.
do $$
begin
  if exists (select 1 from public.content_resource_versions where publication_state='published') then
    raise exception 'Refusing Phase 8B rollback: published content history exists';
  end if;
end;
$$;

drop function if exists public.archive_content_resource(uuid,uuid,bigint);
drop function if exists public.rollback_content_resource(uuid,uuid,integer,bigint);
drop function if exists public.update_lesson_resource_assignment(uuid,uuid,bigint,text,smallint);
drop function if exists public.transition_content_resource(uuid,uuid,integer,bigint,text);
drop function if exists public.revise_content_resource(uuid,uuid,bigint,text,text,text,text[],jsonb);
drop function if exists public.create_content_resource(uuid,uuid,text,text,smallint,text,text,text,text[],jsonb);
drop function if exists public.update_content_lesson(uuid,uuid,bigint,text,text,smallint,text);
drop function if exists public.update_content_topic(uuid,uuid,bigint,text,text,smallint,text);
drop function if exists public.update_content_grade(uuid,uuid,bigint,text,text,smallint,text);
drop function if exists public.create_content_lesson(uuid,uuid,text,text,smallint);
drop function if exists public.create_content_topic(uuid,uuid,text,text,smallint);
drop function if exists public.create_content_grade(uuid,smallint,text,text,smallint);

drop table if exists public.lesson_resource_assignments;
drop trigger if exists content_resource_version_immutable on public.content_resource_versions;
drop trigger if exists content_resource_version_validate on public.content_resource_versions;
drop table if exists public.content_resource_versions;
drop trigger if exists content_resource_no_published_delete on public.content_resources;
drop table if exists public.content_resources;
drop table if exists public.content_lessons;
drop table if exists public.content_topics;
drop table if exists public.content_grades;

drop function if exists private.audit_content_mutation(uuid,text,uuid,jsonb);
drop function if exists private.content_state_transition_allowed(text,text);
drop function if exists private.assert_content_admin(uuid);
drop function if exists private.protect_published_content_resource();
drop function if exists private.protect_published_content_version();
drop function if exists private.validate_content_resource_version();
drop function if exists private.valid_content_object_path(text);
drop function if exists private.valid_content_manifest(text,jsonb);
drop function if exists private.normalize_content_tags(text[]);
