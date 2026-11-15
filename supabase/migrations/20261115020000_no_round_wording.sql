-- There are no "rounds" from the members' point of view: the shelf just fills up, a winner gets
-- crowned, and the shelf clears. (The rounds table stays as plumbing behind the scenes.)

create or replace function private.open_round() returns public.rounds
language plpgsql security definer set search_path = '' as $$
declare r public.rounds;
begin
  select * into r from public.rounds where status = 'open';
  if not found then raise exception 'The shelf is closed right now.'; end if;
  return r;
end $$;

create or replace function public.set_vote(p_token text, p_game_id bigint, p_points int) returns void
language plpgsql security definer set search_path = '' as $$
declare v smallint := private.member_id_for(p_token); r public.rounds := private.open_round();
        g public.games; used int; old int;
begin
  if p_points < 0 or p_points > 2 then raise exception 'You can put 0, 1 or 2 🔥 on a game.'; end if;
  select * into g from public.games where id = p_game_id;
  if not found or g.round_id <> r.id or g.status <> 'active' then
    raise exception 'That game is not up for votes right now.';
  end if;
  select coalesce(sum(points),0) into used from public.votes
   where member_id = v and round_id = r.id and game_id <> p_game_id;
  if used + p_points > 3 then
    raise exception 'You only get 3 🔥. Take some back from another game first.';
  end if;
  select points into old from public.votes where member_id = v and game_id = p_game_id;
  if p_points = 0 then
    delete from public.votes where member_id = v and game_id = p_game_id;
  else
    insert into public.votes (round_id, member_id, game_id, points) values (r.id, v, p_game_id, p_points)
    on conflict (member_id, game_id) do update set points = excluded.points;
  end if;
  if coalesce(old,0) <> p_points then
    perform private.add_log(v, 'vote', case
      when p_points = 0 then format('%s took their heat off %s', private.member_name(v), g.title)
      when p_points = 2 then format('%s put a BIG VOTE (🔥🔥) on %s', private.member_name(v), g.title)
      else format('%s put 🔥 on %s', private.member_name(v), g.title) end);
  end if;
end $$;

create or replace function public.close_round(p_token text, p_next_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare v smallint := private.require_admin(p_token); r public.rounds := private.open_round(); w record;
begin
  select g.id, g.title, g.member_id, coalesce(sum(vt.points),0) heat into w
    from public.games g left join public.votes vt on vt.game_id = g.id
   where g.round_id = r.id and g.status = 'active'
   group by g.id order by heat desc, g.created_at asc limit 1;
  if w.id is null then raise exception 'There are no games on the shelf to pick from.'; end if;
  update public.games set status = 'won', ended_at = now() where id = w.id;
  update public.games set status = 'lost', ended_at = now() where round_id = r.id and status in ('active','pending');
  update public.rounds set status = 'closed', closed_at = now(), winner_game_id = w.id where id = r.id;
  insert into public.rounds (name, max_hours) values (format('Shelf %s', r.id + 1), r.max_hours);
  perform private.add_log(v, 'round', format('We''re playing %s (picked by %s) 🏆', w.title, private.member_name(w.member_id)));
  perform private.sys_msg(v, format('🏆 WE HAVE A WINNER: %s! The shelf is cleared, start picking again.', w.title));
end $$;
