-- The winner spot is now "Game we're playing" with a PLAY NOW button; match the chat line.
create or replace function public.set_play_link(p_token text, p_game_id bigint, p_url text) returns void
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
    perform private.add_log(v, 'link', format('%s posted where to play %s', private.member_name(v), g.title));
    perform private.sys_msg(v, format('🕹️ %s is ready to play! Hit PLAY NOW up top.', g.title));
  end if;
end $$;

-- the one announcement already sent uses the old wording
update public.messages set body = '🕹️ The Oregon Trail is ready to play! Hit PLAY NOW up top.'
 where kind = 'system' and body like '%Where to get The Oregon Trail is up!%';
update public.log set text = replace(text, 'posted where to get', 'posted where to play') where kind = 'link';
