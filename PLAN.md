# Game Club — Build Plan

Book club, but for games. A deliberately amateur, mid-2000s-style site for a 10-person club.

## Members
Hannah, Junior, Katie, Sarah, Anthony, Giselle, Michael, Kat, Kalon, Matt (admin).

## Stack
- **Database / backend:** Supabase (free tier). Realtime for chat, presence, and the wall.
  - Note: free projects pause after ~1 week of no activity; restore with one click.
- **Hosting:** Vercel (later). Repo: github.com/matthewmajoba/game-club (public, so no secrets in it).
- **Game data:** RAWG API (free, non-commercial, requires attribution). Key is kept server-side
  in a Supabase Edge Function proxy so it isn't exposed in the browser.

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

## Open decisions
- [ ] Screen names (AIM-style handles) or just real names in custom fonts?
- [ ] Club rules beyond the 8-hour limit.
