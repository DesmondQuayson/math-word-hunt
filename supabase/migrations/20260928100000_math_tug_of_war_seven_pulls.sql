-- Math Tug of War: owner decision — a team must reach 7 NET pulls to win.
-- The rope bound moves from -5..+5 to -7..+7 and the authoritative answer
-- function detects victory at -7 / +7. Victory stays server-side; the
-- browser can still never write a position.
--
-- Also fixes the room-state rule: "status = 'won' exactly when a winner is
-- set" made it impossible to CLOSE a won room (leaving after a win failed, so
-- the other player never learned their opponent had left). Now a won room
-- must have a winner, a waiting/playing room must not, and a closed room may
-- keep the winner of the round it ended on.

alter table public.tug_rooms drop constraint if exists tug_rooms_position_check;
alter table public.tug_rooms add constraint tug_rooms_position_check check (position between -7 and 7);

do $fix$
declare constraint_row record;
begin
  for constraint_row in
    select conname from pg_constraint
    where conrelid = 'public.tug_rooms'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) = 'CHECK (((status = ''won''::text) = (winner IS NOT NULL)))'
  loop
    execute format('alter table public.tug_rooms drop constraint %I', constraint_row.conname);
  end loop;
end
$fix$;
alter table public.tug_rooms add constraint tug_rooms_winner_state_check check (
  (status = 'won' and winner is not null) or (status in ('waiting','playing') and winner is null) or status = 'closed'
);

create or replace function public.tug_submit_answer(
  p_code text, p_token_hash text, p_round integer, p_question_index integer, p_correct boolean
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  located record;
  room public.tug_rooms%rowtype;
  my_index integer;
  opponent_seen timestamptz;
  next_position smallint;
begin
  select * into located from private.tug_locate(p_code,p_token_hash);
  if located.team is null then return jsonb_build_object('result','not-found'); end if;
  room := located.room;
  if room.expires_at <= statement_timestamp() then return private.tug_room_view(room,located.team,'expired'); end if;
  if room.status <> 'playing' then return private.tug_room_view(room,located.team,'not-playing'); end if;
  my_index := case located.team when 'turquoise' then room.host_question_index else room.guest_question_index end;
  -- Exactly-once: only the answer to the caller's CURRENT question counts.
  -- A replay, a double tap or an answer from an earlier round is stale.
  if room.round <> p_round or my_index <> p_question_index then
    return private.tug_room_view(room,located.team,'stale');
  end if;
  opponent_seen := case located.team when 'turquoise' then room.guest_seen_at else room.host_seen_at end;
  if opponent_seen is null or opponent_seen <= statement_timestamp() - interval '10 seconds' then
    return private.tug_room_view(room,located.team,'opponent-away');
  end if;

  next_position := room.position;
  if p_correct then
    next_position := greatest(-7, least(7, room.position + case located.team when 'turquoise' then -1 else 1 end));
  end if;

  update public.tug_rooms set
    host_question_index=host_question_index + case when located.team='turquoise' then 1 else 0 end,
    guest_question_index=guest_question_index + case when located.team='pink' then 1 else 0 end,
    host_pulls=host_pulls + case when located.team='turquoise' and p_correct then 1 else 0 end,
    guest_pulls=guest_pulls + case when located.team='pink' and p_correct then 1 else 0 end,
    position=next_position,
    winner=case when next_position<=-7 then 'turquoise' when next_position>=7 then 'pink' else null end,
    status=case when next_position<=-7 or next_position>=7 then 'won' else 'playing' end,
    host_seen_at=case when located.team='turquoise' then statement_timestamp() else host_seen_at end,
    guest_seen_at=case when located.team='pink' then statement_timestamp() else guest_seen_at end,
    version=version+1, updated_at=statement_timestamp()
    where id=room.id returning * into room;
  return private.tug_room_view(room,located.team,case when p_correct then 'correct' else 'incorrect' end);
end
$$;

revoke all on function public.tug_submit_answer(text,text,integer,integer,boolean) from public,anon,authenticated;
grant execute on function public.tug_submit_answer(text,text,integer,integer,boolean) to service_role;
