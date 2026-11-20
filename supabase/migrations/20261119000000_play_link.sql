-- Where to get the winning game: the admin can attach a link (store page, download, browser
-- version...) to a winner, and the page shows it in the Now Playing spot.
alter table public.games add column play_url text
  check (play_url is null or (char_length(play_url) <= 500 and play_url ~ '^https?://[^[:space:]]+$'));

create function public.set_play_link(p_token text, p_game_id bigint, p_url text) returns void
language plpgsql security definer set search_path = '' as $$
declare v smallint := private.require_admin(p_token); g public.games; u text := nullif(trim(coalesce(p_url, '')), '');
begin
  select * into g from public.games where id = p_game_id and status = 'won';
  if not found then raise exception 'Links can only go on a winner.'; end if;
  if u is not null and u !~* '^https?://' then u := 'https://' || u; end if;
  if u is not null and (char_length(u) > 500 or u !~ '^https?://[^[:space:]]+\.[^[:space:]]+$') then
    raise exception 'That doesn''t look like a link. Paste the whole web address.';
  end if;
  update public.games set play_url = u where id = g.id;
  if u is null then
    perform private.add_log(v, 'link', format('%s took down the link for %s', private.member_name(v), g.title));
  else
    perform private.add_log(v, 'link', format('%s posted where to get %s', private.member_name(v), g.title));
    perform private.sys_msg(v, format('🕹️ Where to get %s is up! Hit "Get the game" in the Now Playing spot.', g.title));
  end if;
end $$;

revoke execute on function public.set_play_link(text,bigint,text) from public, anon, authenticated;
grant execute on function public.set_play_link(text,bigint,text) to anon, authenticated;
