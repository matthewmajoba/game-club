// Game Club server function: search Steam, look up hours on SteamSpy, add a pick.
// Hours are always looked up here on the server, never trusted from the browser.
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const cover = (appid: number) =>
  `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appid}/library_600x900.jpg`;

// SteamSpy median playtime (minutes) -> hours. null if SteamSpy has no data.
async function hoursFor(appid: number): Promise<number | null> {
  const r = await fetch(`https://steamspy.com/api.php?request=appdetails&appid=${appid}`);
  if (!r.ok) return null;
  const d = await r.json().catch(() => null);
  const mins = Number(d?.median_forever ?? 0);
  return mins > 0 ? Math.round((mins / 60) * 10) / 10 : null;
}

async function maxHours(): Promise<number> {
  const { data } = await db.from("rounds").select("max_hours").eq("status", "open").maybeSingle();
  return Number(data?.max_hours ?? 8);
}

function verdict(h: number | null, max: number) {
  if (h == null) return { kind: "nodata", ok: true, msg: "Steam doesn't know how long this one is, so it needs a quick hours check before it goes on the shelf." };
  if (h <= max) return { kind: "ok", ok: true, msg: `About ${h} hrs. Perfect!` };
  if (h <= max + 2) return { kind: "love", ok: true, msg: `About ${h} hrs... ok but just this once cause I love you!` };
  return { kind: "blocked", ok: false, msg: `This game is about ${h} hrs. That's way over ${max}. Choose a different game!` };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const p = await req.json();
    const action = String(p.action ?? "");

    if (action === "search") {
      const q = String(p.q ?? "").trim().slice(0, 80);
      if (q.length < 2) return json({ results: [] });
      const r = await fetch(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(q)}&cc=us&l=en`);
      const d = await r.json();
      const results = (d.items ?? [])
        .filter((i: { type: string }) => i.type === "app")
        .slice(0, 10)
        .map((i: { id: number; name: string; tiny_image: string }) => ({
          appid: i.id, name: i.name, thumb: i.tiny_image, cover: cover(i.id),
        }));
      return json({ results });
    }

    if (action === "info") {
      const appid = Number(p.appid);
      if (!Number.isInteger(appid) || appid <= 0) return json({ error: "Bad game id." }, 400);
      const h = await hoursFor(appid);
      return json({ appid, hours: h, verdict: verdict(h, await maxHours()) });
    }

    if (action === "add" || action === "add_manual") {
      const { data: member, error: authErr } = await db.rpc("member_for_token", { p_token: String(p.token ?? "") });
      if (authErr || !member) return json({ error: "You need to sign in first." }, 401);

      if (action === "add_manual") {
        const title = String(p.title ?? "").trim().slice(0, 200);
        if (!title) return json({ error: "Type the game's name." }, 400);
        const { data, error } = await db.rpc("add_game_internal", {
          p_member: member, p_appid: null, p_title: title, p_cover: null, p_hours: null, p_status: "pending",
        });
        if (error) return json({ error: error.message }, 400);
        return json({ game: data, verdict: verdict(null, await maxHours()) });
      }

      const appid = Number(p.appid);
      if (!Number.isInteger(appid) || appid <= 0) return json({ error: "Bad game id." }, 400);
      const det = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appid}&filters=basic`).then((r) => r.json());
      const info = det?.[appid];
      if (!info?.success) return json({ error: "Steam doesn't know that game." }, 400);
      const h = await hoursFor(appid);
      const v = verdict(h, await maxHours());
      if (!v.ok) return json({ error: v.msg, verdict: v }, 400);
      const { data, error } = await db.rpc("add_game_internal", {
        p_member: member, p_appid: appid, p_title: String(info.data.name).slice(0, 200), p_cover: cover(appid),
        p_hours: h, p_status: h == null ? "pending" : "active",
      });
      if (error) return json({ error: error.message }, 400);
      return json({ game: data, verdict: v });
    }

    return json({ error: "Unknown action." }, 400);
  } catch (e) {
    return json({ error: "Something broke: " + (e instanceof Error ? e.message : String(e)) }, 500);
  }
});
