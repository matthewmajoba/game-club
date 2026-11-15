-- Game Club schema
-- Everyone (even logged-out visitors) can READ the public tables.
-- Nobody can write to tables directly: every change goes through the functions below,
-- which check the member's session token and the club rules.

create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;

-- ---------- tables ----------
create table public.members (
  id smallint generated always as identity primary key,
  name text not null unique,
  color text unique,
  font text,
  shame int not null default 0,
  is_admin boolean not null default false,
  setup_done boolean not null default false,
  created_at timestamptz not null default now()
);

-- secret codes + lockout state: never readable from the browser
create table private.member_secrets (
  member_id smallint primary key references public.members(id) on delete cascade,
  code_hash text,
  failed_attempts int not null default 0,
  locked_until timestamptz
);

create table private.sessions (
  token_hash text primary key,
  member_id smallint not null references public.members(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.rounds (
  id int generated always as identity primary key,
  name text not null,
  max_hours numeric not null default 8,
  status text not null default 'open' check (status in ('open','closed')),
  winner_game_id bigint,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create unique index rounds_one_open on public.rounds ((status)) where status = 'open';

create table public.games (
  id bigint generated always as identity primary key,
  round_id int not null references public.rounds(id),
  member_id smallint not null references public.members(id) on delete cascade,
  steam_appid int,
  title text not null check (char_length(title) between 1 and 200),
  cover_url text,
  hours numeric,
  hours_source text check (hours_source in ('steamspy','matt')),
  status text not null default 'active'
    check (status in ('active','pending','withdrawn','pulled','won','lost')),
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
-- one live pick per person per round
create unique index games_one_live_pick on public.games (round_id, member_id)
  where status in ('active','pending');

create table public.votes (
  round_id int not null references public.rounds(id),
  member_id smallint not null references public.members(id) on delete cascade,
  game_id bigint not null references public.games(id) on delete cascade,
  points smallint not null check (points between 1 and 2),
  primary key (member_id, game_id)
);

create table public.notes (
  id bigint generated always as identity primary key,
  game_id bigint not null references public.games(id) on delete cascade,
  member_id smallint not null references public.members(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create table public.messages (
  id bigint generated always as identity primary key,
  member_id smallint references public.members(id) on delete cascade,
  kind text not null default 'chat' check (kind in ('chat','system')),
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create table public.log (
  id bigint generated always as identity primary key,
  member_id smallint references public.members(id) on delete cascade,
  kind text not null,
  text text not null,
  created_at timestamptz not null default now()
);

create table public.facts (
  id int generated always as identity primary key,
  body text not null
);

-- ---------- read-only access for everyone ----------
do $$
declare t text;
begin
  foreach t in array array['members','rounds','games','votes','notes','messages','log','facts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "anyone can read" on public.%I for select to anon, authenticated using (true)', t);
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
  end loop;
end $$;
revoke all on schema private from anon, authenticated;

-- live updates
alter publication supabase_realtime add table
  public.members, public.games, public.votes, public.notes, public.messages, public.log, public.rounds;

-- ---------- helpers ----------
create function private.norm_code(p text) returns text
language sql immutable as $$
  select trim(regexp_replace(lower(coalesce(p,'')), '[^a-z]+', ' ', 'g'))
$$;

create function private.member_id_for(p_token text) returns smallint
language plpgsql security definer set search_path = '' as $$
declare v smallint;
begin
  select s.member_id into v from private.sessions s
   where s.token_hash = encode(extensions.digest(coalesce(p_token,''), 'sha256'), 'hex');
  if v is null then raise exception 'You need to sign in first.'; end if;
  return v;
end $$;

create function private.open_round() returns public.rounds
language plpgsql security definer set search_path = '' as $$
declare r public.rounds;
begin
  select * into r from public.rounds where status = 'open';
  if not found then raise exception 'There is no open round right now.'; end if;
  return r;
end $$;

create function private.clean(p text, p_max int default 500) returns text
language plpgsql immutable as $$
declare v text := trim(coalesce(p,''));
begin
  if v = '' then raise exception 'Type something first.'; end if;
  if char_length(v) > p_max then raise exception 'That is too long (max % characters).', p_max; end if;
  return v;
end $$;

create function private.add_log(p_member smallint, p_kind text, p_text text) returns void
language sql security definer set search_path = '' as $$
  insert into public.log (member_id, kind, text) values (p_member, p_kind, p_text);
$$;

create function private.sys_msg(p_member smallint, p_text text) returns void
language sql security definer set search_path = '' as $$
  insert into public.messages (member_id, kind, body) values (p_member, 'system', left(p_text, 500));
$$;

create function private.member_name(p_id smallint) returns text
language sql stable security definer set search_path = '' as $$
  select name from public.members where id = p_id;
$$;

-- ---------- login ----------
-- Returns {ok, token, member} or {ok:false, error}. Never raises on a wrong code,
-- so the failed-attempt counter is saved.
create function public.login(p_name text, p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m public.members; s private.member_secrets; tok text;
begin
  select * into m from public.members where lower(name) = lower(trim(coalesce(p_name,'')));
  if not found then return jsonb_build_object('ok', false, 'error', 'Who are you?'); end if;
  select * into s from private.member_secrets where member_id = m.id for update;
  if not found or s.code_hash is null then
    return jsonb_build_object('ok', false, 'error', 'Matt has not given you a code yet.');
  end if;
  if s.locked_until is not null and s.locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'Too many wrong guesses. Try again in a few minutes.');
  end if;
  if s.code_hash <> extensions.crypt(private.norm_code(p_code), s.code_hash) then
    update private.member_secrets
       set failed_attempts = case when failed_attempts + 1 >= 5 then 0 else failed_attempts + 1 end,
           locked_until   = case when failed_attempts + 1 >= 5 then now() + interval '10 minutes' else null end
     where member_id = m.id;
    return jsonb_build_object('ok', false, 'error', format('Nope. The real %s would know that.', m.name));
  end if;
  update private.member_secrets set failed_attempts = 0, locked_until = null where member_id = m.id;
  tok := encode(extensions.gen_random_bytes(32), 'hex');
  insert into private.sessions (token_hash, member_id)
       values (encode(extensions.digest(tok, 'sha256'), 'hex'), m.id);
  return jsonb_build_object('ok', true, 'token', tok, 'member', to_jsonb(m));
end $$;

create function public.me(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v smallint;
begin
  select s.member_id into v from private.sessions s
   where s.token_hash = encode(extensions.digest(coalesce(p_token,''), 'sha256'), 'hex');
  if v is null then return null; end if;
  return (select to_jsonb(m) from public.members m where m.id = v);
end $$;

create function public.logout(p_token text) returns void
language sql security definer set search_path = '' as $$
  delete from private.sessions
   where token_hash = encode(extensions.digest(coalesce(p_token,''), 'sha256'), 'hex');
$$;

-- ---------- first-time setup: color + font ----------
create function public.setup_profile(p_token text, p_color text, p_font text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v smallint := private.member_id_for(p_token); was_done boolean; m public.members;
begin
  if p_color not in ('#b8ff3d','#ff3fa4','#3fe0ff','#ff8a1c','#ffe53f','#a77bff','#ff4b4b',
                     '#3dffb5','#ff8ad8','#4d8bff','#18e0c8','#ff7a6b','#d0a8ff','#ffc21f') then
    raise exception 'Pick one of the colors on the list.';
  end if;
  if p_font not in ('Creepster','Metal Mania','Rock Salt','Permanent Marker','Press Start 2P',
                    'Black Ops One','Rubik Glitch','UnifrakturMaguntia','Sedgwick Ave Display','Monoton') then
    raise exception 'Pick one of the fonts on the list.';
  end if;
  select setup_done into was_done from public.members where id = v;
  begin
    update public.members set color = p_color, font = p_font, setup_done = true where id = v
      returning * into m;
  exception when unique_violation then
    raise exception 'Someone just grabbed that color. Pick another!';
  end;
  if not was_done then
    perform private.add_log(v, 'join', format('%s joined Game Club', m.name));
  end if;
  return to_jsonb(m);
end $$;

-- ---------- voting: 3 heat per person per round, max 2 on one game ----------
create function public.set_vote(p_token text, p_game_id bigint, p_points int) returns void
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
    raise exception 'You only get 3 🔥 per round. Take some back from another game first.';
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

-- ---------- notes + chat ----------
create function public.add_note(p_token text, p_game_id bigint, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare v smallint := private.member_id_for(p_token);
begin
  if not exists (select 1 from public.games where id = p_game_id) then raise exception 'No such game.'; end if;
  insert into public.notes (game_id, member_id, body) values (p_game_id, v, private.clean(p_body));
end $$;

create function public.send_message(p_token text, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare v smallint := private.member_id_for(p_token);
begin
  insert into public.messages (member_id, body) values (v, private.clean(p_body));
end $$;

-- ---------- backing out ----------
create function public.withdraw_game(p_token text) returns void
language plpgsql security definer set search_path = '' as $$
declare v smallint := private.member_id_for(p_token); r public.rounds := private.open_round(); g public.games;
begin
  select * into g from public.games where round_id = r.id and member_id = v and status in ('active','pending');
  if not found then raise exception 'You have nothing on the shelf to take back.'; end if;
  update public.games set status = 'withdrawn', ended_at = now() where id = g.id;
  delete from public.votes where game_id = g.id;
  update public.members set shame = shame + 1 where id = v;
  perform private.add_log(v, 'withdraw', format('%s backed out of %s (+1 shame)', private.member_name(v), g.title));
  perform private.sys_msg(v, format('😤 %s backed out of %s. SHAME.', private.member_name(v), g.title));
end $$;

-- ---------- called only by the server function after it looks up Steam + SteamSpy ----------
create function public.member_for_token(p_token text) returns smallint
language sql security definer set search_path = '' as $$
  select private.member_id_for(p_token);
$$;

create function public.add_game_internal(p_member smallint, p_appid int, p_title text, p_cover text,
                                         p_hours numeric, p_status text) returns public.games
language plpgsql security definer set search_path = '' as $$
declare r public.rounds := private.open_round(); g public.games;
begin
  begin
    insert into public.games (round_id, member_id, steam_appid, title, cover_url, hours, hours_source, status)
    values (r.id, p_member, p_appid, private.clean(p_title, 200), p_cover, p_hours,
            case when p_hours is null then null else 'steamspy' end, p_status)
    returning * into g;
  exception when unique_violation then
    raise exception 'You already have a game on the shelf. Back out of it first (shame!).';
  end;
  if p_status = 'pending' then
    perform private.add_log(p_member, 'suggest', format('%s suggested %s (waiting on Matt to check the hours)', private.member_name(p_member), g.title));
    perform private.sys_msg(p_member, format('🎮 %s suggested %s. Matt has to check how long it is.', private.member_name(p_member), g.title));
  else
    perform private.add_log(p_member, 'suggest', format('%s put %s on the shelf (~%s hrs)', private.member_name(p_member), g.title, round(g.hours,1)));
    perform private.sys_msg(p_member, format('🎮 %s put %s on the shelf!', private.member_name(p_member), g.title));
  end if;
  return g;
end $$;

-- ---------- admin (Matt) ----------
create function private.require_admin(p_token text) returns smallint
language plpgsql security definer set search_path = '' as $$
declare v smallint := private.member_id_for(p_token);
begin
  if not (select is_admin from public.members where id = v) then raise exception 'Only Matt can do that.'; end if;
  return v;
end $$;

create function public.approve_game(p_token text, p_game_id bigint, p_hours numeric) returns void
language plpgsql security definer set search_path = '' as $$
declare v smallint := private.require_admin(p_token); r public.rounds := private.open_round(); g public.games;
begin
  select * into g from public.games where id = p_game_id and status = 'pending';
  if not found then raise exception 'That game is not waiting for approval.'; end if;
  if p_hours is null or p_hours <= 0 then raise exception 'Enter how many hours it takes.'; end if;
  if p_hours > r.max_hours + 2 then
    update public.games set status = 'pulled', hours = p_hours, hours_source = 'matt', ended_at = now() where id = g.id;
    perform private.add_log(v, 'pull', format('Matt turned down %s (%s hrs is too long)', g.title, p_hours));
    perform private.sys_msg(v, format('🚫 %s is too long (%s hrs). Pick something else!', g.title, p_hours));
  else
    update public.games set status = 'active', hours = p_hours, hours_source = 'matt' where id = g.id;
    perform private.add_log(v, 'approve', format('Matt approved %s (%s hrs)', g.title, p_hours));
    perform private.sys_msg(v, format('✅ %s is approved and on the shelf!', g.title));
  end if;
end $$;

create function public.pull_game(p_token text, p_game_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare v smallint := private.require_admin(p_token); g public.games;
begin
  select * into g from public.games where id = p_game_id and status in ('active','pending');
  if not found then raise exception 'That game is not on the shelf.'; end if;
  update public.games set status = 'pulled', ended_at = now() where id = g.id;
  delete from public.votes where game_id = g.id;
  perform private.add_log(v, 'pull', format('Matt pulled %s off the shelf', g.title));
end $$;

create function public.close_round(p_token text, p_next_name text) returns void
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
  insert into public.rounds (name, max_hours) values (private.clean(coalesce(nullif(trim(p_next_name),''), 'Next Round'), 60), r.max_hours);
  perform private.add_log(v, 'round', format('%s is over! We''re playing %s (picked by %s) 🏆', r.name, w.title, private.member_name(w.member_id)));
  perform private.sys_msg(v, format('🏆 WE HAVE A WINNER: %s! %s is open, start picking.', w.title, coalesce(nullif(trim(p_next_name),''), 'Next Round')));
end $$;

-- set a member's secret code (run by Matt's setup script with the service key only)
create function public.set_member_code(p_name text, p_code text) returns void
language plpgsql security definer set search_path = '' as $$
declare v smallint;
begin
  select id into v from public.members where name = p_name;
  if v is null then raise exception 'No member named %', p_name; end if;
  insert into private.member_secrets (member_id, code_hash)
       values (v, extensions.crypt(private.norm_code(p_code), extensions.gen_salt('bf', 8)))
  on conflict (member_id) do update set code_hash = excluded.code_hash, failed_attempts = 0, locked_until = null;
  delete from private.sessions where member_id = v;
end $$;

-- ---------- who can call what ----------
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function
  public.login(text,text), public.me(text), public.logout(text),
  public.setup_profile(text,text,text), public.set_vote(text,bigint,int),
  public.add_note(text,bigint,text), public.send_message(text,text), public.withdraw_game(text),
  public.approve_game(text,bigint,numeric), public.pull_game(text,bigint), public.close_round(text,text)
to anon, authenticated;
grant execute on function
  public.member_for_token(text),
  public.add_game_internal(smallint,int,text,text,numeric,text),
  public.set_member_code(text,text)
to service_role;

-- ---------- seed ----------
insert into public.members (name, is_admin) values
  ('Hannah',false),('Junior',false),('Katie',false),('Sarah',false),('Anthony',false),
  ('Giselle',false),('Michael',false),('Kat',false),('Kalon',false),('Matt',true);

insert into public.rounds (name, max_hours) values ('Round 1', 8);

insert into public.facts (body) values
  ('Mario was originally called Jumpman.'),
  ('Mario got a mustache because it was easier to draw in a few pixels than a mouth.'),
  ('Pac-Man was Puck Man in Japan. It was renamed in the US so vandals couldn''t change the P to an F.'),
  ('Nintendo was founded in 1889. It made playing cards.'),
  ('Space Invaders speeds up as you shoot aliens because the hardware has fewer of them to draw.'),
  ('Atari buried a pile of E.T. cartridges in a New Mexico landfill. People dug them up in 2014.'),
  ('Crash Bandicoot''s joke working title at the studio was "Sonic''s Ass Game."'),
  ('A Game Boy that got burned in a bombing during the Gulf War still turns on.'),
  ('Pac-Man''s ghosts are named Blinky, Pinky, Inky and Clyde.'),
  ('The Wii was code-named Revolution.');
