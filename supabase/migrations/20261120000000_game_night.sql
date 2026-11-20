-- Game night: when (and where) the club gets together to talk about the winner.
-- The admin sets it on the winning game; the page shows it as a ticket with a countdown.
alter table public.games
  add column meet_at timestamptz,
  add column meet_place text check (meet_place is null or char_length(meet_place) <= 200);

create function public.set_game_night(p_token text, p_game_id bigint, p_at timestamptz, p_place text) returns void
language plpgsql security definer set search_path = '' as $$
declare v smallint := private.require_admin(p_token); g public.games;
        place text := nullif(left(trim(coalesce(p_place, '')), 200), ''); pretty text;
begin
  select * into g from public.games where id = p_game_id and status = 'won';
  if not found then raise exception 'Game night can only be set for a winner.'; end if;
  if p_at is null then
    update public.games set meet_at = null, meet_place = null where id = g.id;
    perform private.add_log(v, 'night', format('%s took game night for %s off the calendar', private.member_name(v), g.title));
    return;
  end if;
  if p_at < now() - interval '1 day' or p_at > now() + interval '1 year' then
    raise exception 'Pick a date that''s coming up.';
  end if;
  update public.games set meet_at = p_at, meet_place = place where id = g.id;
  -- the club is on Pacific time
  pretty := trim(to_char(p_at at time zone 'America/Los_Angeles', 'FMDay, FMMonth FMDD "at" FMHH12:MI AM'));
  perform private.add_log(v, 'night', format('%s set game night for %s: %s%s', private.member_name(v), g.title, pretty,
                                            coalesce(' (' || place || ')', '')));
  perform private.sys_msg(v, format('📅 GAME NIGHT for %s: %s%s. Be there!', g.title, pretty, coalesce(', ' || place, '')));
end $$;

revoke execute on function public.set_game_night(text,bigint,timestamptz,text) from public, anon, authenticated;
grant execute on function public.set_game_night(text,bigint,timestamptz,text) to anon, authenticated;
