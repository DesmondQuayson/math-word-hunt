-- Preserve the append-only admin audit ledger while allowing the existing
-- ON DELETE SET NULL foreign key to anonymize a deleted admin identity.

create or replace function private.reject_admin_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and pg_trigger_depth() > 1
     and old.admin_user_id is not null
     and new.admin_user_id is null
     and new.id is not distinct from old.id
     and new.action is not distinct from old.action
     and new.target is not distinct from old.target
     and new.metadata is not distinct from old.metadata
     and new.ip is not distinct from old.ip
     and new.user_agent is not distinct from old.user_agent
     and new.created_at is not distinct from old.created_at then
    return new;
  end if;

  raise exception 'admin_audit_log is append-only';
end;
$$;

revoke all on function private.reject_admin_audit_mutation()
  from public, anon, authenticated, service_role;

comment on function private.reject_admin_audit_mutation() is
  'Rejects direct audit mutations while permitting only nested FK anonymization after an admin identity is deleted.';
