// Daily pep talk + SMASH THE LIKE BUTTON.
//
// How smashing works: every hit adds 1 "heat". While you keep hitting, heat only bleeds
// off slowly (1 per second); stop for half a second and it drains fast. So normal
// clicking never hurts the button, but a real smashing spree does:
//   heat 20 / 30 / 40 -> it cracks, more each time (cracks fade if you calm down)
//   heat 50           -> it breaks, gets boxed up, stamped DAMAGED, shipped off and replaced
// In practice: ~22 nonstop hits to crack it, ~55-75 nonstop hits to break it (fewer if fast).
//
// Likes: only signed-in members add to the pool. Hits are batched and sent every ~half
// second (the server takes at most 40 per call and 5000 per member per day).
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const TZ = "America/Los_Angeles";
const CRACK_AT = [20, 30, 40], BREAK_AT = 50;
const SLOW_DECAY = 1, FAST_DECAY = 10, IDLE_MS = 450;
const TAU = Math.PI * 2;
// canvas geometry, must match .smash-fx / .sb-wrap / .crate in the CSS
const W = 480, CX = 240, CY = 240, DOME_Y = CY - 6, DOME_R = 49, GROUND = 346;

const rnd = (a, b) => a + Math.random() * (b - a);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const vib = (p) => { try { if (navigator.userActivation?.hasBeenActive !== false) navigator.vibrate?.(p); } catch { /* no haptics */ } };
const play = (el, kf, o) => el.animate(kf, { fill: "forwards", ...o });

function todayStr() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date()).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
const dayNum = (d) => { const [y, m, dd] = d.split("-").map(Number); return Math.round(Date.UTC(y, m - 1, dd) / 864e5); };
const prettyDay = () => new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" }).format(new Date());

const NS = "http://www.w3.org/2000/svg";
const sv = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };

// dome press states (also the resting look in the CSS)
const UP = "0 9px 0 #5a0011, 0 11px 12px rgba(0,0,0,.6), inset 0 -10px 18px rgba(60,0,10,.55), inset 0 3px 5px rgba(255,255,255,.35)";
const DOWN = "0 2px 0 #5a0011, 0 3px 4px rgba(0,0,0,.6), inset 0 -6px 14px rgba(60,0,10,.6), inset 0 3px 5px rgba(255,255,255,.22)";

export function initPep({ sb, rpc, h, toast, audio, getToken, getMe }) {
  const root = document.getElementById("pep");
  if (!root) return { authChanged() {} };

  // ---------- DOM ----------
  const dateEl = h("small", null, prettyDay());
  const quote = h("p", { class: "pep-quote" }, "Loading today's pep talk...");
  const crackSvg = sv("svg", { viewBox: "0 0 100 100", "aria-hidden": "true" });
  const flash = h("span", { class: "flash" });
  const dome = h("span", { class: "dome" }, h("span", { class: "hot" }), h("span", { class: "lbl" }, h("i", null, "👍"), "LIKE"), crackSvg, flash);
  const btn = h("button", { type: "button", class: "sb", "aria-label": "Smash the like button" }, h("span", { class: "bezel" }), dome);
  const wrap = h("div", { class: "sb-wrap" }, btn);
  const canvas = h("canvas", { class: "smash-fx", "aria-hidden": "true" });
  const stageEl = h("div", { class: "smash-stage" }, h("div", { class: "smash-plate" }, h("span", { class: "warn" }, "WARRANTY VOID IF SMASHED")), wrap, canvas);
  const title = h("div", { class: "smash-title" }, "SMASH THE LIKE BUTTON");
  const comboN = h("b"), comboMsg = h("span");
  const combo = h("div", { class: "combo", "aria-hidden": "true" }, comboN, comboMsg);
  const ghost = h("span", { class: "ghost", "aria-hidden": "true" }, "88888");
  const num = h("span", { class: "num" }, "-----");
  const mineEl = h("small", { class: "mylikes" });
  const smash = h("div", { class: "smash" },
    h("div", { class: "smash-head" }, title, combo), stageEl,
    h("div", { class: "likes" }, h("small", { class: "cap" }, "LIKES TODAY"), h("div", { class: "led", role: "status", "aria-label": "Likes today" }, ghost, num), mineEl));
  root.replaceChildren(
    h("div", { class: "pep-say" }, h("div", { class: "pep-tag" }, "DAILY PEP TALK", dateEl), quote, h("div", { class: "pep-sig" }, "love, Game Club ♥")),
    smash);

  const ctx = canvas.getContext("2d");
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = W * dpr; canvas.height = W * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // ---------- sounds (synthesized) ----------
  let master = null, nbuf = null;
  function A() {
    const a = audio(); if (!a || a.state !== "running") return null;
    if (!master || master.context !== a) { master = a.createGain(); master.gain.value = 0.5; master.connect(a.destination); }
    if (!nbuf || nbuf.sampleRate !== a.sampleRate) {
      nbuf = a.createBuffer(1, a.sampleRate * 2, a.sampleRate);
      const d = nbuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return a;
  }
  function nz(a, t, dur, { type = "lowpass", f = 1000, f2 = 0, q = 0.7, g = 0.3, atk = 0.003 } = {}) {
    const s = a.createBufferSource(); s.buffer = nbuf;
    const fl = a.createBiquadFilter(); fl.type = type; fl.Q.value = q; fl.frequency.setValueAtTime(f, t);
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const gn = a.createGain(); gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(g, t + atk); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl).connect(gn).connect(master); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.02);
  }
  function tone(a, t, dur, { type = "sine", f = 440, f2 = 0, g = 0.2, atk = 0.003 } = {}) {
    const o = a.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const gn = a.createGain(); gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(g, t + atk); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(gn).connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  const sound = (fn) => (...args) => { try { const a = A(); if (a) fn(a, a.currentTime, ...args); } catch { /* audio is a bonus */ } };
  const snd = {
    thump: sound((a, t, k = 0) => { tone(a, t, 0.12, { f: 170 + k * 110, f2: 55, g: 0.5 }); nz(a, t, 0.03, { type: "highpass", f: 2600, g: 0.14 }); }),
    crack: sound((a, t, i = 0) => {
      nz(a, t, 0.09, { type: "bandpass", f: 2000, q: 1.4, g: 0.6 });
      for (let j = 0; j < 4 + i * 3; j++) nz(a, t + j * 0.013 + Math.random() * 0.01, 0.02, { type: "highpass", f: 3000 + Math.random() * 3000, g: 0.12 + Math.random() * 0.2 });
    }),
    shatter: sound((a, t) => {
      nz(a, t, 0.8, { f: 8000, f2: 500, g: 0.75, atk: 0.002 }); tone(a, t, 0.4, { f: 130, f2: 38, g: 0.7 });
      for (let j = 0; j < 12; j++) tone(a, t + 0.12 + Math.random() * 0.75, 0.07, { f: 2400 + Math.random() * 3200, g: 0.04 + Math.random() * 0.05 });
    }),
    zap: sound((a, t) => { tone(a, t, 0.07, { type: "square", f: 1600 + Math.random() * 1200, f2: 280, g: 0.06 }); nz(a, t, 0.05, { type: "highpass", f: 4000, g: 0.15 }); }),
    whoosh: sound((a, t, dur = 0.45, g = 0.35) => {
      const s = a.createBufferSource(); s.buffer = nbuf;
      const fl = a.createBiquadFilter(); fl.type = "bandpass"; fl.Q.value = 1.1;
      fl.frequency.setValueAtTime(300, t); fl.frequency.exponentialRampToValueAtTime(1900, t + dur * 0.6); fl.frequency.exponentialRampToValueAtTime(500, t + dur);
      const gn = a.createGain(); gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(g, t + dur * 0.6); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(fl).connect(gn).connect(master); s.start(t, Math.random()); s.stop(t + dur + 0.02);
    }),
    thud: sound((a, t, v = 1) => { tone(a, t, 0.34, { f: 120, f2: 36, g: 0.85 * v }); nz(a, t, 0.22, { f: 600, g: 0.6 * v }); }),
    slap: sound((a, t) => { nz(a, t, 0.1, { f: 3200, f2: 700, g: 0.85, atk: 0.001 }); tone(a, t, 0.08, { type: "triangle", f: 280, f2: 110, g: 0.3 }); }),
    skid: sound((a, t, delay = 0) => { nz(a, t + delay, 0.5, { type: "bandpass", f: 1000, f2: 260, q: 2.2, g: 0.3, atk: 0.05 }); }),
    rattle: sound((a, t) => { for (const d of [0, 0.09, 0.17]) { tone(a, t + d, 0.06, { f: 95, f2: 60, g: 0.35 }); nz(a, t + d, 0.05, { f: 1100, g: 0.25 }); } }),
    flaps: sound((a, t) => { nz(a, t, 0.07, { f: 1500, g: 0.55 }); nz(a, t + 0.06, 0.07, { f: 1300, g: 0.5 }); nz(a, t, 0.14, { type: "highpass", f: 2500, f2: 6000, g: 0.18 }); }),
    chime: sound((a, t) => { [784, 988, 1175, 1568].forEach((f, i) => { tone(a, t + i * 0.075, 0.5, { type: "triangle", f, g: 0.13 }); tone(a, t + i * 0.075, 0.3, { f: f * 2, g: 0.04 }); }); }),
  };

  // ---------- particles (canvas around the button) ----------
  const parts = [];
  const add = (p) => { if (parts.length < 420) { p.max = p.life; parts.push(p); } };
  const RED = ["#e2002d", "#ff3a5c", "#a30021", "#ff8fa3", "#c4001f"];
  function sparks(x, y, n, speed = 360) {
    for (let i = 0; i < n; i++) {
      const a = rnd(0, TAU), v = rnd(0.35, 1) * speed;
      add({ t: "spark", x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.3, life: rnd(0.22, 0.6), w: rnd(1.1, 2.4) });
    }
  }
  function domeSparks(n, speed) {
    for (let i = 0; i < n; i++) {
      const a = rnd(0, TAU), v = rnd(0.4, 1) * speed;
      add({ t: "spark", x: CX + Math.cos(a) * DOME_R, y: DOME_Y + Math.sin(a) * DOME_R, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.35, life: rnd(0.25, 0.7), w: rnd(1.2, 2.6) });
    }
  }
  function shards(x, y, n, speed, colors = RED, size = 1) {
    for (let i = 0; i < n; i++) {
      const a = rnd(0, TAU), v = rnd(0.3, 1) * speed, m = Math.random() < 0.5 ? 3 : 4, pts = [];
      for (let j = 0; j < m; j++) { const b = (j * TAU) / m + rnd(-0.4, 0.4), r = rnd(2, 7) * size; pts.push([Math.cos(b) * r, Math.sin(b) * r]); }
      add({ t: "shard", x: x + rnd(-6, 6), y: y + rnd(-6, 6), vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.55, rot: rnd(0, TAU), vr: rnd(-14, 14), pts, c: colors[i % colors.length], life: rnd(0.9, 1.6) });
    }
  }
  function smoke(x, y, n, { c = "48,46,56", a = 0.38, r = 8, gr = 34, vy = -55, spread = 20 } = {}) {
    for (let i = 0; i < n; i++) add({ t: "puff", x: x + rnd(-spread, spread), y: y + rnd(-6, 6), vx: rnd(-18, 18), vy: vy * rnd(0.6, 1.2), r: r * rnd(0.7, 1.3), gr: gr * rnd(0.7, 1.3), drag: 0.5, c, a, life: rnd(0.8, 1.4) });
  }
  function dust(x, y, n, dir) {
    for (let i = 0; i < n; i++) add({ t: "puff", x: x + rnd(-8, 8), y: y - rnd(0, 6), vx: dir * rnd(60, 190), vy: -rnd(8, 40), r: rnd(5, 10), gr: rnd(26, 48), drag: 0.05, c: "196,160,112", a: 0.5, life: rnd(0.5, 0.9) });
  }
  function ring(x, y, r0, r1, a, c, w, life = 0.35) { add({ t: "ring", x, y, r0, r1, a, c, w, life }); }
  function glints(x, y, n, spread) {
    for (let i = 0; i < n; i++) add({ t: "glint", x: x + rnd(-spread, spread), y: y + rnd(-spread * 0.6, spread * 0.3), vy: -rnd(10, 50), s: rnd(4, 9), c: Math.random() < 0.5 ? "#fff6c8" : "#ffd84a", life: rnd(0.35, 0.8) });
  }
  function step(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      if (p.t === "spark") { p.vy += 900 * dt; p.vx *= 1 - 1.5 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
      else if (p.t === "shard") {
        p.vy += 1300 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
        if (p.y > GROUND && p.vy > 0) { p.y = GROUND; p.vy *= -0.32; p.vx *= 0.55; p.vr *= 0.5; }
      } else if (p.t === "puff") { const k = Math.pow(p.drag, dt); p.vx *= k; p.vy *= k; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.gr * dt; }
      else if (p.t === "glint") p.y += p.vy * dt;
    }
  }
  function star(x, y, s) {
    ctx.beginPath(); ctx.moveTo(x, y - s);
    ctx.quadraticCurveTo(x, y, x + s, y); ctx.quadraticCurveTo(x, y, x, y + s);
    ctx.quadraticCurveTo(x, y, x - s, y); ctx.quadraticCurveTo(x, y, x, y - s); ctx.fill();
  }
  function draw() {
    ctx.clearRect(0, 0, W, W);
    for (const p of parts) if (p.t === "puff") {
      const a = p.a * Math.min(1, (p.life / p.max) * 1.4) * Math.min(1, (p.max - p.life) / 0.08);
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      g.addColorStop(0, `rgba(${p.c},${a.toFixed(3)})`); g.addColorStop(1, `rgba(${p.c},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
    }
    for (const p of parts) if (p.t === "shard") {
      ctx.save(); ctx.globalAlpha = Math.min(1, p.life / 0.3); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.c; ctx.beginPath(); p.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(255,225,230,.55)"; ctx.lineWidth = 0.8; ctx.stroke(); ctx.restore();
    }
    ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round";
    for (const p of parts) {
      const k = p.life / p.max;
      if (p.t === "spark") {
        ctx.globalAlpha = Math.min(1, k * 1.6); ctx.strokeStyle = k > 0.6 ? "#fff3c4" : k > 0.3 ? "#ffb432" : "#ff5a14"; ctx.lineWidth = p.w;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.028, p.y - p.vy * 0.028); ctx.stroke();
      } else if (p.t === "ring") {
        const e = 1 - k, r = p.r0 + (p.r1 - p.r0) * (1 - Math.pow(1 - e, 3));
        ctx.globalAlpha = p.a * k; ctx.strokeStyle = `rgb(${p.c})`; ctx.lineWidth = Math.max(0.5, p.w * k);
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.stroke();
      } else if (p.t === "glint") { ctx.globalAlpha = 1; ctx.fillStyle = p.c; star(p.x, p.y, p.s * Math.sin(Math.PI * (1 - k))); }
    }
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
  }

  // ---------- cracks (random every new button) ----------
  let groups = [], impact = [50, 50];
  function buildCracks() {
    crackSvg.replaceChildren();
    const ix = 50 + rnd(-9, 9), iy = 47 + rnd(-9, 9);
    impact = [ix, iy];
    groups = [0, 1, 2].map(() => { const g = sv("g", { class: "ck" }); crackSvg.append(g); return g; });
    const line = (g, pts) => {
      const d = "M" + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L");
      let len = 1; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      for (const cls of ["lt", "dk"]) {
        const p = sv("path", { d, class: cls });
        p.style.strokeDasharray = Math.ceil(len); p.style.strokeDashoffset = Math.ceil(len); p.dataset.len = Math.ceil(len);
        g.append(p);
      }
    };
    const ray = (x, y, a, len, segs) => {
      const pts = [[x, y]];
      for (let i = 0; i < segs; i++) { a += rnd(-0.45, 0.45); const st = (len / segs) * rnd(0.7, 1.3); x += Math.cos(a) * st; y += Math.sin(a) * st; pts.push([x, y]); }
      return pts;
    };
    const base = rnd(0, TAU), main = [];
    groups[0].append(sv("circle", { cx: ix.toFixed(1), cy: iy.toFixed(1), r: "2.6", class: "dent" }));
    for (let i = 0; i < 3; i++) { const pts = ray(ix, iy, base + (i * TAU) / 3 + rnd(-0.3, 0.3), rnd(24, 34), 4); main.push(pts); line(groups[0], pts); }
    for (let i = 0; i < 3; i++) line(groups[1], ray(ix, iy, base + TAU / 6 + (i * TAU) / 3 + rnd(-0.3, 0.3), rnd(32, 44), 5));
    for (const pts of main) {
      const [x, y] = pts[2], a = Math.atan2(y - iy, x - ix);
      line(groups[1], ray(x, y, a + (Math.random() < 0.5 ? -1 : 1) * rnd(0.6, 1.1), rnd(10, 18), 3));
    }
    for (let i = 0; i < 5; i++) line(groups[2], ray(ix, iy, rnd(0, TAU), rnd(44, 60), 6));
    for (const r of [8, 15]) { // spiderweb rings around the impact
      const pts = [], a0 = rnd(0, TAU);
      for (let k = 0; k <= 10; k++) { const a = a0 + (k * TAU) / 10; pts.push([ix + Math.cos(a) * r * rnd(0.85, 1.15), iy + Math.sin(a) * r * rnd(0.85, 1.15)]); }
      for (let k = 0; k < 10; k += 2) if (Math.random() < 0.8) line(groups[2], pts.slice(k, k + 3));
    }
  }
  function revealCrack(i) {
    const g = groups[i]; if (!g) return;
    g.style.transition = "none"; g.style.opacity = "1";
    for (const p of g.querySelectorAll("path")) {
      p.getAnimations().forEach((a) => a.cancel());
      play(p, [{ strokeDashoffset: p.dataset.len }, { strokeDashoffset: 0 }], { duration: 130 + i * 40, easing: "cubic-bezier(.2,.8,.3,1)" });
    }
  }
  function hideCrack(i) { const g = groups[i]; if (g) { g.style.transition = ""; g.style.opacity = "0"; } }

  // ---------- likes ----------
  let day = todayStr(), sayings = [];
  let serverTotal = 0, myServer = 0, pending = 0, inflight = 0, shown = -1, flushT = 0, warned = false, nudged = false;
  function showSaying() {
    quote.textContent = sayings.length ? sayings[dayNum(day) % sayings.length].body : "I will always believe in you.";
    dateEl.textContent = prettyDay();
  }
  function setShown(n) {
    if (n <= shown) return;
    shown = n;
    const s = String(n);
    num.textContent = s; ghost.textContent = "8".repeat(Math.max(5, s.length));
  }
  function bumpLed() {
    if (!reduced()) num.animate([{ transform: "scale(1.3)", filter: "brightness(1.9)" }, { transform: "scale(1)", filter: "brightness(1)" }], { duration: 170, easing: "cubic-bezier(.2,.8,.3,1)" });
  }
  function renderMine() { mineEl.textContent = getToken() ? `you: ${myServer + pending + inflight}` : "sign in so your smashes count"; }
  async function loadSayings() {
    const { data } = await sb.from("sayings").select("id,body").order("id");
    sayings = data || []; showSaying();
  }
  async function loadTotal() {
    const d = day;
    const { data, error } = await sb.from("saying_likes").select("member_id,n").eq("day", d);
    if (error || d !== day) return;
    serverTotal = (data || []).reduce((a, r) => a + r.n, 0);
    const me = getMe();
    if (me && !inflight) myServer = (data || []).find((r) => r.member_id === me.id)?.n || 0;
    setShown(serverTotal + pending);
    renderMine();
  }
  function countLike() {
    if (!getToken()) {
      if (!nudged) { nudged = true; toast("Sign in so your smashes count! (Smashing is free though.)"); }
      return false;
    }
    pending++;
    setShown(serverTotal + pending + inflight); bumpLed(); renderMine();
    if (!flushT) flushT = setTimeout(flush, 450);
    return true;
  }
  async function flush() {
    flushT = 0;
    if (inflight || !pending) return;
    const tok = getToken(); if (!tok) { pending = 0; renderMine(); return; }
    const n = Math.min(pending, 40);
    pending -= n; inflight = n;
    try {
      const total = await rpc("smash_like", { p_token: tok, p_count: n });
      serverTotal = Math.max(serverTotal, Number(total) || 0); myServer += n;
    } catch (e) {
      if (!warned) { warned = true; toast((e && e.message) || "Your likes didn't go through.", true); }
    }
    inflight = 0;
    setShown(serverTotal + pending); renderMine();
    if (pending && !flushT) flushT = setTimeout(flush, 300);
  }
  // don't lose a last burst when someone closes the tab mid-smash
  document.addEventListener("visibilitychange", () => {
    const tok = getToken();
    if (document.visibilityState !== "hidden" || !pending || !tok) return;
    const n = Math.min(pending, 40); pending -= n;
    fetch(`${SUPABASE_URL}/rest/v1/rpc/smash_like`, {
      method: "POST", keepalive: true,
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ p_token: tok, p_count: n }),
    }).catch(() => {});
  });

  // ---------- the smash ----------
  let heat = 0, streak = 0, lastHit = 0, cracked = 0, busy = false, raf = 0, lastT = 0, smokeT = 0, jolt = 0, lastMsg = "";
  let pressA = null;

  function press(k) {
    pressA?.cancel();
    pressA = dome.animate([
      { transform: "translateY(-6px) scale(1)", boxShadow: UP },
      { transform: `translateY(1px) scale(${(0.97 - k * 0.02).toFixed(3)},${(0.95 - k * 0.03).toFixed(3)})`, boxShadow: DOWN, offset: 0.28 },
      { transform: "translateY(-8px) scale(1.01)", boxShadow: UP, offset: 0.7 },
      { transform: "translateY(-6px) scale(1)", boxShadow: UP },
    ], { duration: 170, easing: "cubic-bezier(.25,.7,.35,1)" });
  }
  function floater(txt) {
    if (reduced()) return;
    const sr = smash.getBoundingClientRect(), br = btn.getBoundingClientRect();
    const f = h("span", { class: "plus" }, txt);
    f.style.left = `${br.left - sr.left + br.width / 2}px`; f.style.top = `${br.top - sr.top + br.height * 0.3}px`;
    smash.append(f);
    const dx = rnd(30, 95) * (Math.random() < 0.8 ? 1 : -1), dy = -rnd(50, 105), rot = rnd(-25, 25);
    const big = 1 + Math.min(1, heat / BREAK_AT) * 0.8;
    const a = f.animate([
      { transform: "translate(-50%,-50%) scale(.4)", opacity: 0 },
      { transform: `translate(calc(-50% + ${dx * 0.35}px), calc(-50% + ${dy * 0.5}px)) scale(${big}) rotate(${rot * 0.5}deg)`, opacity: 1, offset: 0.25 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${big * 0.8}) rotate(${rot}deg)`, opacity: 0 },
    ], { duration: 650, easing: "cubic-bezier(.2,.7,.4,1)" });
    a.onfinish = () => f.remove();
    const all = smash.querySelectorAll(".plus"); if (all.length > 24) all[0].remove();
  }
  function comboMessage() {
    return heat < 12 ? "SMASH!" : heat < 20 ? "HARDER!!" : heat < 30 ? "IT'S CRACKING 😬" : heat < 40 ? "IT CAN'T TAKE MUCH MORE" : "OH NO OH NO OH NO";
  }
  function updateCombo(pop) {
    const on = streak >= 4 && !busy;
    smash.classList.toggle("combo-on", on);
    if (!on) return;
    combo.style.setProperty("--k", Math.min(1, heat / BREAK_AT).toFixed(2));
    comboN.textContent = `${streak} HITS`;
    const m = comboMessage(); if (m !== lastMsg) { lastMsg = m; comboMsg.textContent = m; }
    if (pop && !reduced()) comboN.animate([{ transform: "scale(1.35) rotate(-4deg)" }, { transform: "scale(1) rotate(0)" }], { duration: 140, easing: "cubic-bezier(.2,.9,.3,1.4)" });
  }
  function crackFx(i) {
    snd.crack(i); vib(20 + i * 12);
    const x = CX + ((impact[0] - 50) * DOME_R) / 50, y = DOME_Y + ((impact[1] - 50) * DOME_R) / 50;
    flash.animate([{ opacity: 0.55 }, { opacity: 0 }], { duration: 220, easing: "ease-out" });
    jolt = 1;
    if (!reduced()) { shards(x, y, 5 + i * 4, 260 + i * 60); sparks(x, y, 8 + i * 6, 380); ring(x, y, 4, 60, 0.8, "255,240,220", 3); }
  }
  function hit() {
    if (busy) return;
    audio();
    heat += 1; streak += 1; lastHit = performance.now();
    const k = Math.min(1, heat / BREAK_AT);
    press(k); snd.thump(k); vib(heat > 30 ? 12 : 6);
    floater(countLike() ? "+1" : "♥");
    if (!reduced()) {
      ring(CX, DOME_Y, DOME_R + 2, DOME_R + 26 + k * 30, 0.25 + k * 0.4, k > 0.5 ? "255,170,80" : "255,120,140", 3 + k * 3, 0.3);
      if (heat > 12) domeSparks(Math.min(7, Math.floor((heat - 12) / 5) + 1), 300 + k * 200);
    }
    updateCombo(true);
    for (let i = 0; i < 3; i++) if (heat >= CRACK_AT[i] && cracked <= i) { cracked = i + 1; revealCrack(i); crackFx(i); }
    if (heat >= BREAK_AT) { breakIt(); return; }
    kick();
  }
  function kick() { if (!raf) { lastT = performance.now(); raf = requestAnimationFrame(loop); } }
  function loop(t) {
    const dt = Math.min(0.05, Math.max(0, (t - lastT) / 1000)); lastT = t;
    if (!busy) {
      const idle = performance.now() - lastHit > IDLE_MS;
      heat = Math.max(0, heat - (idle ? FAST_DECAY : SLOW_DECAY) * dt);
      if (streak && idle && heat < 2) { streak = 0; updateCombo(false); }
      else if (streak) updateCombo(false);
      while (cracked > 0 && heat < CRACK_AT[cracked - 1] - 6) {
        cracked--; hideCrack(cracked);
        if (cracked === 0) setTimeout(() => { if (!cracked && !busy) buildCracks(); }, 1000);
      }
      const k = Math.min(1, heat / BREAK_AT);
      wrap.style.setProperty("--heat", k.toFixed(3));
      jolt = Math.max(0, jolt - dt * 7);
      const amp = reduced() ? 0 : Math.max(0, heat - 6) * 0.15 + jolt * 6;
      if (amp > 0.01) {
        const s = t / 1000;
        const x = amp * (Math.sin(s * 47 + 1.3) * 0.6 + Math.sin(s * 83) * 0.4);
        const y = amp * 0.7 * (Math.sin(s * 59 + 0.7) * 0.6 + Math.sin(s * 97 + 2) * 0.4);
        wrap.style.transform = `translate(${x.toFixed(2)}px,${y.toFixed(2)}px) rotate(${(amp * 0.35 * Math.sin(s * 61 + 0.4)).toFixed(2)}deg)`;
      } else wrap.style.transform = "";
      if (heat >= 30 && !reduced()) {
        smokeT -= dt;
        if (smokeT <= 0) { smokeT = 0.15 - (heat - 30) * 0.004; smoke(CX + rnd(-28, 28), DOME_Y - 24, 1, { a: 0.3, r: 7, gr: 26 }); }
      }
    }
    step(dt); draw();
    if (heat > 0 || parts.length || busy) raf = requestAnimationFrame(loop);
    else { raf = 0; wrap.style.transform = ""; wrap.style.setProperty("--heat", "0"); ctx.clearRect(0, 0, W, W); }
  }
  function quake(px, ms) {
    if (reduced()) return;
    const kf = [];
    for (let i = 0; i <= 7; i++) { const d = 1 - i / 7; kf.push({ transform: i === 7 ? "none" : `translate(${(rnd(-1, 1) * px * d).toFixed(1)}px,${(rnd(-1, 1) * px * d).toFixed(1)}px)` }); }
    root.animate(kf, { duration: ms });
  }

  // ---------- break -> box it -> ship it -> new one ----------
  function crate(kind) {
    const prints = h("div", { class: "prints" },
      h("span", { class: "p1" }, "GAME CLUB"), h("span", { class: "p2" }, "PARTS DEPT."),
      h("span", { class: "up" }, h("b", null, "↑↑"), "THIS SIDE UP"),
      kind === "fresh" ? h("span", { class: "p3" }, "HANDLE WITH LOVE ♥") : null,
      h("span", { class: "frag" }, "FRAGILE"),
      h("span", { class: "lab" }, h("i"), "1× LIKE BUTTON"));
    return h("div", { class: `crate ${kind}`, "aria-hidden": "true" },
      kind === "fresh" ? h("div", { class: "rays" }) : null,
      h("div", { class: "cs" }),
      kind === "fresh"
        ? [h("div", { class: "fl l" }, h("i", { class: "tp2" })), h("div", { class: "fl r" }, h("i", { class: "tp2" }))]
        : [h("div", { class: "ct" }, h("i", { class: "tp2" })), h("div", { class: "lip l" }), h("div", { class: "lip r" })],
      h("div", { class: "cf" }, prints, kind === "fresh" ? h("i", { class: "tp" }) : null));
  }
  function readyAgain() {
    buildCracks(); cracked = 0; heat = 0; streak = 0; jolt = 0;
    dome.classList.remove("dead");
    busy = false; smash.classList.remove("busy"); btn.removeAttribute("aria-disabled");
    title.textContent = "GOOD AS NEW ✨";
    setTimeout(() => { title.textContent = "SMASH THE LIKE BUTTON"; }, 1600);
    kick();
  }
  async function breakIt() {
    busy = true; smash.classList.add("busy"); smash.classList.remove("combo-on"); btn.setAttribute("aria-disabled", "true");
    for (let i = 0; i < 3; i++) if (cracked <= i) revealCrack(i);
    cracked = 3;
    if (reduced()) {
      snd.shatter(); dome.classList.add("dead");
      const st = h("div", { class: "dmg still" }, h("b", null, "DAMAGED"), h("small", null, "PLEASE STOP SMASHING"));
      stageEl.append(st);
      await wait(1600); st.remove(); readyAgain(); return;
    }
    // 1) hit-stop: a frozen, white-hot beat before it goes
    wrap.style.transform = "scale(1.08)"; wrap.style.setProperty("--heat", "1");
    flash.animate([{ opacity: 0.9 }, { opacity: 0.9 }], { duration: 90 });
    snd.crack(2); vib([40, 30, 90]);
    await wait(90);
    // 2) it blows
    snd.shatter();
    flash.animate([{ opacity: 0.95 }, { opacity: 0 }], { duration: 320, easing: "ease-out" });
    dome.classList.add("dead"); wrap.style.setProperty("--heat", "0");
    shards(CX, DOME_Y, 34, 520); shards(CX, DOME_Y, 8, 380, ["#2a2d38", "#6c7284", "#16171d"], 1.2);
    domeSparks(40, 520);
    ring(CX, DOME_Y, 30, 150, 0.9, "255,230,200", 6, 0.45); ring(CX, DOME_Y, 20, 110, 0.6, "255,150,60", 3, 0.6);
    smoke(CX, DOME_Y - 10, 10, { a: 0.45, r: 10, gr: 40, spread: 30 });
    quake(10, 420);
    wrap.style.transform = "";
    play(wrap, [{ transform: "scale(1.08)" }, { transform: "translate(3px,7px) rotate(8deg) scale(.96)" }], { duration: 300, easing: "cubic-bezier(.2,.9,.3,1.3)" });
    kick();
    // 3) sputtering, short-circuiting
    for (let i = 0; i < 4; i++) {
      await wait(rnd(110, 190));
      snd.zap();
      const a = rnd(0, TAU);
      sparks(CX + Math.cos(a) * DOME_R * 0.8, DOME_Y + Math.sin(a) * DOME_R * 0.8, 7, 300);
      dome.animate([{ filter: "grayscale(.2) brightness(1.4)" }, { filter: "grayscale(.55) brightness(.42) contrast(1.25)" }], { duration: 130 });
    }
    smoke(CX, DOME_Y - 20, 5, { a: 0.35, r: 9, gr: 30, spread: 24 });
    await wait(220);
    // 4) a box flips over it and slams down
    const c1 = crate("cover"); stageEl.append(c1);
    snd.whoosh(0.45, 0.25);
    await play(c1, [
      { transform: "translate(-40px,-340px) rotate(-200deg) scale(.9)", easing: "cubic-bezier(.5,0,.85,.4)" },
      { transform: "translate(0,0) rotate(0deg) scale(1)" },
    ], { duration: 520 }).finished;
    snd.thud(); vib(45); quake(7, 320);
    wrap.style.visibility = "hidden"; wrap.getAnimations().forEach((a) => a.cancel());
    dust(CX - 98, GROUND, 9, -1); dust(CX + 98, GROUND, 9, 1);
    c1.getAnimations().forEach((a) => a.cancel());
    await play(c1, [{ transform: "scale(1.09,.84)" }, { transform: "scale(.96,1.05)", offset: 0.45 }, { transform: "scale(1.01,.99)", offset: 0.75 }, { transform: "none" }], { duration: 300, easing: "ease-out" }).finished;
    // 5) DAMAGED sticker slaps on
    await wait(120);
    const st = h("div", { class: "dmg" }, h("b", null, "DAMAGED"), h("small", null, "PLEASE STOP SMASHING"));
    c1.append(st);
    await play(st, [
      { transform: "translate(-50%,-50%) translate(60px,-120px) rotate(-40deg) scale(2.6)", opacity: 0 },
      { opacity: 1, offset: 0.35 },
      { transform: "translate(-50%,-50%) rotate(-11deg) scale(1)", opacity: 1 },
    ], { duration: 200, easing: "cubic-bezier(.65,0,.9,.35)" }).finished;
    snd.slap(); vib(30);
    play(st, [
      { transform: "translate(-50%,-50%) rotate(-11deg) scale(1.14,.84)", opacity: 1 },
      { transform: "translate(-50%,-50%) rotate(-11deg) scale(.97,1.03)", opacity: 1, offset: 0.5 },
      { transform: "translate(-50%,-50%) rotate(-11deg) scale(1)", opacity: 1 },
    ], { duration: 240, easing: "ease-out" });
    play(c1, [{ transform: "scale(.96,1.03) rotate(-1deg)" }, { transform: "none" }], { duration: 220, easing: "cubic-bezier(.3,1.6,.5,1)" });
    ring(CX - 10, CY + 30, 16, 80, 0.55, "255,255,255", 3, 0.3);
    await wait(560);
    // 6) yeet it off the screen
    const r = stageEl.getBoundingClientRect(), z = r.width / 200 || 1;
    snd.whoosh(0.55, 0.5);
    c1.getAnimations().forEach((a) => a.cancel());
    dust(CX + 40, GROUND, 6, 1);
    const shadow = "drop-shadow(0 10px 8px rgba(0,0,0,.55))";
    await play(c1, [
      { transform: "none", filter: `${shadow} blur(0px)`, easing: "cubic-bezier(.3,0,.3,1)" },
      { transform: "translate(-18px,2px) rotate(-6deg)", filter: `${shadow} blur(0px)`, offset: 0.22, easing: "cubic-bezier(.55,0,.95,.45)" },
      { transform: `translate(${(innerWidth - r.left + 80) / z}px,-70px) rotate(32deg)`, filter: `${shadow} blur(3px)` },
    ], { duration: 640 }).finished;
    c1.remove();
    // 7) a fresh box slides in from the left
    await wait(260);
    const c2 = crate("fresh"); stageEl.append(c2);
    snd.skid(0.2);
    await play(c2, [
      { transform: `translate(${-(r.right + 80) / z}px,0) rotate(-6deg)`, easing: "cubic-bezier(.12,.75,.3,1)" },
      { transform: "translate(12px,0) rotate(2.5deg)", offset: 0.8, easing: "cubic-bezier(.4,0,.4,1)" },
      { transform: "none" },
    ], { duration: 760 }).finished;
    snd.thud(0.45); dust(CX - 92, GROUND, 7, -1); quake(3, 200);
    await wait(260);
    // 8) something's rattling in there...
    snd.rattle();
    c2.getAnimations().forEach((a) => a.cancel());
    await c2.animate([
      { transform: "none" }, { transform: "translate(-2px,0) rotate(-1.5deg)" }, { transform: "translate(2px,-3px) rotate(1.5deg)" },
      { transform: "translate(-1px,0) rotate(-1deg)" }, { transform: "translate(1px,-2px) rotate(1deg)" }, { transform: "none" },
    ], { duration: 360 }).finished;
    await wait(120);
    // 9) flaps burst open and a brand new button jumps out
    buildCracks(); dome.classList.remove("dead");
    const [fl, fr] = c2.querySelectorAll(".fl"), tape = c2.querySelector(".tp"), rays = c2.querySelector(".rays");
    snd.flaps(); vib(20);
    c2.animate([{ transform: "scale(1.05,.92)" }, { transform: "scale(.98,1.03)", offset: 0.5 }, { transform: "none" }], { duration: 260, easing: "ease-out" });
    play(fl, [{ transform: "rotate(0)" }, { transform: "rotate(-168deg)", offset: 0.7 }, { transform: "rotate(-150deg)" }], { duration: 420, easing: "cubic-bezier(.2,.9,.3,1)" });
    play(fr, [{ transform: "rotate(0)" }, { transform: "rotate(168deg)", offset: 0.7 }, { transform: "rotate(150deg)" }], { duration: 420, easing: "cubic-bezier(.2,.9,.3,1)" });
    play(tape, [{ transform: "scaleY(1)", opacity: 1 }, { transform: "scaleY(0)", opacity: 0 }], { duration: 140 });
    play(rays, [{ opacity: 0, transform: "translate(-50%,-100%) scaleY(.2)" }, { opacity: 1, transform: "translate(-50%,-100%) scaleY(1)" }], { duration: 320, easing: "ease-out" });
    glints(CX - 2, 186, 14, 60);
    await wait(140);
    wrap.style.visibility = "visible"; wrap.style.zIndex = "6";
    snd.chime();
    const jump = wrap.animate([
      { transform: "translateY(-30px) scale(.3)", opacity: 0, easing: "cubic-bezier(.15,.8,.35,1)" },
      { transform: "translateY(-125px) scale(.95) rotate(-10deg)", opacity: 1, offset: 0.45, easing: "cubic-bezier(.55,0,.9,.5)" },
      { transform: "translateY(5px) scale(1.06,.92)", opacity: 1, offset: 0.8, easing: "cubic-bezier(.2,.7,.3,1)" },
      { transform: "none", opacity: 1 },
    ], { duration: 860 });
    await wait(330);
    play(rays, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 });
    play(c2, [{ transform: "none", opacity: 1 }, { transform: "translateY(18px) scale(1.04,.2)", opacity: 0 }], { duration: 300, easing: "cubic-bezier(.5,0,.9,.5)" });
    await jump.finished;
    wrap.style.zIndex = "";
    snd.thump(0); vib(15);
    dust(CX - 50, 312, 4, -1); dust(CX + 50, 312, 4, 1); glints(CX, DOME_Y, 10, 55);
    c2.remove();
    readyAgain();
  }

  // ---------- input ----------
  btn.addEventListener("pointerdown", (e) => { if (e.button !== 0) return; e.preventDefault(); hit(); });
  btn.addEventListener("keydown", (e) => { if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); hit(); } });
  btn.addEventListener("click", (e) => e.preventDefault());
  btn.addEventListener("contextmenu", (e) => e.preventDefault());

  // ---------- go ----------
  buildCracks(); renderMine();
  loadSayings().catch(() => showSaying());
  loadTotal().catch(() => {});
  let rtT = 0;
  sb.channel("pep").on("postgres_changes", { event: "*", schema: "public", table: "saying_likes" }, (p) => {
    if (p.new && p.new.day === day) { clearTimeout(rtT); rtT = setTimeout(loadTotal, 400); }
  }).subscribe();
  setInterval(() => { // new saying at midnight Pacific
    const d = todayStr();
    if (d !== day) { day = d; shown = -1; serverTotal = 0; myServer = 0; showSaying(); setShown(0); loadTotal(); }
  }, 60000);

  return { authChanged() { warned = false; nudged = false; renderMine(); loadTotal().catch(() => {}); } };
}
