-- 1) Neutral wording: the admin is just another member, so server messages don't name him.
-- 2) ~140 more stupid-but-true game facts for the ticker.

create or replace function public.login(p_name text, p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m public.members; s private.member_secrets; tok text;
begin
  select * into m from public.members where lower(name) = lower(trim(coalesce(p_name,'')));
  if not found then return jsonb_build_object('ok', false, 'error', 'Who are you?'); end if;
  select * into s from private.member_secrets where member_id = m.id for update;
  if not found or s.code_hash is null then
    return jsonb_build_object('ok', false, 'error', 'You don''t have a code yet.');
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

create or replace function private.require_admin(p_token text) returns smallint
language plpgsql security definer set search_path = '' as $$
declare v smallint := private.member_id_for(p_token);
begin
  if not (select is_admin from public.members where id = v) then raise exception 'That''s an admin thing.'; end if;
  return v;
end $$;

create or replace function public.add_game_internal(p_member smallint, p_appid int, p_title text, p_cover text,
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
    perform private.add_log(p_member, 'suggest', format('%s suggested %s (needs an hours check)', private.member_name(p_member), g.title));
    perform private.sys_msg(p_member, format('🎮 %s suggested %s. It needs a quick hours check first.', private.member_name(p_member), g.title));
  else
    perform private.add_log(p_member, 'suggest', format('%s put %s on the shelf (~%s hrs)', private.member_name(p_member), g.title, round(g.hours,1)));
    perform private.sys_msg(p_member, format('🎮 %s put %s on the shelf!', private.member_name(p_member), g.title));
  end if;
  return g;
end $$;

create or replace function public.approve_game(p_token text, p_game_id bigint, p_hours numeric) returns void
language plpgsql security definer set search_path = '' as $$
declare v smallint := private.require_admin(p_token); r public.rounds := private.open_round(); g public.games;
begin
  select * into g from public.games where id = p_game_id and status = 'pending';
  if not found then raise exception 'That game is not waiting for a check.'; end if;
  if p_hours is null or p_hours <= 0 then raise exception 'Enter how many hours it takes.'; end if;
  if p_hours > r.max_hours + 2 then
    update public.games set status = 'pulled', hours = p_hours, hours_source = 'matt', ended_at = now() where id = g.id;
    perform private.add_log(v, 'pull', format('%s is too long (%s hrs), back to the store it goes', g.title, p_hours));
    perform private.sys_msg(v, format('🚫 %s is too long (%s hrs). Pick something else!', g.title, p_hours));
  else
    update public.games set status = 'active', hours = p_hours, hours_source = 'matt' where id = g.id;
    perform private.add_log(v, 'approve', format('%s passed the hours check (%s hrs)', g.title, p_hours));
    perform private.sys_msg(v, format('✅ %s passed the hours check and is on the shelf!', g.title));
  end if;
end $$;

create or replace function public.pull_game(p_token text, p_game_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare v smallint := private.require_admin(p_token); g public.games;
begin
  select * into g from public.games where id = p_game_id and status in ('active','pending');
  if not found then raise exception 'That game is not on the shelf.'; end if;
  update public.games set status = 'pulled', ended_at = now() where id = g.id;
  delete from public.votes where game_id = g.id;
  perform private.add_log(v, 'pull', format('%s was taken off the shelf', g.title));
end $$;

-- ---------- more stupid-but-true facts ----------
insert into public.facts (body) values
($f$Mario's first job was carpenter. He became a plumber in Mario Bros. (1983).$f$),
($f$Mario wears a cap because hair was too hard to draw with so few pixels.$f$),
($f$Luigi started out as a recolored Mario so two people could play.$f$),
($f$In the US, Princess Peach was called Princess Toadstool for years.$f$),
($f$Bowser's name in Japan is Koopa.$f$),
($f$Wario's name mixes "warui" (Japanese for "bad") and Mario.$f$),
($f$Waluigi's first game was Mario Tennis in 2000.$f$),
($f$The clouds and bushes in Super Mario Bros. are the same drawing in different colors.$f$),
($f$All of Super Mario Bros. fits in about 40 kilobytes.$f$),
($f$Yoshi was planned for the first Super Mario Bros., but the NES couldn't handle him.$f$),
($f$America's Super Mario Bros. 2 is a reskinned Japanese game called Doki Doki Panic.$f$),
($f$Japan's real Super Mario Bros. 2 was considered too hard for Americans. We got it later as The Lost Levels.$f$),
($f$Princess Peach can float in Super Mario Bros. 2.$f$),
($f$Mario Kart's blue shell is officially called the Spiny Shell.$f$),
($f$The first Mario Kart was Super Mario Kart in 1992.$f$),
($f$Charles Martinet voiced Mario for about 30 years before retiring in 2023.$f$),
($f$Speedrunners beat Super Mario Bros. in under 5 minutes.$f$),
($f$Donkey Kong (1981) was Mario's first game.$f$),
($f$Sonic is blue to match Sega's logo.$f$),
($f$Sonic's red-and-white shoes were inspired by Santa Claus and Michael Jackson's boots.$f$),
($f$Tails' real name is Miles Prower. Say it fast.$f$),
($f$Dr. Robotnik has always been called Eggman in Japan.$f$),
($f$Before Sonic, Sega's mascot was Alex Kidd.$f$),
($f$Sega stands for "Service Games."$f$),
($f$Capcom stands for "Capsule Computers."$f$),
($f$Nintendo roughly translates to "leave luck to heaven."$f$),
($f$Before video games, Nintendo tried running a taxi company and selling instant rice.$f$),
($f$The NES was called the Famicom in Japan.$f$),
($f$Later NES Zappers were made bright orange so nobody would mistake them for real guns.$f$),
($f$You can't shoot the dog in Duck Hunt on the NES. You can in the arcade version.$f$),
($f$The 1989 movie The Wizard gave America its first look at Super Mario Bros. 3.$f$),
($f$Nintendo Power magazine ran from 1988 to 2012.$f$),
($f$Link is left-handed in most of the classic Zelda games.$f$),
($f$Zelda is the princess. The hero is Link.$f$),
($f$"It's dangerous to go alone! Take this." is from the first Legend of Zelda (1986).$f$),
($f$Zelda II has a character named Error. He tells you "I am Error."$f$),
($f$Majora's Mask was made in about a year by reusing Ocarina of Time's engine.$f$),
($f$Breath of the Wild was first prototyped as a simple 2D, NES-style game.$f$),
($f$Navi's "Hey! Listen!" comes from Ocarina of Time.$f$),
($f$In the first Metroid, players only found out Samus is a woman at the very end.$f$),
($f$Kirby was white on the US box of his first game because the Game Boy screen had no color.$f$),
($f$Pokémon Red and Green came out in Japan in 1996.$f$),
($f$Pokémon's creator, Satoshi Tajiri, collected bugs as a kid.$f$),
($f$Ash is called Satoshi in Japan, after Pokémon's creator.$f$),
($f$Gary is called Shigeru in Japan, after Shigeru Miyamoto.$f$),
($f$Mew was snuck into Pokémon Red and Green by a programmer right before release.$f$),
($f$In Pokémon Red and Blue, a bug made Ghost moves do nothing to Psychic types.$f$),
($f$MissingNo. is a glitch Pokémon from Red and Blue.$f$),
($f$Pokémon was almost called Capsule Monsters.$f$),
($f$In Pokémon Yellow, Pikachu follows you around.$f$),
($f$You could print your Pokémon Snap photos at Blockbuster kiosks.$f$),
($f$Satoru Iwata compressed Pokémon Gold and Silver so well that a whole second region fit.$f$),
($f$Super Smash Bros. started as a prototype called Dragon King: The Fighting Game.$f$),
($f$Shigeru Miyamoto created Mario, Donkey Kong and The Legend of Zelda.$f$),
($f$The Virtual Boy could only show red.$f$),
($f$The GameCube had a handle.$f$),
($f$The PlayStation started as a CD add-on for the Super Nintendo.$f$),
($f$The PS2 is the best-selling console ever, at over 160 million.$f$),
($f$On PlayStation buttons, the triangle is a viewpoint and the square is a sheet of paper.$f$),
($f$A PlayStation 1 memory card held 128 kilobytes.$f$),
($f$Ape Escape was the first PlayStation game that required the analog sticks.$f$),
($f$The Xbox was almost called the DirectX Box.$f$),
($f$Fixing the Xbox 360's Red Ring of Death cost Microsoft over a billion dollars.$f$),
($f$The Sega Dreamcast had a built-in modem.$f$),
($f$Wii Sports is one of the best-selling games ever, mostly because it came with the Wii.$f$),
($f$Nintendo made the Wii remote straps stronger after people flung remotes into their TVs.$f$),
($f$Pac-Man was designed partly to get more women into arcades.$f$),
($f$Level 256 of Pac-Man can't be beaten because a bug scrambles half the screen.$f$),
($f$Each Pac-Man ghost chases you in its own way.$f$),
($f$Ms. Pac-Man started as an unofficial hack called Crazy Otto.$f$),
($f$Pong's first test machine "broke" because its coin box was overflowing with quarters.$f$),
($f$Steve Jobs worked at Atari, and Steve Wozniak helped design Breakout.$f$),
($f$One of the first video game Easter eggs: Warren Robinett hid his name in Atari's Adventure (1979).$f$),
($f$E.T. for the Atari 2600 was made in about five weeks.$f$),
($f$Most early Atari 2600 games were 4 kilobytes or less.$f$),
($f$The Magnavox Odyssey (1972) was the first home console. It came with plastic overlays you stuck on your TV.$f$),
($f$Spacewar! (1962) was one of the very first video games, made at MIT.$f$),
($f$Tennis for Two (1958) was played on an oscilloscope.$f$),
($f$Q*bert's "swearing" is just random computer speech.$f$),
($f$Street Fighter II's combos started out as a bug.$f$),
($f$Mega Man is called Rockman in Japan. His sister is Roll. Rock and Roll.$f$),
($f$The US box art for the first Mega Man is famously terrible.$f$),
($f$In the US version of Contra, the Konami Code gives you 30 lives.$f$),
($f$"All your base are belong to us" comes from the bad English translation of Zero Wing.$f$),
($f$"Do a barrel roll!" is Peppy's advice in Star Fox 64.$f$),
($f$"Thank you Mario! But our princess is in another castle!" is from Super Mario Bros.$f$),
($f$Resident Evil is called Biohazard in Japan.$f$),
($f$"You were almost a Jill sandwich!" is a real line from Resident Evil (1996).$f$),
($f$Silent Hill's famous fog hid how little the PlayStation could draw in the distance.$f$),
($f$In Metal Gear Solid, Psycho Mantis reads your memory card and comments on your other games.$f$),
($f$To beat Psycho Mantis, you plug your controller into port 2.$f$),
($f$Chrono Trigger has more than ten different endings.$f$),
($f$Mortal Kombat's blood helped lead to video game age ratings in the US in 1994.$f$),
($f$The SNES version of Mortal Kombat turned the blood into gray "sweat."$f$),
($f$GoldenEye 007 was first planned as an on-rails shooter.$f$),
($f$Most of the GoldenEye 007 team had never made a game before.$f$),
($f$Rare, the studio behind GoldenEye, also made Battletoads.$f$),
($f$Rayman has no arms or legs because it made him easier to animate.$f$),
($f$Halo was first shown to the world at a Mac conference in 1999.$f$),
($f$You almost never see Master Chief's face.$f$),
($f$Half-Life's Gordon Freeman never says a word.$f$),
($f$Portal started as a student project called Narbacular Drop.$f$),
($f$GLaDOS is voiced by Ellen McLain.$f$),
($f$"The cake is a lie" comes from Portal (2007).$f$),
($f$People have gotten Doom running on calculators, fridges and even inside a pregnancy test.$f$),
($f$Minecraft was originally called Cave Game.$f$),
($f$Minecraft's Creeper came from a botched pig model.$f$),
($f$Minecraft's Ghast sounds were made by the composer's cat.$f$),
($f$Microsoft bought Minecraft's studio for $2.5 billion in 2014.$f$),
($f$Grand Theft Auto started out as a game called Race'n'Chase.$f$),
($f$GTA V made a billion dollars in three days.$f$),
($f$Will Wright made The Sims after losing his home in a 1991 fire.$f$),
($f$Sims speak Simlish, a made-up language.$f$),
($f$SimCity started because Will Wright had more fun with a game's level editor than the game.$f$),
($f$Animal Crossing's K.K. Slider is based on Nintendo composer Kazumi Totaka.$f$),
($f$Tom Nook is a tanuki, not a raccoon.$f$),
($f$Isabelle from Animal Crossing is a Shih Tzu.$f$),
($f$You can die of dysentery in The Oregon Trail.$f$),
($f$The Oregon Trail was first made in 1971 by student teachers.$f$),
($f$Where in the World Is Carmen Sandiego? came with a real almanac.$f$),
($f$Tetris was made in 1984 by Alexey Pajitnov in Moscow.$f$),
($f$Tetris's famous music is a Russian folk song called Korobeiniki.$f$),
($f$A cosmonaut took a Game Boy with Tetris to the Mir space station in 1993.$f$),
($f$Game Boy Tetris sold over 35 million copies.$f$),
($f$Solitaire came with Windows to teach people to drag and drop with a mouse.$f$),
($f$Windows' 3D Pinball was dropped because it was too buggy to move to 64-bit.$f$),
($f$Chrome's offline dinosaur is a real game. Just press space.$f$),
($f$Google turned its logo into a playable Pac-Man in 2010.$f$),
($f$Snake took off on Nokia phones in 1997.$f$),
($f$Tamagotchi comes from "tamago," Japanese for egg.$f$),
($f$Phoenix Wright is called Ryuichi Naruhodo in Japan.$f$),
($f$Dance Dance Revolution was used in some school gym classes.$f$),
($f$Katamari Damacy is about rolling up junk to rebuild the stars.$f$),
($f$"Through the Fire and Flames" in Guitar Hero III is famously the hardest song.$f$),
($f$Blockbuster used to rent video games.$f$),
($f$Angry Birds was Rovio's 52nd game.$f$),
($f$Flappy Bird's creator pulled it from app stores at the height of its fame.$f$),
($f$Among Us came out in 2018 but didn't blow up until 2020.$f$),
($f$Fortnite started as a co-op zombie game.$f$),
($f$Rocket League's first version was called Supersonic Acrobatic Rocket-Powered Battle-Cars.$f$),
($f$Untitled Goose Game won Game of the Year at the 2020 D.I.C.E. Awards.$f$),
($f$Undertale was made almost entirely by one person, Toby Fox.$f$),
($f$Stardew Valley was made by one person over about four years.$f$),
($f$Hollow Knight was made by Team Cherry, with just three main developers.$f$),
($f$Celeste started as a game made in four days.$f$),
($f$Cuphead's developers remortgaged their houses to finish it.$f$),
($f$Cuphead is hand-drawn to look like 1930s cartoons.$f$),
($f$Goat Simulator started as a game jam joke, and they kept the bugs on purpose.$f$),
($f$World of Warcraft's Corrupted Blood plague (2005) was studied by real disease scientists.$f$),
($f$The Leeroy Jenkins video came out in 2005.$f$),
($f$One EVE Online battle in 2014 destroyed ships worth about $300,000 in real money.$f$),
($f$Twitch started as part of a site called Justin.tv.$f$),
($f$Games Done Quick speedrun marathons have raised tens of millions of dollars for charity.$f$),
($f$Skyrim guards: "I used to be an adventurer like you, then I took an arrow in the knee."$f$),
($f$In Skyrim, putting a bucket over a shopkeeper's head lets you rob them.$f$);
