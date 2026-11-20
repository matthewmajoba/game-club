# Game Club — Build Plan

Book club, but for games. A deliberately amateur, mid-2000s-style site for a 10-person club.

## Members
Hannah, Junior, Katie, Sarah, Anthony, Giselle, Michael, Kat, Kalon, Matt (admin).

## Stack
- **Database / backend:** Supabase (free tier). Realtime for chat, presence, and the wall.
  - Project: `game-club`, ref `krcnrsuybiuknxbwsjkp`, region us-east-1, free org
    (created 2026-11-14 via CLI; this folder is linked with `supabase link`).
  - Keys + DB password live only in `.env.local` (gitignored). Anon key is safe for the browser;
    service-role key and DB password are server-only.
  - Note: free projects pause after ~1 week of no activity; restore with one click.
- **Hosting:** Vercel (later). Repo: github.com/matthewmajoba/game-club (public, so no secrets in it).
- **Game data:** Steam store (no account or key). Search via `store.steampowered.com/api/storesearch`
  through a Supabase Edge Function (Steam doesn't allow direct browser calls). Box art from
  `shared.akamai.steamstatic.com/store_item_assets/steam/apps/{appid}/library_600x900.jpg`.
  (RAWG was the first choice, but its sign-up was broken.)
  - Steam has no playtime data, and users can't be trusted to type hours → **switching to IGDB**.
- **Game data (final): Steam + SteamSpy, no accounts or keys.** (IGDB needed a Twitch account,
  and RAWG's sign-up form never submits.)
  - Search + box art: Steam store (above).
  - Hours: SteamSpy `https://steamspy.com/api.php?request=appdetails&appid={id}` → `median_forever`
    (minutes). Median tracks real game length well (Edith Finch 2.4h, Inside 3.6h, Portal 2.9h,
    Obra Dinn 6.6h); the average is skewed by idlers (Inside avg 18h). Rate limit ~1 req/s → cache it.
  - Looked up by the Supabase Edge Function and saved with the suggestion; users can't fake hours.
  - Rules use the median: ≤8h OK, 8–10h "ok but just this once cause I love you!", >10h blocked.
  - Not on Steam / no data: goes to "awaiting Matt" until Matt approves. Matt can also pull any game.

## Login (no signup)
- Pick your name → "If you're really {name}, tell me something only I would know…" (playful prompt).
- The real answer is a per-person secret code: **two silly words** (generated, handed out privately by Matt).
- Codes stored **hashed** (pgcrypto/bcrypt). Checked by a Postgres function server-side, never in the browser.
- Success returns a session token saved in localStorage ("remember me"); all writes go through
  Postgres functions that validate that token.
- Matt can reset any code.
- **Visitors** (not logged in) can see everything read-only.

## First login
- Choose your color from a preset palette of ~14 cool, high-contrast colors. First come, first served;
  taken colors are greyed out. Colors must be readable on the final background.

## Layout
- **Desktop:** game wall on the left, AIM-style buddy list + chat on the right.
- **Mobile (primary audience):** bottom tabs — Wall | Messenger (unread badge on Messenger).
- Header has a **Log** button: color-coded history of everything that happened (suggestions,
  withdrawals, votes, round results, sign-ons).

## Game wall (video-store display vibe)
- Wall/shelf display of game cases with cover art from RAWG.
- In front of each case: a hand-drawn, colorful card naming who recommended it.
- New game: simple pop-in + confetti + flourish.
- Each person may have **one active suggestion** at a time.
- Search the game DB from our site when adding.
- **Playtime rule (round 1: under 8 hours):**
  - ≤ 8 h: allowed.
  - 8–10 h: allowed with "ok but just this once cause I love you!"
  - \> 10 h: blocked — "this game exceeds 8 hours, choose a different game."
  - No playtime data: allowed if they tick a "pinky promise" box.
- **Withdrawing** a suggestion: the post-it gets moved to the side and the person's **shame counter**
  goes up. Clicking a shame counter pops up an original little figure doing a sassy, stop-motion
  "ah ah ah" finger-wag.

## Voting — "heat" 🔥
- Each person gets **3 🔥** per round to spread across games; **max 2 on one game** (a "big vote").
- A game's heat % = its 🔥 / all 🔥 spent this round.
- Tiered emoji, each a two-frame slow animation:
  - 0 🔥 ICE COLD 🥶/🧊 · <10% MEH 😐/😑 · 10–20% WARMING UP 😏/😉 · 20–30% HOT 🥵/😩 · >30% ON FIRE 🔥/🥵 (shakes)

## Notes per game
- Each game has a discussion thread of notes.

## Messenger (original AIM-style, not AIM branding/assets)
- Buddy list showing online / away / offline.
- Sign on / sign off manually; door open/close sounds (original, synthesized).
- One group chat room.

## Rounds
- Matt (admin) has a secret button to close the round; hottest game wins, wall resets,
  winners go to a "Hall of Fame" shelf.
- The latest winner gets its own "Game we're playing" spot under the ticker: sharp lights.
  Laser fans (one bursting from behind the box art, one raking in from the top-right), neon tubes
  riding the frame and overshooting the corners, aurora ribbons, and a light sweep. The lights
  live in .np-spill, which is bigger than the panel and fades out, so they spill a little past
  the edge (sideways only on wide screens, so phones never scroll sideways). Box art | title +
  PLAY NOW | game night ticket. Matt posts the link in Admin (`games.play_url`, `set_play_link`).
- The talk (columns still named meet_at/meet_place, RPC set_game_night): not a game night, it is
  when everyone hops on to talk about the game after playing it. Matt picks Pacific or
  Central in Admin (`games.meet_tz` PT/CT); the ticket, chat and log all show it in that zone
  (PT, or CST/CDT by date). Ticket has a countdown, Add to calendar (.ics) and Google Calendar.
- Talking Points: four simple questions (loved, bugged you, moment that stuck, tell a friend?),
  opened from the ticket. Edit `TALK` in app.js.
- Snapshots: each member pins one screenshot from their playthrough of the winner plus why it
  caught their eye (`shots` table, public `shots` storage bucket). Uploads go through the `games`
  edge function (`shot_upload` / `shot_remove`), which checks the session token and that the
  file really is a JPG/PNG/WEBP. The browser shrinks pictures to 1600px JPEG first.

## Icons
- Pixel icons from Pixelarticons (MIT, credited in the footer), copied into `js/icons.js`.
  `icon("name")` makes one; `withIcons(text)` swaps emoji in saved chat/log text for icons.
  To add one, copy its path from the pixelarticons@2.4.2 `svg/` folder into that file.

## Input safety
- All text rendered as plain text (no innerHTML) → no script injection.
- Supabase uses parameterized queries → no SQL injection.
- 500-character max enforced by DB CHECK constraints; counter only appears near the limit (~450).

## Visual style (chosen: v2, see mockups/v2-dark-club.html)
- Dark version of option #2 "School Club Page": fiery WordArt title, beveled buttons, "best viewed in" badges.
- Page background: tiled neon squiggle photo (Pexels, RDNE Stock project) → mockups/img/neon-tile.jpg.
- Panel borders: real checkered-fabric photo (Unsplash, A Chosen Soul) → mockups/img/checker-tile.jpg,
  with a lime dashed stitch inside.
- Messenger: **group chat room only** (no buddy list); a "here now" line shows who's online.
- Game wall: video-game store wall display — red header sign, black slatwall, cases faced out on
  shelf ledges with shelf tags, hand-drawn recommender card in front, heat sticker on each case.
  Withdrawn picks go in a "RETURNS 'N SHAME" bargain bin.
- Messenger: original AIM-style buddy list + chat room windows (menu bar, goofy banner ad,
  Online/List Setup tabs, collapsible groups, away messages, icon dock, formatting toolbar, Send),
  with the dark glitter background from option #3 inside.
- Ticker "GCNN": stupid-but-true game facts (stored in the DB so we can add more).
- First sign-in: prove it (secret words) → pick color (14, first come first served) →
  pick font (10 edgy fonts) → preview. Names show in each member's color + font everywhere.
  - Fonts: Creepster, Metal Mania, Rock Salt, Permanent Marker, Press Start 2P, Black Ops One,
    Rubik Glitch, UnifrakturMaguntia, Sedgwick Ave Display, Monoton.

## Build status (2026-11-14)
- **Done:** database (`supabase/migrations/`), Steam/SteamSpy function (`supabase/functions/games/`),
  site (`index.html`, `css/`, `js/`), member codes (`scripts/set_codes.py` → `member-codes.txt`, gitignored).
- Tested end to end with a temporary "Tester" member (deleted afterward): 23 API rule checks pass;
  sign-in, add game, voting, notes, back-out + sass, log, chat counter and phone layout checked in a browser.
- **Live:** https://game-club-mauve.vercel.app (Vercel, imported from GitHub; every push to `main`
  redeploys). `.vercelignore` keeps secrets, mockups, scripts and supabase/ off the live site.
- Link previews: `img/og-image.jpg` + Open Graph tags in `index.html` (absolute URLs use the
  address above; update them if the domain changes). Icons + `site.webmanifest` for home screens.
  Rebuild images with `python scripts/make_share_images.py`.
- Known gap: Steam search can show adult-only games in results; nothing filters them yet.
- **Daily Reading** (under the chat; daily saying + crystal ball like button) (`js/pep.js`, migration `20261116020000_daily_pep_talk.sql`):
  30 sayings in `public.sayings`, one per day, flipping at midnight Pacific. The floating crystal
  ball (WebGL shader: iridescent swirling fog, glitter, energy filaments) adds to one shared pool
  per day in `public.saying_likes` (members only; visitors can tap for fun but it doesn't count).
  Server caps: 40 per call, 5000 per member per day. Inside, a heart and "LIKE 👍" take turns
  (every ~7 s, and a tap brings up LIKE), each dissolving into / forming out of the fog. Taps
  charge the ball: brighter, faster swirl, energy strands spiralling out, orbit rings at high
  charge, and a spark flies to the counter per like. No breaking, no prompts.
- **Crystal Ball of Encouragement and Love** (saved notes; migration `20261116030000_love_notes.sql`, 🔮 header button): every finished day's
  saying + total likes, saved in `public.love_notes`. Saved lazily by `archive_love_notes()` when
  anyone opens Love Notes (finished days can't change, so late saving is still exact).
- Re-deploy after changes: `npx supabase db push` (new migration file) and
  `npx supabase functions deploy games --no-verify-jwt --use-api`.

## Open decisions
- [ ] Screen names (AIM-style handles) or just real names in custom fonts?
- [ ] Club rules beyond the 8-hour limit.

## Speed notes
- The Daily Reading crystal ball and counter use WebGL. Their shaders compile in the background
  (KHR_parallel_shader_compile) after the page is drawn; asking for the result early froze the
  page for ~1.5s, worst on Windows. Keep it that way.
- Background textures are WebP at display size (neon 900px, checker 840px).
