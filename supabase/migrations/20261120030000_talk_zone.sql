-- The admin picks Pacific or Central for the talk; everyone sees it in that zone.
alter table public.games add column meet_tz text not null default 'PT' check (meet_tz in ('PT','CT'));

drop function public.set_game_night(text, bigint, timestamptz, text);
create function public.set_game_night(p_token text, p_game_id bigint, p_at timestamptz, p_place text, p_tz text default 'PT') returns void
language plpgsql security definer set search_path = '' as $$
declare v smallint := private.require_admin(p_token); g public.games;
        place text := nullif(left(trim(coalesce(p_place, '')), 200), '');
        tz text := case when p_tz = 'CT' then 'CT' else 'PT' end;
        zone text; local timestamp; label text; pretty text;
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
  update public.games set meet_at = p_at, meet_place = place, meet_tz = tz where id = g.id;
  zone := case tz when 'CT' then 'America/Chicago' else 'America/Los_Angeles' end;
  local := p_at at time zone zone;
  -- "PT", or CST/CDT depending on the date
  label := case when tz = 'PT' then 'PT'
                when local - (p_at at time zone 'UTC') = interval '-5 hours' then 'CDT' else 'CST' end;
  -- "Friday, November 27 at 7pm PT"
  pretty := trim(to_char(local, 'FMDay, FMMonth FMDD "at" FMHH12'))
         || case when extract(minute from local) = 0 then '' else to_char(local, ':MI') end
         || lower(to_char(local, 'AM')) || ' ' || label;
  perform private.add_log(v, 'night', format('%s set when we talk about %s: %s%s', private.member_name(v), g.title, pretty,
                                            coalesce(' (' || place || ')', '')));
  perform private.sys_msg(v, format('📅 Once you''ve played %s, we hop on to talk about it %s%s. Play it before then!',
                                    g.title, pretty, coalesce(' in ' || place, '')));
end $$;

revoke execute on function public.set_game_night(text,bigint,timestamptz,text,text) from public, anon, authenticated;
grant execute on function public.set_game_night(text,bigint,timestamptz,text,text) to anon, authenticated;
