-- Daily pep talk: 30 sayings that rotate one per day (Pacific time), plus a shared
-- pool of likes that members add to by smashing the like button.

create table public.sayings (
  id int primary key,
  body text not null check (char_length(body) between 1 and 200)
);

create table public.saying_likes (
  day date not null,
  member_id smallint not null references public.members(id) on delete cascade,
  n int not null default 0 check (n >= 0),
  primary key (day, member_id)
);

alter table public.sayings enable row level security;
alter table public.saying_likes enable row level security;
create policy "anyone can read" on public.sayings for select to anon, authenticated using (true);
create policy "anyone can read" on public.saying_likes for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.sayings, public.saying_likes from anon, authenticated;

alter publication supabase_realtime add table public.saying_likes;

-- the club's "today" (the saying flips at midnight Pacific)
create function private.club_today() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'America/Los_Angeles')::date
$$;

-- Add a batch of smashes for today. The browser batches clicks, so one call can carry
-- several, but never more than 40, and nobody can pile on more than 5000 a day.
create function public.smash_like(p_token text, p_count int) returns int
language plpgsql security definer set search_path = '' as $$
declare v smallint := private.member_id_for(p_token);
        d date := private.club_today();
        c int := least(greatest(coalesce(p_count, 0), 0), 40);
        total int;
begin
  if c > 0 then
    insert into public.saying_likes (day, member_id, n) values (d, v, c)
    on conflict (day, member_id) do update set n = least(public.saying_likes.n + excluded.n, 5000);
  end if;
  select coalesce(sum(n), 0) into total from public.saying_likes where day = d;
  return total;
end $$;

revoke execute on function private.club_today() from public, anon, authenticated;
revoke execute on function public.smash_like(text, int) from public, anon, authenticated;
grant execute on function public.smash_like(text, int) to anon, authenticated;

insert into public.sayings (id, body) values
(1,  $s$I will always believe in you. Even when you pick a 9-hour game.$s$),
(2,  $s$You are the main character. Everyone else is just an NPC who thinks you're cool.$s$),
(3,  $s$If you were a save file, I'd back you up on three memory cards.$s$),
(4,  $s$You're not behind. You're just doing the side quests.$s$),
(5,  $s$Your respawn timer is zero. Get back out there, champ.$s$),
(6,  $s$I'd give you my last health potion. No hesitation.$s$),
(7,  $s$You're the reason the group chat is worth opening.$s$),
(8,  $s$Even on hard mode, you've got this.$s$),
(9,  $s$You're doing great, sweetie. The loading screen is almost done.$s$),
(10, $s$If life had co-op, I'd pick you as player 2 every single time.$s$),
(11, $s$You are 100% completion material.$s$),
(12, $s$Somebody out there brags about knowing you. It's me. I'm somebody.$s$),
(13, $s$You don't need a walkthrough. You're figuring it out beautifully.$s$),
(14, $s$You have the energy of a Game Boy with fresh batteries.$s$),
(15, $s$You're a rare drop. Legendary loot. The shiny one.$s$),
(16, $s$It's okay to pause. The game will wait for you. So will we.$s$),
(17, $s$Today's forecast: 100% chance you crush it.$s$),
(18, $s$I'm proud of you. Embarrassing-mom-at-the-recital proud.$s$),
(19, $s$You make the whole world feel like a cozy save room.$s$),
(20, $s$Drink some water. Main characters stay hydrated.$s$),
(21, $s$You've survived 100% of your worst days so far. That's a perfect record.$s$),
(22, $s$You're not a glitch. You're a feature.$s$),
(23, $s$Achievement unlocked: being a really good friend.$s$),
(24, $s$You deserve a confetti cannon just for showing up today.$s$),
(25, $s$Remember: you are the cheat code.$s$),
(26, $s$Even your shame counter is kind of adorable.$s$),
(27, $s$You're the extra life I didn't know I needed.$s$),
(28, $s$Bad days are just tutorial levels. You're still learning the controls.$s$),
(29, $s$If you were a game, I'd give you a 10/10 and buy the collector's edition.$s$),
(30, $s$You are loved more than a Blockbuster on a Friday night.$s$);
