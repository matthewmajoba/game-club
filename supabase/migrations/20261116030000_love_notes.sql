-- Love Notes: once a day is over, its saying and how many likes it got are saved for good.
-- Saving happens lazily: anyone opening Love Notes calls archive_love_notes(), which files
-- every finished day (launch day up to yesterday) that isn't saved yet. A finished day's
-- likes can't change anymore, so saving late is still exact.

create table public.love_notes (
  day date primary key,
  body text not null,
  likes int not null default 0
);
alter table public.love_notes enable row level security;
create policy "anyone can read" on public.love_notes for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.love_notes from anon, authenticated;

-- same rotation the page uses: days since 1970-01-01, mod the number of sayings, by id order
create function private.saying_for(d date) returns text
language sql stable set search_path = '' as $$
  select body from public.sayings order by id
  offset ((d - date '1970-01-01') % greatest((select count(*) from public.sayings), 1)) limit 1
$$;

create function public.archive_love_notes() returns void
language sql security definer set search_path = '' as $$
  insert into public.love_notes (day, body, likes)
  select g::date, private.saying_for(g::date),
         coalesce((select sum(n) from public.saying_likes l where l.day = g::date), 0)
    from generate_series(date '2026-11-14', private.club_today() - 1, interval '1 day') g
  on conflict (day) do nothing
$$;

revoke execute on function private.saying_for(date) from public, anon, authenticated;
revoke execute on function public.archive_love_notes() from public, anon, authenticated;
grant execute on function public.archive_love_notes() to anon, authenticated;
