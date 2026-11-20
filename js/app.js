// Game Club front end.
// Safety rule for this file: user-written text is only ever inserted with textContent
// (through h()), never as HTML, so nobody can inject scripts into the page.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import { initPep } from "./pep.js";
import { icon, withIcons } from "./icons.js";

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const FN_URL = `${SUPABASE_URL}/functions/v1/games`;
const MAX_LEN = 500, WARN_AT = 450;

// ---------- constants ----------
const FONTS = {
  "Creepster": 1.05, "Metal Mania": 1.05, "Rock Salt": 0.72, "Permanent Marker": 0.9, "Press Start 2P": 0.58,
  "Black Ops One": 0.92, "Rubik Glitch": 0.92, "UnifrakturMaguntia": 1.05, "Sedgwick Ave Display": 1.05, "Monoton": 0.85,
};
const PALETTE = [
  ["Toxic Lime", "#b8ff3d"], ["Hot Pink", "#ff3fa4"], ["Electric Cyan", "#3fe0ff"], ["Blaze Orange", "#ff8a1c"],
  ["Laser Lemon", "#ffe53f"], ["Ultraviolet", "#a77bff"], ["Blood Red", "#ff4b4b"], ["Mint Rush", "#3dffb5"],
  ["Bubblegum", "#ff8ad8"], ["Plasma Blue", "#4d8bff"], ["Acid Teal", "#18e0c8"], ["Sunset Coral", "#ff7a6b"],
  ["Lavender Haze", "#d0a8ff"], ["Gold Rush", "#ffc21f"],
];
const TIERS = [
  { k: "ICE COLD", a: "snowflake", b: "snowflake-solid", rule: "no heat" },
  { k: "MEH", a: "meh", b: "annoyed", rule: "under 10% of the heat" },
  { k: "WARMING UP", a: "smile", b: "laugh", rule: "10–20%" },
  { k: "HOT", a: "thermometer", b: "sun-solid", rule: "20–30%" },
  { k: "ON FIRE", a: "fire", b: "zap", rule: "over 30%" },
];
const TILTS = ["-2deg", "1.5deg", "-1deg", "2deg", "-1.5deg", "1deg"];

// ---------- state ----------
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* private mode */ } },
};
const S = {
  token: store.get("gc_token"), me: null, members: [], round: null, games: [], votes: [], hof: [],
  messages: [], facts: [], chatOn: store.get("gc_chat_on") !== "0", here: new Set(), hereReady: false,
  unread: 0, tab: "wall", openGameId: null, logOpen: false,
};

// ---------- tiny DOM helper (text is always text) ----------
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "vars") for (const [n, val] of Object.entries(v)) e.style.setProperty(n, val);
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (k in e && typeof v !== "string") e[k] = v;
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) e.append(c instanceof Node ? c : String(c));
  return e;
}
const $ = (id) => document.getElementById(id);
const member = (id) => S.members.find((m) => m.id === id);
const fmtTime = (t) => new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const fmtDay = (t) => new Date(t).toLocaleDateString([], { month: "short", day: "numeric" });

// If a name we don't know shows up (member list still loading or out of date),
// reload the member list instead of ever showing a placeholder name.
let membersReloading = null;
function reloadMembersSoon() {
  if (!membersReloading) membersReloading = loadMembers().then(renderAll).finally(() => { membersReloading = null; });
}
function nameEl(m, cls = "nm") {
  if (!m) { reloadMembersSoon(); return h("span", { class: cls }, "…"); }
  return h("span", { class: cls, vars: { "--mc": m.color || "#fff", "--mf": m.font ? `'${m.font}'` : "var(--ui)", "--fs": String(FONTS[m.font] || 0.85) } }, m.name);
}
const flip = (t) => h("span", { class: "flip" }, h("b", null, icon(t.a)), h("b", null, icon(t.b)));
// a flame (the voting currency); n of them in a row
const flames = (n) => Array.from({ length: n }, () => icon("fire", "flame"));
// a button/label with a pixel icon in front
const lbl = (name, text) => [icon(name), " ", text];

function toast(msg, bad = false) {
  const t = h("div", { class: "toast" + (bad ? " bad" : ""), role: "status" }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), bad ? 4200 : 2600);
}
const errMsg = (e) => (e && (e.message || e.error)) || "Something went wrong.";

// char counter that only shows up near the limit
function withCounter(textarea) {
  const cnt = h("span", { class: "cnt", hidden: true });
  const upd = () => {
    const n = textarea.value.length;
    cnt.hidden = n < WARN_AT;
    cnt.textContent = `${MAX_LEN - n} left`;
  };
  textarea.maxLength = MAX_LEN;
  textarea.addEventListener("input", upd);
  return h("div", { class: "field" }, textarea, cnt);
}

// ---------- sounds (synthesized, no files) ----------
let ac = null;
function audio() {
  try {
    if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === "suspended") ac.resume();
  } catch { ac = null; }
  return ac;
}
document.addEventListener("pointerdown", audio, { once: true });
function noise(a, t, dur, freq, gain) {
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = a.createBufferSource(); src.buffer = buf;
  const f = a.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = freq;
  const g = a.createGain(); g.gain.value = gain;
  src.connect(f).connect(g).connect(a.destination); src.start(t);
}
function doorOpen() {
  const a = ac; if (!a || a.state !== "running") return;
  const t = a.currentTime;
  noise(a, t, 0.05, 3000, 0.25); // latch click
  const o = a.createOscillator(); o.type = "sawtooth";
  o.frequency.setValueAtTime(130, t + 0.05); o.frequency.linearRampToValueAtTime(330, t + 0.5); o.frequency.linearRampToValueAtTime(210, t + 0.8);
  const f = a.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 950; f.Q.value = 7;
  const g = a.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16, t + 0.1); g.gain.linearRampToValueAtTime(0, t + 0.85);
  const lfo = a.createOscillator(); lfo.frequency.value = 26; const lg = a.createGain(); lg.gain.value = 0.07; lfo.connect(lg).connect(g.gain);
  o.connect(f).connect(g).connect(a.destination); o.start(t); lfo.start(t); o.stop(t + 0.9); lfo.stop(t + 0.9);
}
function doorClose() {
  const a = ac; if (!a || a.state !== "running") return;
  const t = a.currentTime;
  const o = a.createOscillator(); o.type = "sine";
  o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.25);
  const g = a.createGain(); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + 0.4);
  noise(a, t, 0.12, 900, 0.35);
}
function blip(freq, at) {
  const a = audio(); if (!a) return;
  const t = a.currentTime + at;
  const o = a.createOscillator(); o.type = "square"; o.frequency.setValueAtTime(freq, t); o.frequency.linearRampToValueAtTime(freq * 0.8, t + 0.18);
  const g = a.createGain(); g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + 0.22);
}

// ---------- data ----------
async function rpc(fn, args) {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw error;
  return data;
}
async function callFn(body) {
  const r = await fetch(FN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({ error: "The server didn't answer properly." }));
  if (!r.ok || d.error) throw new Error(d.error || "Something went wrong.");
  return d;
}

async function loadMembers() {
  const { data } = await sb.from("members").select("*").order("name");
  S.members = data || [];
  if (S.me) S.me = member(S.me.id) || S.me;
}
async function loadRoundAndGames() {
  const { data: r } = await sb.from("rounds").select("*").eq("status", "open").maybeSingle();
  S.round = r;
  const [g, v, hof] = await Promise.all([
    r ? sb.from("games").select("*").eq("round_id", r.id).order("created_at") : { data: [] },
    r ? sb.from("votes").select("*").eq("round_id", r.id) : { data: [] },
    sb.from("games").select("*").eq("status", "won").order("ended_at", { ascending: false }),
  ]);
  S.games = g.data || []; S.votes = v.data || []; S.hof = hof.data || [];
}
async function loadMessages() {
  const { data } = await sb.from("messages").select("*").order("created_at", { ascending: false }).limit(120);
  S.messages = (data || []).reverse();
}
async function loadFacts() {
  const { data } = await sb.from("facts").select("body");
  S.facts = (data || []).map((f) => f.body);
}
async function checkSession() {
  if (!S.token) return;
  try {
    const m = await rpc("me", { p_token: S.token });
    if (m) S.me = m; else { S.token = null; store.set("gc_token", null); }
  } catch { /* offline: keep token, try later */ }
}

// ---------- heat math ----------
function heat() {
  const per = new Map();
  for (const v of S.votes) per.set(v.game_id, (per.get(v.game_id) || 0) + v.points);
  const total = S.games.filter((g) => g.status === "active").reduce((a, g) => a + (per.get(g.id) || 0), 0);
  return { per, total };
}
function tierOf(n, total) {
  if (!n) return 0;
  const p = n / total;
  return p < 0.1 ? 1 : p < 0.2 ? 2 : p < 0.3 ? 3 : 4;
}
const myVotes = () => (S.me ? S.votes.filter((v) => v.member_id === S.me.id) : []);
const myUsed = () => myVotes().reduce((a, v) => a + v.points, 0);
const livePick = (memberId) => S.games.find((g) => g.member_id === memberId && (g.status === "active" || g.status === "pending"));

// ---------- render: header ----------
function renderNav() {
  const nav = $("nav");
  const items = [
    h("button", { type: "button", class: "btn blue", onclick: openLog }, lbl("scroll-vertical", "Log")),
    h("button", { type: "button", class: "btn", onclick: openHof }, lbl("trophy", "Hall of Fame")),
    h("button", { type: "button", class: "btn pink", onclick: openLoveNotes }, lbl("sparkles", "Crystal Ball of Encouragement and Love")),
    h("button", { type: "button", class: "btn", onclick: openRules }, "Rules"),
  ];
  if (S.me?.is_admin) items.push(h("button", { type: "button", class: "btn pink", onclick: openAdmin }, lbl("settings-cog", "Admin")));
  items.push(S.me
    ? h("button", { type: "button", class: "btn", onclick: signOut }, "Sign out (", S.me.name, ")")
    : h("button", { type: "button", class: "btn on", onclick: openLogin }, "Sign in"));
  nav.replaceChildren(...items);
  const max = Number(S.round?.max_hours || 8);
  $("round-badge").textContent = `Under ${max} hrs`;
}

function renderTicker() {
  const el = $("facts");
  // shuffle so every visit starts on different facts; 30 at a time keeps the loop a sane length
  const pool = S.facts.slice();
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const list = pool.length ? pool.slice(0, 30) : ["Welcome to Game Club!"];
  el.replaceChildren(...list.flatMap((f, i) => (i ? [h("em", null, icon("star")), f] : [f])));
  requestAnimationFrame(() => { el.style.animationDuration = Math.max(60, el.scrollWidth / 38) + "s"; });
  // every time the ticker finishes a pass, deal a fresh random batch
  if (!el.dataset.reshuffles) { el.dataset.reshuffles = "1"; el.addEventListener("animationiteration", renderTicker); }
}

// ---------- render: wall ----------
function renderBudget() {
  const b = $("budget");
  if (!S.me) {
    b.replaceChildren(h("span", null, "You get 3 ", ...flames(1), " to vote with once you sign in."),
      h("button", { type: "button", class: "btn", onclick: openLogin }, "Sign in"));
    return;
  }
  const used = myUsed(), left = Math.max(0, 3 - used);
  b.replaceChildren(
    h("span", null, "Your heat: ", h("span", { class: "tok" }, ...flames(left), h("s", null, ...flames(3 - left))), " ", h("b", null, `${left} left`)));
}

function coverImg(g) {
  const img = h("img", { src: g.cover_url, alt: `${g.title} box art`, loading: "lazy" });
  img.addEventListener("error", () => {
    if (g.steam_appid && img.src.includes("library_600x900")) {
      img.src = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${g.steam_appid}/header.jpg`;
    } else img.replaceWith(h("div", { class: "marker" }, g.title));
  });
  return img;
}
function caseEl(g, { sticker = true, tier = 0, mine = 0 } = {}) {
  const c = h("div", { class: "case" }, g.cover_url ? coverImg(g) : h("div", { class: "marker" }, g.title));
  if (g.status === "pending") c.append(h("span", { class: "waiting" }, "Hours check"));
  else if (sticker) c.append(h("span", { class: `sticker t${tier}`, title: TIERS[tier].k }, flip(TIERS[tier])));
  if (mine) c.append(h("span", { class: "mine" + (mine === 1 ? " one" : "") }, mine === 2 ? "your big vote ×2" : "your +1"));
  return c;
}

function renderWall() {
  renderBudget();
  const { per, total } = heat();
  const live = S.games.filter((g) => g.status === "active" || g.status === "pending");
  const mine = new Map(myVotes().map((v) => [v.game_id, v.points]));
  const cells = live.map((g, i) => {
    const m = member(g.member_id), n = per.get(g.id) || 0, ti = tierOf(n, total);
    const pct = total ? Math.round((n / total) * 100) : 0;
    return h("button", { type: "button", class: "cell", vars: { "--mc": m?.color || "#ccc" }, onclick: () => openGame(g.id), "aria-label": `${g.title}, picked by ${m?.name}` },
      caseEl(g, { tier: ti, mine: mine.get(g.id) || 0 }),
      h("div", { class: "edge" }),
      h("div", { class: "talker", vars: { "--r": TILTS[i % TILTS.length] } },
        h("div", { class: "hd" }, icon("star"), " CLUB PICK ", icon("star")),
        h("span", { class: "who" }, m?.name || "?"),
        h("span", { class: "say" }, g.title),
        h("div", { class: "bc" }, h("i"), h("span", null, g.hours ? `${g.hours} HRS` : "? HRS"), h("span", null, g.status === "pending" ? "WAITING" : [...flames(1), `${n} · ${pct}%`]))));
  });
  const open = S.members.filter((m) => !livePick(m.id));
  open.sort((a, b) => (S.me && a.id === S.me.id ? -1 : S.me && b.id === S.me.id ? 1 : 0));
  for (const m of open) {
    const isMe = S.me && m.id === S.me.id;
    cells.push(h(isMe ? "button" : "div", { type: isMe ? "button" : null, class: "cell" + (isMe ? " you" : " open-slot"), onclick: isMe ? openAdd : null },
      h("div", { class: "case blank" }, isMe ? `+ ${m.name}, throw yours up!` : `${m.name}'s spot`),
      h("div", { class: "edge" })));
  }
  $("shelf").replaceChildren(...cells);

  // return bucket: only this shelf's returns (it empties when a winner is crowned),
  // newest first, capped so it never takes over the page; the rest live in the Log
  const BUCKET_MAX = 6;
  const out = S.games.filter((g) => g.status === "withdrawn").reverse();
  const extra = out.length - BUCKET_MAX;
  $("bin").replaceChildren(h("span", { class: "lbl" }, "RETURN BUCKET"),
    ...(out.length ? out.slice(0, BUCKET_MAX).map((g, i) => h("div", { class: "scrap", vars: { "--r": i % 2 ? "4deg" : "-5deg" } }, `${member(g.member_id)?.name}: ${g.title}`))
      : [h("span", { class: "none" }, "nobody has chickened out... yet ", icon("eye"))]),
    ...(extra > 0 ? [h("button", { type: "button", class: "more", onclick: openLog }, `+${extra} more in the Log`)] : []));

  renderNowPlaying();
}

// ---------- render: the game we're playing (latest winner + where to play it) ----------
// a cinematic, glossy, extremely 2004 movie-trailer panel
const safeLink = (u) => (typeof u === "string" && /^https?:\/\/\S+$/i.test(u) ? u : null);
function renderNowPlaying() {
  const box = $("nowplay");
  const g = S.hof[0];
  if (!g) { box.hidden = true; return; }
  const m = member(g.member_id), url = safeLink(g.play_url);
  const art = () => (g.cover_url ? coverImg(g) : h("div", { class: "marker" }, g.title));
  const twinkles = [[6, 18, 0], [44, 8, 0.7], [92, 14, 1.3], [30, 86, 0.4], [78, 80, 1.9], [60, 26, 2.4], [96, 60, 1], [3, 70, 2.1]]
    .map(([x, y, d]) => h("span", { class: "tw", vars: { left: x + "%", top: y + "%", "animation-delay": d + "s" } }, icon(d > 1.5 ? "sparkle" : "sparkles")));
  const play = url
    ? h("a", { class: "np-play", href: url, target: "_blank", rel: "noopener noreferrer" }, icon("play"), h("span", null, "PLAY NOW"))
    : h("div", { class: "np-soon" }, h("span", null, "Coming soon to a computer near you..."),
      S.me?.is_admin ? h("button", { type: "button", class: "btn pink", onclick: openAdmin }, lbl("settings-cog", "Add the link")) : null);
  box.replaceChildren(h("div", { class: "np-stage" },
    g.cover_url ? h("img", { class: "np-bg", src: g.cover_url, alt: "", "aria-hidden": "true" }) : null,
    h("div", { class: "np-beams", "aria-hidden": "true" }, h("i"), h("i")),
    h("div", { class: "np-fx", "aria-hidden": "true" }),
    ...twinkles,
    h("div", { class: "np-grid" },
      h("div", { class: "np-case" }, art(), h("span", { class: "np-shine" })),
      h("div", { class: "np-info" },
        h("div", { class: "np-kicker" }, icon("star"), h("span", null, "GAME WE'RE PLAYING"), icon("star")),
        h("h2", { class: "np-title" }, g.title),
        h("div", { class: "np-who" }, "picked by ", h("b", { vars: { color: m?.color || "#fff" } }, m?.name || "?"),
          g.ended_at ? h("span", { class: "nw" }, ` · crowned ${fmtDay(g.ended_at)}`) : null),
        play)),
    h("div", { class: "np-burst", "aria-hidden": "true" }, h("span", null, "THE", h("br"), "CLUB'S", h("br"), "PICK!")),
    h("div", { class: "np-flare", "aria-hidden": "true" }),
    h("div", { class: "np-bar top", "aria-hidden": "true" }), h("div", { class: "np-bar bot", "aria-hidden": "true" })));
  box.hidden = false;
}

// ---------- render: chat ----------
function renderChatMenu() {
  const menu = $("chat-menu");
  if (!S.me) { menu.replaceChildren(h("span", null, "Just looking ", icon("eye"))); return; }
  menu.replaceChildren(
    h("span", null, "You: ", h("b", null, S.me.name)),
    h("button", { type: "button", class: "lnk", onclick: toggleChatOn, vars: { "margin-left": "auto" } }, S.chatOn ? lbl("logout", "Sign Off") : lbl("login", "Sign On")));
}
function renderHere() {
  const ids = [...S.here];
  $("here").replaceChildren(h("span", { class: "lbl" }, `here now (${ids.length}/10):`),
    ...(ids.length ? ids.map((id) => nameEl(member(id))) : [h("span", { class: "lbl" }, "nobody... ", icon("bug"))]));
}
function msgEl(m) {
  const ts = h("span", { class: "ts" }, `(${fmtTime(m.created_at)})`);
  if (m.kind !== "chat") return h("p", { class: "sys" }, ts, withIcons(m.body));
  const who = member(m.member_id);
  if (!who) { reloadMembersSoon(); return null; } // show it once we know who wrote it
  return h("p", null, ts, nameEl(who), h("span", { class: "msg" }, ": ", m.body));
}
function renderChat() {
  const log = $("chatlog");
  const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
  log.replaceChildren(...S.messages.map(msgEl).filter(Boolean));
  if (nearBottom || !log.dataset.ready) { log.scrollTop = log.scrollHeight; log.dataset.ready = "1"; }
}
function renderSend() {
  const box = $("chat-send");
  if (!S.me) {
    box.replaceChildren(h("div", { class: "chat-note" }, "Members only in here. ", h("button", { type: "button", class: "btn", onclick: openLogin }, "Sign in to chat")));
    return;
  }
  if (!S.chatOn) {
    box.replaceChildren(h("div", { class: "chat-note" }, "You're signed off. ", h("button", { type: "button", class: "btn", onclick: toggleChatOn }, lbl("login", "Sign on"))));
    return;
  }
  const ta = h("textarea", { id: "chat-input", rows: 2, placeholder: "type a message..." });
  const send = async () => {
    const body = ta.value.trim();
    if (!body) return;
    ta.disabled = true;
    try { await rpc("send_message", { p_token: S.token, p_body: body }); ta.value = ""; ta.dispatchEvent(new Event("input")); }
    catch (e) { toast(errMsg(e), true); }
    ta.disabled = false; ta.focus();
  };
  ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });
  box.replaceChildren(h("div", { class: "send" }, withCounter(ta), h("button", { type: "button", class: "go", onclick: send }, "Send")));
}

function renderAll() {
  renderNav(); renderWall(); renderChatMenu(); renderHere(); renderChat(); renderSend();
  if (S.openGameId) refreshGameDialog();
}

// ---------- dialogs ----------
function dialog(title, { wide = false } = {}) {
  closeDialog();
  const body = h("div", { class: "body" });
  const win = h("div", { class: "win dlg" + (wide ? " wide" : ""), role: "dialog", "aria-modal": "true", "aria-label": title },
    h("div", { class: "tbar" }, h("span", { class: "ico" }, icon("sparkle")), h("span", { class: "t" }, title),
      h("button", { type: "button", class: "wb x", "aria-label": "Close", onclick: closeDialog }, "x")),
    body);
  const ov = h("div", { class: "overlay", onclick: (e) => { if (e.target === ov) closeDialog(); } }, win);
  $("layer").replaceChildren(ov);
  return body;
}
function closeDialog() {
  $("layer").replaceChildren();
  S.openGameId = null; S.logOpen = false;
}
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && $("layer").firstChild) closeDialog(); });

// sign in: pick name -> "tell me something only I would know" -> code
function openLogin() {
  const body = dialog("Sign in to Game Club");
  body.append(h("h3", null, "Who are you?"),
    h("div", { class: "who-grid" }, S.members.slice().sort((a, b) => a.name.localeCompare(b.name)).map((m) =>
      h("button", { type: "button", class: "pick", onclick: () => askSecret(m) }, nameEl(m)))));
}
function askSecret(m) {
  const body = dialog(`Prove it, ${m.name}`);
  const inp = h("input", { type: "text", id: "secret", autocomplete: "off", autocapitalize: "off", spellcheck: false, placeholder: "type it here...", maxLength: 60 });
  const err = h("div", { class: "err", role: "alert" });
  const go = async () => {
    err.textContent = "";
    try {
      const r = await rpc("login", { p_name: m.name, p_code: inp.value });
      if (!r.ok) { err.textContent = r.error; inp.select(); return; }
      S.token = r.token; store.set("gc_token", r.token); S.me = r.member;
      await loadMembers();
      closeDialog(); audio();
      if (!S.me.setup_done) openSetup(); else toast(`Welcome back, ${S.me.name}!`);
      afterAuthChange();
    } catch (e) { err.textContent = errMsg(e); }
  };
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
  body.append(
    h("p", { class: "q" }, "If you're really ", nameEl(m), ", tell me something only I would know..."),
    inp, err,
    h("div", { class: "row" }, h("button", { type: "button", class: "btn big", onclick: go }, "It's really me"),
      h("button", { type: "button", class: "btn", onclick: openLogin }, "That's not me")),
    h("small", null, "(Hint: it's your two secret words.)"));
  setTimeout(() => inp.focus(), 30);
}

// first sign-in: color + font
function openSetup() {
  const body = dialog("Make it yours", { wide: true });
  let color = S.me.color, font = S.me.font || "Creepster";
  const preview = h("div", { class: "preview" });
  const err = h("div", { class: "err", role: "alert" });
  const sw = h("div", { class: "sw" }), fonts = h("div", { class: "fonts" });
  const draw = () => {
    const taken = new Map(S.members.filter((m) => m.color && m.id !== S.me.id).map((m) => [m.color, m.name]));
    sw.replaceChildren(...PALETTE.map(([n, c]) => h("button", {
      type: "button", class: c === color ? "sel" : "", disabled: taken.has(c), vars: { "--c": c },
      onclick: () => { color = c; draw(); }, title: taken.has(c) ? `${taken.get(c)}'s color` : n,
    }, h("i"), taken.has(c) ? `${taken.get(c)}'s` : n)));
    fonts.replaceChildren(...Object.keys(FONTS).map((f) => h("button", { type: "button", class: f === font ? "sel" : "", onclick: () => { font = f; draw(); } },
      nameEl({ name: S.me.name, color: color || "#ff3fa4", font: f }), h("small", null, f))));
    preview.replaceChildren(nameEl({ name: S.me.name, color: color || "#fff", font }), h("span", null, "has signed on. ", icon("login")));
  };
  draw();
  const save = async () => {
    err.textContent = "";
    if (!color) { err.textContent = "Pick a color first."; return; }
    try {
      S.me = await rpc("setup_profile", { p_token: S.token, p_color: color, p_font: font });
      await loadMembers(); closeDialog(); renderAll(); toast(["Lookin' good! ", icon("sunglasses")]);
    } catch (e) { err.textContent = errMsg(e); await loadMembers(); draw(); }
  };
  body.append(h("h3", null, "Pick your color (first come, first served)"), sw,
    h("h3", null, "Pick your font"), fonts,
    h("h3", null, "Lookin' good?"), preview, err,
    h("div", { class: "row" }, h("button", { type: "button", class: "btn big", onclick: save }, "Enter Game Club")));
}

// add a game: search Steam -> check hours -> put it on the shelf
function openAdd() {
  if (!S.me) return openLogin();
  if (livePick(S.me.id)) return toast("You already have a game on the shelf. Back out of it first (shame!).", true);
  const body = dialog("Throw a game on the shelf", { wide: true });
  const q = h("input", { type: "search", placeholder: "search Steam... (e.g. A Short Hike)", autocomplete: "off", maxLength: 80 });
  const results = h("div", { class: "results" });
  const detail = h("div");
  let timer = null, picked = null, seq = 0;
  const search = async () => {
    const term = q.value.trim(), my = ++seq;
    if (term.length < 2) { results.replaceChildren(); return; }
    results.replaceChildren(h("span", null, "searching..."));
    try {
      const d = await callFn({ action: "search", q: term });
      if (my !== seq) return;
      results.replaceChildren(...(d.results.length ? d.results.map((r) => h("button", { type: "button", onclick: (e) => choose(r, e.currentTarget) },
        h("img", { src: r.thumb, alt: "" }), h("span", null, r.name))) : [h("span", null, "Nothing on Steam by that name. Try the not-on-Steam option below.")]));
    } catch (e) { results.replaceChildren(h("span", { class: "err" }, errMsg(e))); }
  };
  const choose = async (r, btn) => {
    picked = r;
    results.querySelectorAll("button").forEach((b) => b.classList.toggle("sel", b === btn));
    detail.replaceChildren(h("span", null, "Checking how long it is..."));
    try {
      const d = await callFn({ action: "info", appid: r.appid });
      if (picked !== r) return;
      const v = d.verdict;
      const add = h("button", { type: "button", class: "btn big", disabled: !v.ok }, v.kind === "nodata" ? "Send it for an hours check" : "Put it on the shelf!");
      add.addEventListener("click", async () => {
        add.disabled = true;
        try {
          const res = await callFn({ action: "add", token: S.token, appid: r.appid });
          closeDialog(); await refreshGames();
          if (res.game?.status === "active") celebrate(); else toast("Sent! It goes on the shelf once the hours get checked.");
        } catch (e) { toast(errMsg(e), true); add.disabled = false; }
      });
      detail.replaceChildren(h("div", { class: "game-top" },
        h("div", { class: "case" }, h("img", { src: r.cover, alt: `${r.name} box art`, onerror: (e) => { e.target.src = r.thumb; } })),
        h("div", { class: "facts" }, h("h3", null, r.name), h("div", { class: "verdict " + v.kind }, v.msg), add)));
    } catch (e) { detail.replaceChildren(h("span", { class: "err" }, errMsg(e))); }
  };
  q.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(search, 350); });

  const manual = h("input", { type: "text", placeholder: "game name", maxLength: 200 });
  const manualBtn = h("button", { type: "button", class: "btn" }, "Send it for a check");
  manualBtn.addEventListener("click", async () => {
    if (!manual.value.trim()) return toast("Type the game's name first.", true);
    manualBtn.disabled = true;
    try { await callFn({ action: "add_manual", token: S.token, title: manual.value }); closeDialog(); await refreshGames(); toast("Sent! It goes on the shelf once the hours get checked."); }
    catch (e) { toast(errMsg(e), true); manualBtn.disabled = false; }
  });
  body.append(h("h3", null, `Rule: under ${Number(S.round?.max_hours || 8)} hours`), q, results, detail,
    h("details", null, h("summary", null, "Not on Steam? (Switch, PlayStation, etc.)"),
      h("div", { class: "row", vars: { "margin-top": "8px" } }, manual, manualBtn),
      h("small", null, "The hours get checked by hand before it goes on the shelf.")));
  setTimeout(() => q.focus(), 30);
}

// one game: details, voting, notes, back out, admin tools
function openGame(id) {
  dialog("Game", { wide: true });
  S.openGameId = id; // set after dialog(), which clears it
  refreshGameDialog();
}
async function refreshGameDialog() {
  const g = S.games.find((x) => x.id === S.openGameId) || S.hof.find((x) => x.id === S.openGameId);
  const win = $("layer").querySelector(".dlg");
  if (!g || !win) return;
  const id = g.id;
  win.querySelector(".tbar .t").textContent = g.title;
  const body = win.querySelector(".body");
  const draftEl = body.querySelector("#note-input");
  const draft = draftEl ? draftEl.value : "";
  const { per, total } = heat();
  const n = per.get(g.id) || 0, ti = tierOf(n, total), pct = total ? Math.round((n / total) * 100) : 0;
  const picker = member(g.member_id);
  const mineNow = myVotes().find((v) => v.game_id === g.id)?.points || 0;
  const usedElsewhere = myUsed() - mineNow;

  const top = h("div", { class: "game-top" }, caseEl(g, { sticker: g.status === "active", tier: ti }),
    h("div", { class: "facts" },
      h("div", null, "Picked by ", nameEl(picker)),
      h("div", null, h("b", null, "Length: "), g.hours ? `about ${g.hours} hrs${g.hours_source === "matt" ? " (checked by hand)" : ""}` : "unknown (needs an hours check)"),
      g.status === "active" ? h("div", null, h("b", null, "Heat: "), `${n} `, ...flames(1), ` · ${pct}% of all the heat · `, h("span", { class: `t${ti}` }, flip(TIERS[ti])), " ", TIERS[ti].k) : null,
      g.status === "won" ? h("div", { class: "ok" }, icon("trophy"), " WINNER") : null,
      g.steam_appid ? h("a", { href: `https://store.steampowered.com/app/${g.steam_appid}/`, target: "_blank", rel: "noopener" }, "See it on Steam ", icon("external-link")) : null));

  const parts = [top];
  const voters = S.votes.filter((v) => v.game_id === g.id);
  if (voters.length) parts.push(h("div", { class: "voters" }, h("b", null, "Who's hot for it:"), voters.map((v) => h("span", null, nameEl(member(v.member_id)), " ", ...flames(v.points)))));

  if (S.me && g.status === "active") {
    // tap to put heat on, tap the lit one again to take it back off
    const opts = [[1, flames(1)], [2, [...flames(2), " big vote"]]];
    parts.push(h("div", null, h("h3", null, `Your vote (${3 - myUsed()} `, ...flames(1), " left)"),
      h("div", { class: "votebar" }, opts.map(([p, label]) => h("button", {
        type: "button", class: "btn" + (mineNow === p ? " on" : ""), "aria-pressed": String(mineNow === p),
        disabled: mineNow !== p && usedElsewhere + p > 3,
        onclick: async () => {
          try { await rpc("set_vote", { p_token: S.token, p_game_id: id, p_points: mineNow === p ? 0 : p }); await refreshGames(); }
          catch (e) { toast(errMsg(e), true); }
        },
      }, label)))));
  } else if (!S.me && g.status === "active") {
    parts.push(h("button", { type: "button", class: "btn", onclick: openLogin }, "Sign in to vote"));
  }

  if (S.me && g.member_id === S.me.id && (g.status === "active" || g.status === "pending")) {
    const box = h("div");
    const ask = () => box.replaceChildren(h("div", { class: "confirm" }, h("b", null, "Back out? You'll get +1 shame and everyone will know. ", icon("angry")),
      h("div", { class: "row" }, h("button", { type: "button", class: "btn red", onclick: async () => {
        try { await rpc("withdraw_game", { p_token: S.token }); closeDialog(); await Promise.all([refreshGames(), loadMembers()]); renderAll(); sass(); }
        catch (e) { toast(errMsg(e), true); }
      } }, "Yes, back out"), h("button", { type: "button", class: "btn", onclick: () => box.replaceChildren(btn) }, "Never mind"))));
    const btn = h("button", { type: "button", class: "btn red", onclick: ask }, "Back out of my pick");
    box.append(btn); parts.push(box);
  }

  if (S.me?.is_admin && (g.status === "pending" || g.status === "active")) {
    const hrs = h("input", { type: "number", min: "0.5", step: "0.5", placeholder: "hrs", vars: { width: "90px" } });
    const adminRow = h("div", { class: "row" });
    if (g.status === "pending") adminRow.append(h("span", null, "Hours:"), hrs, h("button", { type: "button", class: "btn", onclick: async () => {
      try { await rpc("approve_game", { p_token: S.token, p_game_id: id, p_hours: Number(hrs.value) }); await refreshGames(); toast("Done."); }
      catch (e) { toast(errMsg(e), true); }
    } }, "Approve"));
    adminRow.append(h("button", { type: "button", class: "btn red", onclick: async () => {
      try { await rpc("pull_game", { p_token: S.token, p_game_id: id }); closeDialog(); await refreshGames(); toast("Pulled off the shelf."); }
      catch (e) { toast(errMsg(e), true); }
    } }, "Pull it off the shelf"));
    parts.push(h("div", { class: "confirm" }, h("b", null, "Admin"), adminRow));
  }

  const notesBox = h("div", { class: "notes glit" }, h("span", { class: "none" }, "loading notes..."));
  parts.push(h("h3", null, "Notes"), notesBox);
  if (S.me) {
    const ta = h("textarea", { id: "note-input", rows: 2, placeholder: "what do you think about this one?" });
    ta.value = draft;
    const post = h("button", { type: "button", class: "btn", onclick: async () => {
      if (!ta.value.trim()) return;
      post.disabled = true;
      try { await rpc("add_note", { p_token: S.token, p_game_id: id, p_body: ta.value }); ta.value = ""; ta.dispatchEvent(new Event("input")); await loadNotes(id, notesBox); }
      catch (e) { toast(errMsg(e), true); }
      post.disabled = false;
    } }, "Post note");
    parts.push(h("div", { class: "row" }, withCounter(ta), post));
    setTimeout(() => ta.dispatchEvent(new Event("input")));
  }
  body.replaceChildren(...parts);
  loadNotes(id, notesBox);
}
async function loadNotes(gameId, box) {
  const { data } = await sb.from("notes").select("*").eq("game_id", gameId).order("created_at");
  if (S.openGameId !== gameId) return;
  box.replaceChildren(...(data?.length ? data.map((n) => h("p", null, h("span", { class: "ts" }, `${fmtDay(n.created_at)} ${fmtTime(n.created_at)} `), nameEl(member(n.member_id)), ": ", n.body))
    : [h("span", { class: "none" }, "no notes yet. say something!")]));
  box.scrollTop = box.scrollHeight;
}

async function openLog() {
  const body = dialog("The Log", { wide: true });
  S.logOpen = true;
  const list = h("div", { class: "loglist glit" }, "loading...");
  body.append(h("small", null, "Everything that happened, newest first. Colors = who did it."), list);
  const { data } = await sb.from("log").select("*").order("created_at", { ascending: false }).limit(300);
  const kindIcon = { join: "hand", suggest: "gamepad", vote: "fire", withdraw: "angry", pull: "cancel", approve: "check", round: "trophy", link: "joystick" };
  list.replaceChildren(...(data?.length ? data.map((l) => h("p", { vars: { "--mc": member(l.member_id)?.color || "#ddd" } },
    h("span", { class: "ts" }, `${fmtDay(l.created_at)} ${fmtTime(l.created_at)}`), icon(kindIcon[l.kind] || "star", "lg"), " ", withIcons(l.text))) : [h("p", null, "Nothing yet. Go pick a game!")]));
}
function openHof() {
  const body = dialog("Hall of Fame", { wide: true });
  body.append(S.hof.length ? h("div", { class: "hof" }, S.hof.map((g) => h("div", null,
    g.cover_url ? coverImg(g) : h("div", { class: "marker" }, g.title), h("b", null, g.title), h("span", null, "picked by ", member(g.member_id)?.name || "?"))))
    : h("p", null, "No winners yet. Go put some games on the shelf!"));
}
// Crystal Ball of Encouragement and Love: every finished day's saying and how many likes it got (saved at midnight Pacific)
async function openLoveNotes() {
  const body = dialog("Crystal Ball of Encouragement and Love", { wide: true });
  const list = h("div", { class: "lnotes" }, "loading...");
  body.append(list);
  try { await rpc("archive_love_notes", {}); } catch { /* still show what's saved */ }
  const { data } = await sb.from("love_notes").select("day,body,likes").order("day", { ascending: false });
  const notes = data || [];
  if (!notes.length) { list.replaceChildren(h("p", null, "Nothing saved yet. Today's saying gets saved at midnight, so go give the crystal ball some love!")); return; }
  const best = Math.max(...notes.map((n) => n.likes));
  const pretty = (d) => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  list.replaceChildren(...notes.map((n) => h("div", { class: "lnote" + (best > 0 && n.likes === best ? " top" : "") },
    best > 0 && n.likes === best ? h("span", { class: "crown" }, icon("crown"), " MOST LOVED") : null,
    h("q", null, n.body),
    h("div", { class: "meta" }, h("span", null, h("b", null, n.likes.toLocaleString()), n.likes === 1 ? " like" : " likes"), h("span", null, pretty(n.day))))));
}
function openRules() {
  const body = dialog("The Rules");
  const max = Number(S.round?.max_hours || 8);
  body.append(h("ol", { class: "rules" },
    h("li", null, `One game each, under ${max} hours.`),
    h("li", null, "You get 3 ", ...flames(1), " to vote with. Put 2 on one game for a big vote."),
    h("li", null, "Backing out of your pick = +1 shame. Forever."),
    h("li", null, "Hottest game wins. Then we all play it.")));
}
function openAdmin() {
  const body = dialog("Admin");
  const box = h("div");
  const pending = S.games.filter((g) => g.status === "pending");
  const { per } = heat();
  const leader = S.games.filter((g) => g.status === "active").sort((a, b) => (per.get(b.id) || 0) - (per.get(a.id) || 0) || a.created_at.localeCompare(b.created_at))[0];
  const ask = () => box.replaceChildren(h("div", { class: "confirm" },
    h("b", null, leader ? [`${leader.title} wins with ${per.get(leader.id) || 0} `, ...flames(1), ", and the shelf gets cleared. Do it?"] : "No games on the shelf yet."),
    h("div", { class: "row" }, h("button", { type: "button", class: "btn red", disabled: !leader, onclick: async () => {
      try { await rpc("close_round", { p_token: S.token, p_next_name: "" }); closeDialog(); await refreshGames(); celebrate("WINNER!"); }
      catch (e) { toast(errMsg(e), true); }
    } }, "Yes, close it"), h("button", { type: "button", class: "btn", onclick: () => box.replaceChildren(closeBtn) }, "Not yet"))));
  const closeBtn = h("button", { type: "button", class: "btn big", onclick: ask }, "Crown the winner + clear the shelf");
  box.append(closeBtn);
  // where everyone can get the current winner (shows in the Now Playing spot)
  const won = S.hof[0];
  let linkBox = null;
  if (won) {
    const input = h("input", { type: "url", class: "linkin", placeholder: "https://... where to buy, download or play it", value: won.play_url || "", maxlength: 500, "aria-label": `Link for ${won.title}` });
    const save = async (url) => {
      try { await rpc("set_play_link", { p_token: S.token, p_game_id: won.id, p_url: url }); await refreshGames(); toast(url ? "Link posted!" : "Link taken down."); closeDialog(); }
      catch (e) { toast(errMsg(e), true); }
    };
    linkBox = h("div", { class: "linkbox" },
      h("h3", null, `Where to get ${won.title}`),
      input,
      h("div", { class: "row" },
        h("button", { type: "button", class: "btn big", onclick: () => save(input.value.trim()) }, won.play_url ? "Update the link" : "Post the link"),
        won.play_url ? h("button", { type: "button", class: "btn red", onclick: () => save("") }, "Take it down") : null));
  }
  body.append(
    h("h3", null, "Waiting for your OK"),
    pending.length ? h("div", null, pending.map((g) => h("div", { class: "row" }, h("span", null, `${g.title} (${member(g.member_id)?.name})`),
      h("button", { type: "button", class: "btn", onclick: () => openGame(g.id) }, "Check it")))) : h("span", null, "Nothing waiting."),
    linkBox,
    h("h3", null, "Pick the winner"), box,
    h("small", null, "Need a new code for a member? Ask Claude to run scripts/set_codes.py with their name."));
}

// ---------- fun stuff ----------
function celebrate(word = "NEW ARRIVAL!") {
  const colors = ["#ff1f8e", "#39ff14", "#ffe53f", "#3fe0ff", "#ff8a1c", "#a77bff"];
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduce) for (let i = 0; i < 90; i++) {
    const c = h("div", { class: "confetti", vars: {
      left: Math.random() * 100 + "vw", background: colors[i % colors.length], "--dx": (Math.random() * 200 - 100) + "px",
      "--rot": (Math.random() * 1080 - 540) + "deg", "--d": (2 + Math.random() * 1.6) + "s", "animation-delay": Math.random() * 0.4 + "s",
    } });
    document.body.append(c); setTimeout(() => c.remove(), 4400);
  }
  const f = h("div", { class: "flourish" }, h("div", null, word));
  document.body.append(f); setTimeout(() => f.remove(), 1900);
  [523, 659, 784, 1047].forEach((fr, i) => blip(fr, i * 0.09));
}
function sass() {
  const dude = h("div", { class: "dude f1" }, h("div", { class: "head" }), h("div", { class: "mouth" }), h("div", { class: "body" }), h("div", { class: "arm2" }), h("div", { class: "arm" }), h("div", { class: "legs" }));
  const bubble = h("div", { class: "bubble" }, "ah");
  const ov = h("div", { class: "sass", onclick: () => ov.remove() }, h("div", { class: "stage" }, bubble, dude, h("small", null, "(tap to close)")));
  document.body.append(ov);
  const frames = [["f1", "ah"], ["f2", "ah ah"], ["f3", "ah ah ah!"], ["f1", "ah ah ah!"], ["f2", "ah ah ah!"], ["f3", "ah ah ah!"]];
  frames.forEach(([cls, txt], i) => setTimeout(() => { dude.className = "dude " + cls; bubble.textContent = txt; if (i < 3) blip(880 - i * 90, 0); }, i * 380));
  setTimeout(() => ov.remove(), 3600);
}

// ---------- sign in/out + presence ----------
let room = null;
function setupPresence() {
  room = sb.channel("room", { config: { presence: { key: "tab-" + Math.random().toString(36).slice(2) } } });
  room.on("presence", { event: "sync" }, () => {
    // only real members count; visitors never track, and anything else is ignored
    const now = new Set();
    for (const metas of Object.values(room.presenceState())) for (const m of metas) if (member(m.member_id)) now.add(m.member_id);
    if (S.hereReady) {
      for (const id of now) if (!S.here.has(id)) { addLocalLine(`🚪 ${member(id).name} has entered the room.`); doorOpen(); }
      for (const id of S.here) if (!now.has(id) && member(id)) { addLocalLine(`🚪 ${member(id).name} has left the room.`); doorClose(); }
    }
    S.here = now; S.hereReady = true; renderHere();
  });
  room.subscribe((status) => { if (status === "SUBSCRIBED") trackPresence(); });
}
async function trackPresence() {
  if (!room) return;
  if (S.me && S.chatOn) await room.track({ member_id: S.me.id });
  else await room.untrack();
}
function addLocalLine(text) {
  S.messages.push({ kind: "local", body: text, created_at: new Date().toISOString() });
  renderChat();
}
function toggleChatOn() {
  audio();
  S.chatOn = !S.chatOn; store.set("gc_chat_on", S.chatOn ? "1" : "0");
  trackPresence(); renderChatMenu(); renderSend();
}
async function signOut() {
  try { await rpc("logout", { p_token: S.token }); } catch { /* already gone */ }
  S.token = null; S.me = null; store.set("gc_token", null);
  afterAuthChange(); toast(["Signed out. Bye! ", icon("hand")]);
}
let pep = null;
function afterAuthChange() { trackPresence(); renderAll(); pep?.authChanged(); }

// ---------- live updates ----------
let gamesTimer = null;
async function refreshGames() { await loadRoundAndGames(); renderNav(); renderWall(); if (S.openGameId) refreshGameDialog(); }
const refreshGamesSoon = () => { clearTimeout(gamesTimer); gamesTimer = setTimeout(refreshGames, 250); };
function setupRealtime() {
  sb.channel("db")
    .on("postgres_changes", { event: "*", schema: "public", table: "games" }, refreshGamesSoon)
    .on("postgres_changes", { event: "*", schema: "public", table: "votes" }, refreshGamesSoon)
    .on("postgres_changes", { event: "*", schema: "public", table: "rounds" }, refreshGamesSoon)
    .on("postgres_changes", { event: "*", schema: "public", table: "members" }, async () => { await loadMembers(); renderAll(); })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (p) => {
      S.messages.push(p.new); if (S.messages.length > 200) S.messages.shift();
      renderChat();
      if (S.tab !== "chat" && matchMedia("(max-width: 820px)").matches) { S.unread++; $("unread").hidden = false; $("unread").textContent = S.unread; }
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "notes" }, (p) => {
      if (S.openGameId === p.new.game_id) { const box = $("layer").querySelector(".notes"); if (box) loadNotes(p.new.game_id, box); }
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "log" }, () => { if (S.logOpen) openLog(); })
    .subscribe();
}

// ---------- mobile tabs ----------
$("mtabs").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-tab]"); if (!b) return;
  S.tab = b.dataset.tab;
  document.body.className = "tab-" + S.tab;
  $("mtabs").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
  if (S.tab === "chat") { S.unread = 0; $("unread").hidden = true; const log = $("chatlog"); log.scrollTop = log.scrollHeight; }
  window.scrollTo({ top: 0 });
});

// ---------- go ----------
// pixel icons written into the page shell as <i data-ico="name">
document.querySelectorAll("[data-ico]").forEach((el) => el.replaceWith(icon(el.dataset.ico, el.className)));

(async function start() {
  try {
    await Promise.all([loadMembers(), loadRoundAndGames(), loadMessages(), loadFacts(), checkSession()]);
  } catch (e) { toast("Couldn't reach Game Club's database. Try refreshing.", true); }
  if (S.me) S.me = member(S.me.id) || S.me;
  renderTicker(); renderAll();
  pep = initPep({ sb, rpc, h, toast, audio, getToken: () => S.token });
  setupRealtime(); setupPresence();
  if (S.me && !S.me.setup_done) openSetup();
})();
