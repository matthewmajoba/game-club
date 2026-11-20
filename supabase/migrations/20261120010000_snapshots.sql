-- Snapshots: each member posts one screenshot from their playthrough of the winner,
-- plus a line about why it caught their eye. Images live in the public "shots" bucket;
-- uploads go through the games edge function (it checks the session token).
create table public.shots (
  id bigint generated always as identity primary key,
  game_id bigint not null references public.games(id) on delete cascade,
  member_id smallint not null references public.members(id) on delete cascade,
  path text not null check (char_length(path) <= 200),
  caption text not null check (char_length(caption) between 1 and 240),
  created_at timestamptz not null default now(),
  unique (game_id, member_id)
);
alter table public.shots enable row level security;
create policy "anyone can read" on public.shots for select to anon, authenticated using (true);
alter publication supabase_realtime add table public.shots;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shots', 'shots', true, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- save (or replace) a member's snapshot; returns the old file path so the function can delete it
create function public.save_shot_internal(p_member smallint, p_game bigint, p_path text, p_caption text) returns text
language plpgsql security definer set search_path = '' as $$
declare g public.games; old text; cap text := private.clean(p_caption, 240);
begin
  select * into g from public.games where id = p_game and status = 'won';
  if not found then raise exception 'Snapshots are only for the game we''re playing.'; end if;
  select path into old from public.shots where game_id = p_game and member_id = p_member;
  insert into public.shots (game_id, member_id, path, caption) values (p_game, p_member, p_path, cap)
  on conflict (game_id, member_id) do update set path = excluded.path, caption = excluded.caption, created_at = now();
  perform private.add_log(p_member, 'shot', format('%s %s a snapshot from %s', private.member_name(p_member),
                                                   case when old is null then 'posted' else 'swapped' end, g.title));
  return old;
end $$;

create function public.remove_shot_internal(p_member smallint, p_game bigint) returns text
language plpgsql security definer set search_path = '' as $$
declare old text;
begin
  delete from public.shots where game_id = p_game and member_id = p_member returning path into old;
  return old;
end $$;

-- change just the caption (no new upload needed)
create function public.set_shot_caption(p_token text, p_game_id bigint, p_caption text) returns void
language plpgsql security definer set search_path = '' as $$
declare v smallint := private.member_id_for(p_token);
begin
  update public.shots set caption = private.clean(p_caption, 240) where game_id = p_game_id and member_id = v;
  if not found then raise exception 'Post a snapshot first.'; end if;
end $$;

revoke execute on function public.save_shot_internal(smallint,bigint,text,text) from public, anon, authenticated;
revoke execute on function public.remove_shot_internal(smallint,bigint) from public, anon, authenticated;
grant execute on function public.save_shot_internal(smallint,bigint,text,text) to service_role;
grant execute on function public.remove_shot_internal(smallint,bigint) to service_role;
revoke execute on function public.set_shot_caption(text,bigint,text) from public, anon, authenticated;
grant execute on function public.set_shot_caption(text,bigint,text) to anon, authenticated;
