-- "Game night" is really when we hop on to talk about the game after playing it.
-- Say that, and always say the time is Pacific (PT).
create or replace function public.set_game_night(p_token text, p_game_id bigint, p_at timestamptz, p_place text) returns void
language plpgsql security definer set search_path = '' as $$
declare v smallint := private.require_admin(p_token); g public.games;
        place text := nullif(left(trim(coalesce(p_place, '')), 200), ''); pretty text;
begin
  select * into g from public.games where id = p_game_id and status = 'won';
  if not found then raise exception 'You can only set this for the game we''re playing.'; end if;
  if p_at is null then
    update public.games set meet_at = null, meet_place = null where id = g.id;
    perform private.add_log(v, 'night', format('%s took the date to talk about %s off the calendar', private.member_name(v), g.title));
    return;
  end if;
  if p_at < now() - interval '1 day' or p_at > now() + interval '1 year' then
    raise exception 'Pick a date that''s coming up.';
  end if;
  update public.games set meet_at = p_at, meet_place = place where id = g.id;
  -- the club is on Pacific time: "Friday, November 27 at 7pm PT"
  pretty := trim(to_char(p_at at time zone 'America/Los_Angeles', 'FMDay, FMMonth FMDD "at" FMHH12'))
         || case when extract(minute from p_at at time zone 'America/Los_Angeles') = 0 then ''
                 else to_char(p_at at time zone 'America/Los_Angeles', ':MI') end
         || lower(to_char(p_at at time zone 'America/Los_Angeles', 'AM')) || ' PT';
  perform private.add_log(v, 'night', format('%s set when we talk about %s: %s%s', private.member_name(v), g.title, pretty,
                                            coalesce(' (' || place || ')', '')));
  perform private.sys_msg(v, format('📅 Once you''ve played %s, we hop on to talk about it %s%s. Play it before then!',
                                    g.title, pretty, coalesce(' in ' || place, '')));
end $$;

-- the announcement and log line already sent for The Oregon Trail
update public.messages set body = '📅 Once you''ve played The Oregon Trail, we hop on to talk about it Friday, November 27 at 7pm PT in Game Club Chat. Play it before then!'
 where kind = 'system' and body = '📅 GAME NIGHT for The Oregon Trail: Friday, November 27 at 7:00 PM, Game Club Chat. Be there!';
update public.log set text = 'Matt set when we talk about The Oregon Trail: Friday, November 27 at 7pm PT (Game Club Chat)'
 where kind = 'night' and text = 'Matt set game night for The Oregon Trail: Friday, November 27 at 7:00 PM (Game Club Chat)';
