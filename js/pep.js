// Daily saying + the crystal ball like button.
//
// The ball: a tiny WebGL shader draws swirling iridescent fog, glitter riding the swirl,
// energy filaments, glass shine, and two "visions" that take turns: a heart and LIKE 👍.
// Visions dissolve into the fog (it eats them from the edges, which glow as they go) and
// form back out of it while the fog parts around them.
//
// Tapping charges the ball with magic: it brightens and swirls faster, filaments flare,
// strands of energy spiral outward, orbit rings of light appear if you keep going, and a
// spark flies to the counter for every like. Charge fades gently when you stop.
//
// Likes: one shared pool per day. Only signed-in members add to it. Taps are batched and sent
// every ~half second (the server takes at most 40 per call and 5000 per member per day).
// Finished days are saved as Love Notes (see archive_love_notes in the database).
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const TZ = "America/Los_Angeles";
const TAU = Math.PI * 2;
// geometry, must match .smash-stage / .sb-wrap / .smash-fx in the CSS:
// stage 110x104, ball 86px centred at (55,52), effect canvases 400x400 centred on the ball
const W = 400, CX = 200, CY = 200, RB = 43, BALL = 86;
const SWIRL = -1; // energy spins the same way as the fog

const rnd = (a, b) => a + Math.random() * (b - a);
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const vib = (p) => { try { if (navigator.userActivation?.hasBeenActive !== false) navigator.vibrate?.(p); } catch { /* no haptics */ } };
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function todayStr() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date()).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
const dayNum = (d) => { const [y, m, dd] = d.split("-").map(Number); return Math.round(Date.UTC(y, m - 1, dd) / 864e5); };

// ---------- the crystal ball shader ----------
// uFlow: accumulated swirl. uCharge: 0..1 magic from tapping. uPulse: seconds since the last tap.
// uHeart / uLike: how much of each vision is showing (0..1). uTex: LIKE 👍 (R sharp, G glow, B detail).
const ORB_VERT = "attribute vec2 p;varying vec2 vUv;void main(){vUv=p*0.5+0.5;gl_Position=vec4(p,0.0,1.0);}";
const ORB_FRAG = `precision highp float;
varying vec2 vUv;
uniform vec2 uRes;
uniform float uTime, uFlow, uCharge, uPulse, uHover, uHeart, uLike;
uniform sampler2D uTex;
float h31(vec3 p){ p = fract(p*0.3183099 + 0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vnoise(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x), mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x), f.y),
             mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x), mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x), f.y), f.z);
}
float fbm(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a*vnoise(p); p = p*2.02 + vec3(1.7,9.2,3.1); a *= 0.5; } return s; }
float fbm3(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { s += a*vnoise(p); p = p*2.03 + vec3(4.1,2.7,8.3); a *= 0.5; } return s/0.875; }
float dot2(vec2 v){ return dot(v,v); }
float sdHeart(vec2 p){ p.x = abs(p.x); if (p.y+p.x > 1.0) return sqrt(dot2(p-vec2(0.25,0.75))) - 0.35355;
  return sqrt(min(dot2(p-vec2(0.0,1.0)), dot2(p-0.5*max(p.x+p.y,0.0)))) * sign(p.x-p.y); }
vec3 pal(float t){ return 0.55 + 0.45*cos(6.28318*(t + vec3(0.0,0.18,0.42))); }
float glitter(vec2 g, float t, float dens){
  vec2 id = floor(g), f = fract(g) - 0.5;
  float r = h21(id);
  vec2 o = (vec2(h21(id+3.1), h21(id+7.7)) - 0.5)*0.7;
  vec2 d = abs(f - o);
  float tw = pow(max(0.0, sin(t*(1.5+r*4.0) + r*60.0)), 6.0);
  float core = smoothstep(0.10, 0.0, length(f-o));
  float rays = smoothstep(0.025,0.0,d.x)*smoothstep(0.28,0.0,d.y) + smoothstep(0.025,0.0,d.y)*smoothstep(0.28,0.0,d.x);
  return step(1.0-dens, r) * tw * (core + rays*0.55);
}
void main(){
  vec2 uv = vUv*2.0 - 1.0;
  float r = length(uv);
  float px = 2.0/uRes.x;
  float mask = 1.0 - smoothstep(1.0 - 2.0*px, 1.0, r);
  if (mask <= 0.0) { gl_FragColor = vec4(0.0); return; }
  float z = sqrt(max(0.0, 1.0 - r*r));
  vec3 n = vec3(uv, z);
  float T = uFlow;
  float kick = exp(-uPulse*5.0);                                   // fresh-tap flash
  vec2 p = uv*(0.72 + 0.28*z);                                      // glass lens
  p += (uv/(r+0.001)) * sin(r*16.0 - uPulse*18.0) * exp(-uPulse*3.5) * 0.06 * (1.0-r);  // tap ripple
  float ang = T*0.8 + (1.0-r)*(2.4 + uCharge*2.5);                  // vortex: the middle spins faster
  float c = cos(ang), s = sin(ang);
  vec2 q = mat2(c,-s,s,c)*p;
  vec3 P = vec3(q*1.7, T*0.3);
  vec2 w = vec2(fbm(P), fbm(P + vec3(5.2,1.3,2.8)));
  float d = fbm(P + vec3(w*1.9, T*0.15));

  // visions sit inside the fog and drift with it
  vec2 sp = p + (w - 0.5)*0.05;
  float bob = 0.03*sin(uTime*1.4);
  vec2 hp = vec2(sp.x, sp.y + bob)*1.75 + vec2(0.0,0.55);
  float hd = sdHeart(hp);
  float heartShape = smoothstep(0.04,-0.04,hd), heartGlow = exp(-max(hd,0.0)*6.0);
  vec4 tx = texture2D(uTex, vec2(sp.x, sp.y + bob)*0.5 + 0.5);
  float likeShape = tx.r, likeGlow = tx.g, likeDetail = tx.b;
  // dissolve: a slow noise that rides the fog decides which bits are eaten first
  float dn = fbm3(vec3(sp*3.0 + w*0.9, uTime*0.18 + 11.0));
  float hv = mix(-0.05, 1.05, uHeart), lv = mix(-0.05, 1.05, uLike);
  float hRev = 1.0 - smoothstep(hv - 0.07, hv + 0.07, dn);
  float lRev = 1.0 - smoothstep(lv - 0.07, lv + 0.07, dn);
  float hEdge = smoothstep(0.09, 0.0, abs(dn - hv)) * sin(3.14159*uHeart);
  float lEdge = smoothstep(0.09, 0.0, abs(dn - lv)) * sin(3.14159*uLike);
  float part = max(heartGlow*hRev, likeGlow*lRev);                 // the fog parts around a vision

  float fog = smoothstep(0.22, 0.72, d) * (1.0 - 0.6*part);
  vec3 iri = pal(d*1.6 + w.x*0.9 + r*0.4 + T*0.05);
  vec3 deep = mix(vec3(0.10,0.03,0.24), vec3(0.03,0.08,0.26), uv.y*0.5+0.5);
  vec3 col = mix(deep, iri*1.1, 0.18 + fog*0.8);
  col += vec3(1.0,0.95,1.0)*pow(fog,2.5)*0.35;                      // milky wisps
  col += vec3(0.9,0.6,1.0)*exp(-r*r*4.0)*(0.2 + uCharge*0.35);      // inner glow
  float rf = 1.0 - abs(2.0*fbm3(vec3(q*2.4 + w*1.3, T*0.45 + 3.0)) - 1.0);
  col += pal(d*2.0 + uTime*0.1 + 0.3) * pow(rf, 9.0) * (0.22 + uCharge*1.0 + kick*0.5);  // energy filaments

  float wisp = smoothstep(0.6, 0.95, d)*0.35;                       // dense wisps drift in front
  vec3 heartCol = vec3(1.0,0.28,0.66)*(0.95 + 0.2*sin(uTime*3.0));
  col *= 1.0 - 0.25*heartGlow*hRev*(1.0 - heartShape);              // a little shadow so it reads
  col = mix(col, heartCol, heartShape*hRev*(0.8 - wisp));
  col += heartCol*heartGlow*hRev*0.42;
  col *= 1.0 - 0.55*clamp(likeGlow*1.7, 0.0, 1.0)*lRev*(1.0 - likeShape);   // dark backdrop behind the word
  vec3 likeCol = mix(vec3(1.0,0.97,1.0), iri, 0.15) * mix(0.72, 1.12, likeDetail);
  col = mix(col, likeCol, likeShape*lRev*(0.98 - wisp));
  col += mix(vec3(0.95,0.45,1.0), iri, 0.3)*likeGlow*lRev*0.55;
  vec3 ember = pal(dn*3.0 + uTime*0.2);                             // the glowing edge as it's eaten / born
  col += ember*(hEdge*max(heartShape, heartGlow*0.5) + lEdge*max(likeShape, likeGlow*0.5))*1.5;

  float spk = glitter(q*6.0 + vec2(0.0, T*0.4), uTime*1.3, 0.45 + uCharge*0.3) + glitter(q*11.0 - vec2(T*0.3, 0.0), uTime*1.7, 0.3 + uCharge*0.3)*0.8;
  col += (vec3(1.0) + iri*0.6)*spk*(0.7 + 0.6*fog)*(1.7 + uCharge*1.0);   // sparkly liquid

  col *= 1.0 + uCharge*0.22 + kick*0.3 + uHover*0.08;               // lights up with magic
  col += mix(vec3(0.95,0.8,1.0), iri, 0.5)*exp(-r*r*3.5)*(uCharge*0.28 + kick*0.25);
  col *= 0.7 + 0.4*z;                                               // thicker glass at the edge
  col += pal(r*1.2 + uv.y*0.4 + uTime*0.03 + 0.5)*pow(1.0-z, 2.2)*(0.85 + uCharge*0.6);  // rainbow rim
  col += vec3(1.0,0.75,0.95)*smoothstep(0.45,0.0,length((uv - vec2(0.0,-0.62))*vec2(1.0,1.8)))*0.35;  // caustic
  vec3 H = normalize(normalize(vec3(-0.55,0.65,0.55)) + vec3(0.0,0.0,1.0));
  float spec = pow(max(dot(n,H),0.0), 90.0)*0.6;
  float a2 = atan(uv.y, uv.x);                                      // curved window reflection, top-left
  float arc = smoothstep(0.64,0.72,r)*smoothstep(0.92,0.84,r)*smoothstep(0.75,0.15,abs(a2 - 2.25))*0.6;
  float dot1 = smoothstep(0.10,0.03,length(uv - vec2(-0.34,0.40)))*0.9;
  float tiny = smoothstep(0.06,0.0,length(uv - vec2(0.42,-0.30)))*0.5;
  float rim2 = smoothstep(0.86,0.97,r)*smoothstep(0.2,0.6,-uv.y*0.7 + uv.x*0.3)*0.25;
  col += vec3(1.0)*(spec + arc + dot1 + tiny) + vec3(0.8,0.9,1.0)*rim2;
  gl_FragColor = vec4(clamp(col,0.0,1.0)*mask, mask);
}`;

// LIKE 👍 painted once into a texture: R = sharp shape, G = soft glow, B = inner detail
function likeTexture(size = 256) {
  const mk = () => { const c = document.createElement("canvas"); c.width = c.height = size; return c; };
  const paint = (c, blur) => {
    const g = c.getContext("2d");
    if (blur) g.filter = `blur(${Math.round(size * 0.035)}px)`;
    g.textBaseline = "middle"; g.fillStyle = "#fff";
    const word = `900 ${Math.round(size * 0.15)}px "Arial Black", Arial, sans-serif`;
    const emo = `${Math.round(size * 0.16)}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
    g.font = word; const ww = g.measureText("LIKE").width;
    g.font = emo; const ew = g.measureText("👍").width;
    const gap = size * 0.03, x0 = (size - ww - gap - ew) / 2, y = size / 2;
    g.font = word; g.fillText("LIKE", x0, y + size * 0.005);
    g.font = emo; g.fillText("👍", x0 + ww + gap, y);
  };
  const sharp = mk(), soft = mk(); paint(sharp, false); paint(soft, true);
  const a = sharp.getContext("2d").getImageData(0, 0, size, size).data;
  const b = soft.getContext("2d").getImageData(0, 0, size, size).data;
  const out = new Uint8Array(size * size * 4);
  for (let i = 0; i < a.length; i += 4) {
    const lum = (a[i] * 0.3 + a[i + 1] * 0.59 + a[i + 2] * 0.11) / 255;
    out[i] = a[i + 3]; out[i + 1] = b[i + 3]; out[i + 2] = Math.round(Math.min(1, lum * 1.15) * 255); out[i + 3] = 255;
  }
  return { size, data: out };
}

function orbGL(cv) {
  let gl = null;
  try { gl = cv.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false }); } catch { /* no webgl */ }
  if (!gl) return null;
  const shader = (type, src) => {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; }
    return s;
  };
  const vs = shader(gl.VERTEX_SHADER, ORB_VERT), fs = shader(gl.FRAGMENT_SHADER, ORB_FRAG);
  if (!vs || !fs) return null;
  const pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return null;
  gl.useProgram(pr);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const t = likeTexture();
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, t.size, t.size, 0, gl.RGBA, gl.UNSIGNED_BYTE, t.data);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  const names = ["uTime", "uFlow", "uCharge", "uPulse", "uHover", "uHeart", "uLike"];
  const U = {}; for (const k of ["uRes", "uTex", ...names]) U[k] = gl.getUniformLocation(pr, k);
  gl.uniform1i(U.uTex, 0);
  return (o) => {
    gl.viewport(0, 0, cv.width, cv.height);
    gl.uniform2f(U.uRes, cv.width, cv.height);
    for (const k of names) gl.uniform1f(U[k], o[k]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
}

export function initPep({ sb, rpc, h, toast, audio, getToken }) {
  const root = document.getElementById("pep");
  if (!root) return { authChanged() {} };

  // ---------- DOM ----------
  const quote = h("p", { class: "pep-quote" }, "...");
  const orbCv = h("canvas", { class: "orb-gl", "aria-hidden": "true" });
  const orbEl = h("span", { class: "orb" }, orbCv, h("span", { class: "orb-lbl", "aria-hidden": "true" }, "👍 LIKE"));
  const btn = h("button", { type: "button", class: "sb", "aria-label": "Like today's saying" }, orbEl);
  const wrap = h("div", { class: "sb-wrap" }, btn);
  const fxBack = h("canvas", { class: "smash-fx back", "aria-hidden": "true" });
  const fxFront = h("canvas", { class: "smash-fx front", "aria-hidden": "true" });
  const stageEl = h("div", { class: "smash-stage" }, h("span", { class: "pool", "aria-hidden": "true" }), fxBack, wrap, fxFront);
  const cells = h("span", { class: "cells" });
  const counter = h("div", { class: "hits", role: "status", "aria-label": "Likes today" }, cells, h("small", null, "likes"));
  const smash = h("div", { class: "smash" }, stageEl, counter);
  root.replaceChildren(quote, smash);

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const ctxs = [fxBack, fxFront].map((c) => { c.width = c.height = W * dpr; const g = c.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); return g; });
  orbCv.width = orbCv.height = Math.round(BALL * dpr);
  let drawOrb = orbGL(orbCv);
  if (!drawOrb) orbEl.classList.add("nogl"); // plain CSS ball if WebGL isn't available
  orbCv.addEventListener("webglcontextlost", (e) => { e.preventDefault(); drawOrb = null; orbEl.classList.add("nogl"); });

  // ---------- sounds: a crystal chime that climbs a scale as the magic builds ----------
  let master = null, nbuf = null;
  function A() {
    const a = audio(); if (!a || a.state !== "running") return null;
    if (!master || master.context !== a) { master = a.createGain(); master.gain.value = 0.45; master.connect(a.destination); }
    if (!nbuf || nbuf.sampleRate !== a.sampleRate) {
      nbuf = a.createBuffer(1, a.sampleRate * 2, a.sampleRate);
      const d = nbuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return a;
  }
  function tone(a, t, dur, { type = "sine", f = 440, g = 0.2, atk = 0.004 } = {}) {
    const o = a.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    const gn = a.createGain(); gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(g, t + atk); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(gn).connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  function shimmer(a, t, dur, g) {
    const s = a.createBufferSource(); s.buffer = nbuf;
    const fl = a.createBiquadFilter(); fl.type = "highpass"; fl.frequency.value = 6500;
    const gn = a.createGain(); gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(g, t + dur * 0.3); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl).connect(gn).connect(master); s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }
  const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
  const sound = (fn) => (...args) => { try { const a = A(); if (a) fn(a, a.currentTime, ...args); } catch { /* audio is a bonus */ } };
  const chime = sound((a, t, k) => {
    const f = 880 * 2 ** (SCALE[Math.min(SCALE.length - 1, Math.floor(k * SCALE.length))] / 12);
    tone(a, t, 0.7, { f, g: 0.07 }); tone(a, t, 0.35, { type: "triangle", f: f * 2, g: 0.022 }); tone(a, t + 0.03, 0.25, { f: f * 3.01, g: 0.012 });
    shimmer(a, t, 0.35, 0.025 + k * 0.03);
  });
  const swell = sound((a, t) => { for (const f of [220, 330, 440]) tone(a, t, 1.6, { f, g: 0.035, atk: 0.35 }); shimmer(a, t, 1.2, 0.04); });

  // ---------- energy (2D canvases behind and in front of the ball) ----------
  const strands = [], motes = [], rings = [], darts = [];
  let hueBase = rnd(0, 360);
  const HUES = [190, 268, 292, 318, 338]; // cyan, violet, purple, magenta, pink: on-brand magic
  const pickHue = () => HUES[Math.floor(Math.random() * HUES.length)] + rnd(-10, 10);
  // strands spiral out in a flattened disc (sq) so they stay close to the panel
  function spawnStrand(boost = 0) {
    const a = rnd(0, TAU);
    strands.push({ a, r: RB * rnd(0.82, 0.98), w: SWIRL * rnd(1.7, 3.1), vr: rnd(40, 70) * (1 + boost * 0.5), t: 0, life: rnd(0.9, 1.5),
      hue: pickHue(), width: rnd(1.3, 2.5), sq: rnd(0.5, 0.72), layer: Math.random() < 0.3 ? 0 : 1, trail: [] });
  }
  function spawnMote() {
    const a = rnd(0, TAU);
    motes.push({ a, r: RB * rnd(0.9, 1.05), w: SWIRL * rnd(1.2, 2.4), vr: rnd(26, 56), t: 0, life: rnd(0.6, 1.2), s: rnd(2.5, 5), hue: pickHue(), layer: Math.random() < 0.3 ? 0 : 1 });
  }
  // a spark that flies from the ball to the counter (the digit rolls when it lands)
  function spawnDart(onLand) {
    const fr = fxFront.getBoundingClientRect(), cr = cells.getBoundingClientRect(), k = W / (fr.width || W);
    const tx = (cr.left + cr.width * 0.7 - fr.left) * k, ty = (cr.top + cr.height / 2 - fr.top) * k;
    const a0 = -0.9 + rnd(-0.3, 0.3);
    darts.push({ x0: CX + Math.cos(a0) * RB, y0: CY + Math.sin(a0) * RB, cx: (CX + tx) / 2 + rnd(-10, 10), cy: Math.min(CY, ty) - rnd(25, 45), tx, ty, t: 0, life: 0.52, hue: pickHue(), trail: [], onLand });
  }
  function burst(x, y, n, hue) {
    for (let i = 0; i < n; i++) { const a = rnd(0, TAU), v = rnd(20, 60); motes.push({ fx: x, fy: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: rnd(0.3, 0.6), s: rnd(2, 4), hue: hue + rnd(-40, 40), layer: 1 }); }
  }
  const col = (hue, l, a) => `hsla(${(hue % 360 + 360) % 360},100%,${l}%,${a.toFixed(3)})`;
  function star(g, x, y, s) {
    g.beginPath(); g.moveTo(x, y - s);
    g.quadraticCurveTo(x, y, x + s, y); g.quadraticCurveTo(x, y, x, y + s);
    g.quadraticCurveTo(x, y, x - s, y); g.quadraticCurveTo(x, y, x, y - s); g.fill();
  }
  function drawTrail(g, trail, width, hue, alpha) {
    const n = trail.length; if (n < 2) return;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i < n; i++) {
        const u = i / (n - 1);
        g.lineWidth = Math.max(0.3, width * u * (pass ? 1 : 3.6));
        g.strokeStyle = col(hue + u * 22, pass ? 82 : 62, alpha * u * (pass ? 1 : 0.2));
        g.beginPath(); g.moveTo(trail[i - 1][0], trail[i - 1][1]); g.lineTo(trail[i][0], trail[i][1]); g.stroke();
      }
    }
  }
  // two tilted rings of light that orbit the ball once the magic is strong
  const ORBITS = [{ R: 60, sq: 0.28, tilt: 0.38, spd: 1.7, ph: 0 }, { R: 67, sq: 0.2, tilt: -0.55, spd: -1.25, ph: 2 }];
  function drawOrbits(gs, I, now) {
    if (I < 0.01) return;
    for (const o of ORBITS) {
      const ph = o.ph + (now / 1000) * o.spd, ct = Math.cos(o.tilt), st = Math.sin(o.tilt);
      let prev = null;
      for (let i = 0; i <= 64; i++) {
        const th = (i / 64) * TAU, lx = Math.cos(th) * o.R, ly = Math.sin(th) * o.R * o.sq;
        const pt = [CX + lx * ct - ly * st, CY + lx * st + ly * ct], front = Math.sin(th) > 0;
        if (prev) {
          const g = gs[front ? 1 : 0];
          const comet = Math.pow(0.5 + 0.5 * Math.cos(th - ph), 8);
          g.lineWidth = 1.2 + comet * 1.6;
          g.strokeStyle = col(300 + 42 * Math.sin(th + hueBase * 0.02), 75, I * (0.18 + comet * 0.8));
          g.beginPath(); g.moveTo(prev[0], prev[1]); g.lineTo(pt[0], pt[1]); g.stroke();
        }
        prev = pt;
      }
    }
  }
  let fxDirty = false;
  function stepFx(dt, now, orbitI) {
    const [gb, gf] = ctxs;
    const busy = strands.length || motes.length || rings.length || darts.length || orbitI > 0.01;
    if (!busy) { if (fxDirty) { gb.clearRect(0, 0, W, W); gf.clearRect(0, 0, W, W); fxDirty = false; } return; }
    fxDirty = true;
    gb.clearRect(0, 0, W, W); gf.clearRect(0, 0, W, W);
    for (const g of ctxs) { g.globalCompositeOperation = "lighter"; g.lineCap = "round"; }
    drawOrbits(ctxs, orbitI, now);
    for (let i = strands.length - 1; i >= 0; i--) {
      const s = strands[i]; s.t += dt; const k = s.t / s.life;
      if (k >= 1) { strands.splice(i, 1); continue; }
      s.a += s.w * dt * (1 - k * 0.5); s.r += s.vr * dt * (1 - k * 0.45);
      s.trail.push([CX + Math.cos(s.a) * s.r, CY + Math.sin(s.a) * s.r * s.sq]); if (s.trail.length > 18) s.trail.shift();
      drawTrail(ctxs[s.layer], s.trail, s.width, s.hue + s.t * 20, Math.min(1, s.t / 0.12) * Math.pow(1 - k, 1.3));
    }
    for (let i = motes.length - 1; i >= 0; i--) {
      const m = motes[i]; m.t += dt; const k = m.t / m.life;
      if (k >= 1) { motes.splice(i, 1); continue; }
      let x, y;
      if (m.fx !== undefined) { m.fx += m.vx * dt; m.fy += m.vy * dt; m.vx *= 0.92; m.vy *= 0.92; x = m.fx; y = m.fy; }
      else { m.a += m.w * dt; m.r += m.vr * dt; x = CX + Math.cos(m.a) * m.r; y = CY + Math.sin(m.a) * m.r * 0.9; }
      const g = ctxs[m.layer]; g.fillStyle = col(m.hue, 85, Math.sin(Math.PI * k)); star(g, x, y, m.s * Math.sin(Math.PI * k));
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i]; r.t += dt; const k = r.t / r.life;
      if (k >= 1) { rings.splice(i, 1); continue; }
      const e = 1 - Math.pow(1 - k, 3);
      gf.lineWidth = 2.2 * (1 - k) + 0.4; gf.strokeStyle = col(r.hue + k * 60, 75, 0.55 * (1 - k));
      gf.beginPath(); gf.arc(CX, CY, RB + 2 + e * r.grow, 0, TAU); gf.stroke();
    }
    for (let i = darts.length - 1; i >= 0; i--) {
      const d = darts[i]; d.t += dt; const k = Math.min(1, d.t / d.life), e = k * k * (3 - 2 * k), u = 1 - e;
      const x = u * u * d.x0 + 2 * u * e * d.cx + e * e * d.tx, y = u * u * d.y0 + 2 * u * e * d.cy + e * e * d.ty;
      d.trail.push([x, y]); if (d.trail.length > 10) d.trail.shift();
      drawTrail(gf, d.trail, 2.8, d.hue, 0.95);
      gf.fillStyle = col(d.hue, 92, 1); star(gf, x, y, 5);
      if (k >= 1) { darts.splice(i, 1); burst(d.tx, d.ty, 6, d.hue); d.onLand?.(); }
    }
    for (const g of ctxs) g.globalCompositeOperation = "source-over";
  }

  // ---------- visions + charge + render loop ----------
  let vis = true, raf = 0, last = 0, flow = 0, hover = 0, hoverT = 0;
  let charge = 0, lastTap = -1e9, swelled = false;
  let heartV = 1, likeV = 0, showing = "heart", nextSwap = performance.now() + 6500;
  const VIS_SPEED = 0.7; // ~1.4 s to fully dissolve or form
  function frame(now) {
    raf = 0;
    if (!vis || document.hidden) return;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
    const calm = reduced() ? 0.15 : 1;
    if (now - lastTap > 450) charge = Math.max(0, charge - dt * 0.32);
    if (charge < 0.3) swelled = false;
    hover += (hoverT - hover) * Math.min(1, dt * 5);
    flow += dt * (0.22 + hover * 0.3 + charge * 1.4) * calm;
    hueBase += dt * (12 + charge * 60);
    // visions take turns: the shown one is eaten by the fog first, then the other forms
    if (now > nextSwap && now - lastTap > 5000) { showing = showing === "heart" ? "like" : "heart"; nextSwap = now + 7000; }
    const sp = dt * VIS_SPEED;
    if (showing === "like") { heartV = Math.max(0, heartV - sp); if (heartV < 0.3) likeV = Math.min(1, likeV + sp); }
    else { likeV = Math.max(0, likeV - sp); if (likeV < 0.3) heartV = Math.min(1, heartV + sp); }
    if (drawOrb) drawOrb({ uTime: (now / 1000) * calm, uFlow: flow, uCharge: charge, uPulse: (now - lastTap) / 1000, uHover: hover, uHeart: heartV, uLike: likeV });
    wrap.style.setProperty("--charge", charge.toFixed(3));
    if (!reduced() && charge > 0.45 && Math.random() < dt * (charge - 0.35) * 10) spawnStrand(charge);   // overflowing magic
    stepFx(dt, now, reduced() ? 0 : smooth(0.35, 0.85, charge));
    raf = requestAnimationFrame(frame);
  }
  function start() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  new IntersectionObserver(([e]) => { vis = e.isIntersecting; if (vis) start(); }).observe(stageEl);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) start(); });
  btn.addEventListener("pointerenter", () => { hoverT = 1; });
  btn.addEventListener("pointerleave", () => { hoverT = 0; });
  btn.addEventListener("focus", () => { hoverT = 1; });
  btn.addEventListener("blur", () => { hoverT = 0; });

  // ---------- likes (one shared pool per day) ----------
  let day = todayStr(), sayings = [];
  let serverTotal = 0, pending = 0, inflight = 0, shown = -1, flushT = 0, warned = false, nudged = false;
  function showSaying() { quote.textContent = sayings.length ? sayings[dayNum(day) % sayings.length].body : "I will always believe in you."; }
  // 2000s hit-counter digits: 000168
  function setShown(n, roll = false) {
    if (n <= shown) return;
    const prev = shown < 0 ? "" : String(shown).padStart(6, "0");
    shown = n;
    const s = String(n).padStart(6, "0");
    if (cells.children.length !== s.length) cells.replaceChildren(...[...s].map(() => h("b")));
    [...s].forEach((ch, i) => {
      const b = cells.children[i];
      if (b.textContent === ch) return;
      b.textContent = ch;
      if (roll && prev && !reduced()) b.animate([{ transform: "translateY(-45%)", opacity: 0.2 }, { transform: "none", opacity: 1 }], { duration: 160, easing: "cubic-bezier(.2,.8,.3,1)" });
    });
  }
  async function loadSayings() {
    const { data } = await sb.from("sayings").select("id,body").order("id");
    sayings = data || []; showSaying();
  }
  async function loadTotal() {
    const d = day;
    const { data, error } = await sb.from("saying_likes").select("n").eq("day", d);
    if (error || d !== day) return;
    serverTotal = (data || []).reduce((a, r) => a + r.n, 0);
    setShown(serverTotal + pending, true);
  }
  function countLike() {
    if (!getToken()) {
      if (!nudged) { nudged = true; toast("Sign in so your likes count!"); }
      return false;
    }
    pending++;
    if (!flushT) flushT = setTimeout(flush, 450);
    return true;
  }
  async function flush() {
    flushT = 0;
    if (inflight || !pending) return;
    const tok = getToken(); if (!tok) { pending = 0; return; }
    const n = Math.min(pending, 40);
    pending -= n; inflight = n;
    try {
      const total = await rpc("smash_like", { p_token: tok, p_count: n });
      serverTotal = Math.max(serverTotal, Number(total) || 0);
    } catch (e) {
      if (!warned) { warned = true; toast((e && e.message) || "Your likes didn't go through.", true); }
    }
    inflight = 0;
    setShown(serverTotal + pending);
    if (pending && !flushT) flushT = setTimeout(flush, 300);
  }
  // don't lose a last burst when someone closes the tab mid-tapping
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

  // ---------- a tap ----------
  let pressA = null;
  function tap() {
    audio();
    const now = performance.now();
    charge = Math.min(1, charge + (now - lastTap < 600 ? 0.11 : 0.16));
    lastTap = now;
    if (showing !== "like") { showing = "like"; }
    nextSwap = now + 7000;
    start();
    pressA?.cancel();
    pressA = orbEl.animate([
      { transform: "scale(1)" }, { transform: "scale(.94)", offset: 0.25 }, { transform: "scale(1.045)", offset: 0.65 }, { transform: "scale(1)" },
    ], { duration: 320, easing: "cubic-bezier(.3,.7,.3,1)" });
    chime(charge); vib(5);
    if (charge > 0.6 && !swelled) { swelled = true; swell(); }
    const counted = countLike();
    if (reduced()) { if (counted) setShown(serverTotal + pending + inflight); return; }
    rings.push({ t: 0, life: 0.5 + charge * 0.2, grow: 22 + charge * 26, hue: pickHue() });
    const n = 2 + Math.round(charge * 3);
    for (let i = 0; i < n; i++) spawnStrand(charge);
    for (let i = 0; i < 3 + Math.round(charge * 5); i++) spawnMote();
    if (counted) spawnDart(() => setShown(serverTotal + pending + inflight, true));
  }
  btn.addEventListener("pointerdown", (e) => { if (e.button !== 0) return; e.preventDefault(); tap(); });
  btn.addEventListener("keydown", (e) => { if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); tap(); } });
  btn.addEventListener("click", (e) => e.preventDefault());
  btn.addEventListener("contextmenu", (e) => e.preventDefault());

  // ---------- go ----------
  setShown(0); start();
  loadSayings().catch(() => showSaying());
  loadTotal().catch(() => {});
  let rtT = 0;
  sb.channel("pep").on("postgres_changes", { event: "*", schema: "public", table: "saying_likes" }, (p) => {
    if (p.new && p.new.day === day) { clearTimeout(rtT); rtT = setTimeout(loadTotal, 400); }
  }).subscribe();
  setInterval(() => { // new saying at midnight Pacific
    const d = todayStr();
    if (d !== day) { day = d; shown = -1; serverTotal = 0; showSaying(); setShown(0); loadTotal(); }
  }, 60000);

  return { authChanged() { warned = false; nudged = false; loadTotal().catch(() => {}); } };
}
