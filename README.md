# Game Club

Like book club, but for games. A deliberately mid-2000s-looking site for a 10-person club:
everyone puts one short game on the "store shelf", spends 3 🔥 on the ones they want to play,
and chats in an old-school chat room.

- `index.html`, `css/`, `js/`: the site (plain HTML/CSS/JS, no build step).
- `supabase/migrations/`: database tables, rules and seed data.
- `supabase/functions/games/`: server function for Steam search + SteamSpy hours.
- `scripts/set_codes.py`: gives members new two-word secret codes.
- `mockups/`: the design mockups.
- `PLAN.md`: every decision made so far.

Secrets live only in `.env.local` and `member-codes.txt`, which are never committed.

To run it locally: `python -m http.server 8000` in this folder, then open http://localhost:8000.
