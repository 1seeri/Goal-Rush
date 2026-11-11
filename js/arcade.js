// =============================================================
//  arcade.js — GOAL RUSH ’26, a playable retro football game.
//
//  You don’t play 90 minutes. You play the moments that matter:
//  your team’s attacks (drag to pass or shoot, time slows while
//  you aim) and some of theirs (tap to dive with your keeper).
//  Everything else is simulated around you.
//
//  Real data: teams, groups and dates are the real 2026 World Cup;
//  each team’s strength is its real Elo rating going in, which sets
//  how fast their players run, how many chances each side gets and
//  how good the keeper is. Your attackers are your team’s real 2026
//  goalscorers.
// =============================================================
import * as E from './engine.js';
import { rng as mulberry } from './model.js';
import { loadData, VENUES, code, colour, onColour, cityName, TEAMS as NAT } from './data.js';
import * as Audio from './audio.js';
import { PAD, initPad, padMode, padBuzz, padFx, padSend } from './pad-host.js';

const $ = s => document.querySelector(s);
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const kit = t => `--k:${colour(t)};--o:${onColour(t)};--o2:${onColour(t)}`;
const day = d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }, del(k) { try { localStorage.removeItem(k); } catch {} } };
const wait = ms => new Promise(r => setTimeout(r, ms));
const FINISH = ['GROUP STAGE', 'ROUND OF 32', 'ROUND OF 16', 'QUARTER-FINALS', '4TH PLACE', '3RD PLACE', 'RUNNER-UP', 'CHAMPIONS'];
const KO_RANK = { R32: 1, R16: 2, QF: 3, SF: 4 };

// ---------- sound ----------
let AC = null;
function blip(f = 660, d = .07, type = 'square', vol = .05) {
  if (Audio.isMuted()) return;
  try { AC ||= new (window.AudioContext || window.webkitAudioContext)(); const o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime; o.type = type; o.frequency.value = f; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + d); o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + d + .02); } catch {}
}
const jingle = (notes, step = 90) => notes.forEach((n, i) => setTimeout(() => blip(n, .14), i * step));
const SFX = { kick: () => blip(180, .06, 'square', .08), pass: () => blip(420, .04), goal: () => jingle([523, 659, 784, 1047, 784, 1047]), save: () => jingle([392, 523], 80), lose: () => jingle([392, 330, 262], 130), whistle: n => Audio.whistle(n) };

// ---------- data ----------
let REAL, GROUPS, TEAMS, ELO = {}, RANK = {}, ROSTER = {}, REALFINISH = {}, GROUP_OF = {};
function finishOf(team, matches) {
  let best = 0;
  for (const m of matches) {
    if (m.num <= 72 || !m.ft || (m.t1 !== team && m.t2 !== team)) continue;
    const won = E.winnerOf(m) === team;
    best = Math.max(best, m.num === 104 ? (won ? 7 : 6) : m.num === 103 ? (won ? 5 : 4) : KO_RANK[E.STAGE_OF(m.num)] || 0);
  }
  return best;
}
async function boot() {
  initPad();
  const [D, eloFile] = await Promise.all([loadData(), fetch('data/elo.json').then(r => r.json()).catch(() => ({ ratings: {} }))]);
  REAL = D.matches; GROUPS = D.groups; TEAMS = Object.values(GROUPS).flat();
  for (const [g, ts] of Object.entries(GROUPS)) ts.forEach(t => (GROUP_OF[t] = g));
  for (const m of [...REAL].sort((a, b) => a.num - b.num)) { const r = eloFile.ratings[m.num]; if (!r) continue; if (!(m.t1 in ELO)) ELO[m.t1] = r[0]; if (!(m.t2 in ELO)) ELO[m.t2] = r[1]; }
  TEAMS.forEach(t => (ELO[t] ??= 1700));
  [...TEAMS].sort((a, b) => ELO[b] - ELO[a]).forEach((t, i) => (RANK[t] = i + 1));
  for (const s of E.scorers(REAL)) (ROSTER[s.team] ||= []).push(s);
  for (const t of TEAMS) REALFINISH[t] = finishOf(t, REAL);
  registerClubs();
  route();
}
const names = team => { const r = (ROSTER[team] || []).map(p => p.name); const fill = ['No. 9', 'No. 10', 'No. 7', 'No. 11'].map(n => `${code(team)} ${n}`); return [...r, ...fill].slice(0, 4); };
const surname = n => n.split(' ').slice(-1)[0].toUpperCase();
const stars = t => { const n = 5 - Math.min(4, Math.floor((RANK[t] - 1) / 9.6)); return '★'.repeat(n) + '<span class="dim">' + '★'.repeat(5 - n) + '</span>'; };

// ---------- shell ----------
function render(html) { app.innerHTML = html; window.scrollTo(0, 0); }
function toast(msg) { const t = $('#toast'); t.innerHTML = msg; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2200); }
function flash(big, small, team) { padFx(big, /GOAL|!/.test(big) && team === (PRO?.team ?? R?.team) ? 'goal' : 'bad'); padBuzz(team === (PRO?.team ?? R?.team) ? [90, 50, 90, 50, 260] : [300]); const f = $('#flash'); f.innerHTML = `<div class="fl" style="${kit(team)}"><b>${big}</b><span>${small}</span></div>`; f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); }
function confetti() {
  const box = document.createElement('div'); box.className = 'confetti'; const cols = ['#FFD23F', '#3ECF6A', '#FF5252', '#4FB3FF', '#B57BFF', '#FFFFFF'];
  box.innerHTML = Array.from({ length: 60 }, (_, i) => `<i style="left:${Math.random() * 100}%;background:${cols[i % 6]};animation-delay:${Math.random() * .6}s;animation-duration:${1.4 + Math.random()}s"></i>`).join('');
  document.body.append(box); setTimeout(() => box.remove(), 3000);
}
function route() { leaveRoom(); PRO = null; R = store.get('ft-arcade'); if (location.hash === '#play' && R) return R.done ? endScreen() : hubScreen(); title(); }
window.addEventListener('hashchange', route);
document.addEventListener('click', e => {
  if (!Audio.ready()) { Audio.start(); Audio.setLevel(0.25); }
  if (e.target.closest('button, a')) blip(880, .04);
  const g = e.target.closest('[data-go]'); if (g) { e.preventDefault(); location.hash = g.dataset.go === 'home' ? '' : g.dataset.go; route(); }
});
const snd = $('#snd'); const paintSnd = () => { snd.textContent = Audio.isMuted() ? '♪ OFF' : '♪ ON'; }; snd.onclick = () => { Audio.start(); Audio.setMuted(!Audio.isMuted()); paintSnd(); }; paintSnd();

// Tap once: “SURE?”. Tap again within 3 seconds: do it.
function armRestart(btn, go) {
  if (!btn) return;
  const label = btn.textContent;
  btn.onclick = () => {
    if (btn.dataset.armed) return go();
    btn.dataset.armed = '1'; btn.textContent = 'SURE? TAP AGAIN'; btn.classList.add('danger'); blip(220, .1);
    setTimeout(() => { delete btn.dataset.armed; btn.textContent = label; btn.classList.remove('danger'); }, 3000);
  };
}

// ---------- title + team pick ----------
function title() {
  const saved = store.get('ft-arcade');
  render(`<section class="title">
    <div class="logo-big"><span>GOAL RUSH</span><em>’26</em></div>
    <p class="title-sub">PLAY THE MOMENTS</p>
    <div class="howto">
      <div><b>DRAG YOUR PLAYER</b><span>to dribble. Tap him for a skill move that beats defenders.</span></div>
      <div><b>DRAG ANYWHERE ELSE</b><span>to pass or shoot. Time slows while you aim. Passing moves fool the keeper.</span></div>
      <div><b>TAP</b><span>to dive when they shoot at your goal.</span></div>
    </div>
    <div class="menu">
      <button class="btn big pro" id="pro">★ BE A PRO ★ <small>${PRO_SAVED() ? 'CONTINUE · ' + esc(store.get('ft-pro').name) + ', AGE ' + (store.get('ft-pro').age ?? 18) : 'NEW CAREER'}</small></button>
      ${saved && !saved.done ? `<a class="btn big y" href="#play" data-go="play">▶ CONTINUE CUP <small>${esc(saved.team)}</small></a>` : ''}
      <button class="btn big ${saved && !saved.done ? '' : 'y'}" id="new">CLASSIC: CONTROL THE TEAM</button>
      <button class="btn big mpb" id="multi">⚔ MULTIPLAYER <small>PLAY A FRIEND</small></button>
      <button class="btn" id="practice">PRACTICE A CHANCE</button>
      ${PRO_SAVED() ? '<button class="text-btn" id="newpro">Start a brand-new player instead</button>' : ''}
      ${(store.get('gr-legends') || []).length ? '<button class="text-btn" id="legends">🏛 Hall of Legends</button>' : ''}
    </div>
  </section>`);
  $('#new').onclick = pickTeam;
  $('#pro').onclick = () => { PRO = store.get('ft-pro'); if (PRO && !PRO.done) { migrate(PRO); proGo(); } else proCreate(); };
  const lg = $('#legends'); if (lg) lg.onclick = legendsScreen;
  const np = $('#newpro'); if (np) armRestart(np, () => { store.del('ft-pro'); PRO = null; proCreate(); });
  $('#practice').onclick = practice;
  $('#multi').onclick = multiMenu;
}
function pickTeam() {
  render(`<section class="pick"><h2 class="screen-title">PICK YOUR NATION</h2>
    <p class="lede center">Harder teams = faster defenders and better keepers. Underdogs are where the glory is.</p>
    <div class="grid" id="grid">${[...TEAMS].sort((a, b) => RANK[a] - RANK[b]).map(t => `<button class="tile" data-team="${esc(t)}" style="${kit(t)}"><span class="tc">${code(t)}</span><span class="tn">${esc(t)}</span><span class="ts">${stars(t)}</span><span class="tr">Real: ${FINISH[REALFINISH[t]]}</span></button>`).join('')}</div></section>`);
  $('#grid').onclick = e => { const b = e.target.closest('[data-team]'); if (!b) return; R = { team: b.dataset.team, seed: (Math.random() * 1e9) | 0, over: {}, log: [], done: false, goals: {} }; save(); location.hash = 'play'; route(); };
}

// ---------- tournament (same rules as the real one) ----------
let R = null;
const save = () => (PRO && R === PRO.cup ? store.set('ft-pro', PRO) : store.set('ft-arcade', R));
const eff = () => REAL.map(m => R.over[m.num] || (R.fresh || (m.num > 72 && (m.t1 === R.team || m.t2 === R.team)) ? { ...m, ft: null, et: null, p: null, goals1: [], goals2: [] } : m));
const build = () => E.buildTournament(GROUPS, eff());
function lam(a, b, ground) { const h = t => VENUES[ground]?.country === code(t) ? 100 : 0; return 1.25 * Math.exp(0.0019 * (ELO[a] - ELO[b] + h(a) - h(b))); }
function poisson(l, r) { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= r(); } while (p > L); return k - 1; }
function simKO(a, b, num, r) {
  const real = REAL.find(m => m.num === num) || {};
  const ft = [poisson(lam(a, b, real.ground), r), poisson(lam(b, a, real.ground), r)]; let et = null, p = null;
  if (ft[0] === ft[1]) { et = [ft[0] + poisson(lam(a, b, real.ground) / 3, r), ft[1] + poisson(lam(b, a, real.ground) / 3, r)]; if (et[0] === et[1]) p = r() < .5 ? [4, 3] : [3, 4]; }
  const tot = et || ft, who = t => { const l = ROSTER[t] || []; if (!l.length) return `${code(t)} No. 9`; let x = r() * l.reduce((s, q) => s + q.goals + .6, 0); for (const q of l) { x -= q.goals + .6; if (x <= 0) return q.name; } return l[0].name; };
  const gl = (t, n) => Array.from({ length: n }, () => ({ name: who(t), minute: String(1 + Math.floor(r() * 90)) }));
  return { num, stage: E.STAGE_OF(num), date: real.date, ground: real.ground, t1: a, t2: b, ft, et, p, goals1: gl(a, tot[0]), goals2: gl(b, tot[1]) };
}
function advance() {
  const r = mulberry(R.seed + Object.keys(R.over).length * 7919);
  for (let i = 0; i < 40; i++) {
    const T = build(); let ch = false; if (!T.groupsDone) return T;
    for (const s of E.BRACKET) { const k = T.ko[s.num]; if (!k.t1 || !k.t2 || R.over[s.num] || k.result || k.t1 === R.team || k.t2 === R.team) continue; R.over[s.num] = simKO(k.t1, k.t2, s.num, r); ch = true; }
    if (!ch) return T;
  }
  return build();
}
function nextFixture() {
  const g = REAL.filter(m => m.num <= 72 && (m.t1 === R.team || m.t2 === R.team) && !R.over[m.num]).sort((a, b) => a.num - b.num);
  if (g.length) return { num: g[0].num, t1: g[0].t1, t2: g[0].t2, ko: false, date: g[0].date, ground: g[0].ground };
  const T = advance();
  for (const s of E.BRACKET) { const k = T.ko[s.num]; if (!R.over[s.num] && k.t1 && k.t2 && (k.t1 === R.team || k.t2 === R.team)) { const real = REAL.find(m => m.num === s.num); return { num: s.num, t1: k.t1, t2: k.t2, ko: true, date: real.date, ground: real.ground }; } }
  return null;
}
const stageName = f => E.STAGE_OF(f.num) === 'G' ? `GROUP ${GROUP_OF[f.t1]}` : E.STAGE_NAMES[E.STAGE_OF(f.num)].toUpperCase();

function hubScreen() {
  const f = nextFixture();
  if (!f) { const T = advance(); R.done = true; R.finish = finishOf(R.team, Object.values(R.over)); R.champ = T.ko[104].winner; save(); return endScreen(); }
  const me = R.team, opp = f.t1 === me ? f.t2 : f.t1, g = GROUP_OF[me];
  const rows = E.groupTable(GROUPS[g], eff().filter(m => m.group === g && m.ft && (R.over[m.num] || m.date < f.date)));
  render(`<section class="ahub" style="${kit(me)}">
    <div class="topbar"><button class="btn sm" id="restart">⟲ RESTART CUP</button><a class="btn sm" href="#" data-go="home">MENU</a></div>
    <ol class="path">${['G', 'R32', 'R16', 'QF', 'SF', 'F'].map((k, i) => `<li class="${R.log.some(l => (l.stage === '3P' ? 'SF' : l.stage) === k) || (k === 'G') ? 'on' : ''}"><span>${['GRP', 'R32', 'R16', 'QF', 'SF', 'FIN'][i]}</span>${R.log.filter(l => (l.stage === '3P' ? 'SF' : l.stage) === k).map(l => `<i class="res ${l.res}">${l.res}</i>`).join('')}</li>`).join('')}</ol>
    <article class="box next">
      <p class="lbl">${stageName(f)} · ${day(f.date)} · ${esc(VENUES[f.ground]?.stadium || '')}</p>
      <div class="vs"><span class="crest-px" style="${kit(me)}">${code(me)}</span><i>VS</i><span class="crest-px" style="${kit(opp)}">${code(opp)}</span></div>
      <p class="o-line">${esc(opp).toUpperCase()} · WORLD #${RANK[opp]} ${stars(opp)}</p>
      <p class="small">Your attackers: ${names(me).slice(0, 3).map(surname).join(' · ')}</p>
      <button class="btn big y" id="kick">KICK OFF ▶</button>
    </article>
    ${f.ko ? '' : `<article class="box"><table class="tbl"><caption>GROUP ${g}</caption><thead><tr><th>TEAM</th><th>P</th><th>GD</th><th>PTS</th></tr></thead><tbody>${rows.map((r, i) => `<tr class="${r.team === me ? 'me' : ''} ${i < 2 ? 'q' : ''}"><td><i class="dot" style="${kit(r.team)}"></i>${code(r.team)}</td><td>${r.p}</td><td>${r.gd > 0 ? '+' : ''}${r.gd}</td><td><b>${r.pts}</b></td></tr>`).join('')}</tbody></table></article>`}
  </section>`);
  $('#kick').onclick = () => playMatch(f);
  armRestart($('#restart'), () => { store.del('ft-arcade'); R = null; pickTeam(); });
}

// =============================================================
//  THE GAME: a canvas, attackers, defenders, a keeper and a ball
// =============================================================
const W = 192, H = 256, GL = 20, POST_L = 74, POST_R = 118;      // pitch in pixels, goal at the top
const SKINS = ['#F5D0A9', '#E0AC69', '#C68642', '#8D5524', '#5C3A1E'];
const hexD = (a, b) => { const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); const x = p(a), y = p(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
const gkCol = (...kits) => kits.some(k => hexD(k, '#46D17E') < 140) ? '#B57BFF' : '#46D17E';

function drawPitch(c, flip) {
  const F = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, flip ? H - y - h : y, w, h); };
  for (let i = 0; i < 16; i++) F(0, i * 16, W, 16, i % 2 ? '#3E9B50' : '#378F49');
  const Wt = '#E9F5E4';
  F(4, GL, W - 8, 1, Wt); F(4, GL, 1, H - GL, Wt); F(W - 5, GL, 1, H - GL, Wt);
  F(40, GL, 1, 54, Wt); F(151, GL, 1, 54, Wt); F(40, GL + 54, 112, 1, Wt);
  F(66, GL, 1, 18, Wt); F(125, GL, 1, 18, Wt); F(66, GL + 18, 60, 1, Wt);
  F(95, GL + 36, 2, 2, Wt);
  for (let a = .6; a < 2.55; a += .05) F(96 + Math.round(Math.cos(a) * 22), GL + 36 + Math.round(Math.sin(a) * 22), 1, 1, a > 1 && a < 2.15 ? Wt : 'rgba(0,0,0,0)');
  F(POST_L - 1, GL - 10, POST_R - POST_L + 3, 10, 'rgba(255,255,255,.25)');
  F(POST_L - 1, GL - 10, 2, 11, '#fff'); F(POST_R, GL - 10, 2, 11, '#fff'); F(POST_L - 1, GL - 10, POST_R - POST_L + 3, 1, '#fff');
  for (let x = POST_L + 3; x < POST_R; x += 4) F(x, GL - 9, 1, 9, 'rgba(255,255,255,.18)');
}
function drawMan(c, p, col, flip, skin, hl, t) {
  const x = Math.round(p.x) - 4, y0 = Math.round(flip ? H - p.y : p.y) - 10, F = (a, b, w, h, k) => { c.fillStyle = k; c.fillRect(x + a, y0 + b, w, h); };
  const step = p.moving ? (Math.floor(t * 9 + p.x) % 2) : 0;
  F(-1, 11, 10, 2, 'rgba(0,0,0,.3)');
  F(2, 0, 4, 1, '#2a1a10'); F(2, 1, 4, 3, skin);
  F(1, 4, 6, 4, col); F(0, 5, 1, 2, col); F(7, 5, 1, 2, col); F(0, 7, 1, 1, skin); F(7, 7, 1, 1, skin);
  F(2, 8, 4, 1, '#1b1b2b');
  F(2 + step, 9, 1, 2, skin); F(5 - step, 9, 1, 2, skin); F(2 + step, 10, 1, 1, '#111'); F(5 - step, 10, 1, 1, '#111');
  if (hl) { F(3, -6, 2, 1, '#FFE27A'); F(2, -5, 4, 1, '#FFE27A'); F(3, -4, 2, 1, '#FFE27A'); }
}
function setupCanvas() {
  const cv = $('#cv'); cv.width = W; cv.height = H; const c = cv.getContext('2d'); c.imageSmoothingEnabled = false; return { cv, c };
}
const toPix = (cv, e) => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; };

// One attacking chance. Resolves with { result: 'goal'|'saved'|'tackled'|'wide'|'intercepted'|'timeout', scorer }
function attackChance({ me, opp, practice = false, penalty = false, kind = 'normal', pro = null, random = Math.random, deadline = Infinity, live = null }) {
  return new Promise(res => {
    const { cv, c } = setupCanvas();
    const strength = clamp(1 + (ELO[me] - ELO[opp]) / 1800, .82, 1.18), dStrength = clamp(1 + (ELO[opp] - ELO[me]) / 1800, .82, 1.2);
    const nm = names(me), colA = colour(me), colD = colour(opp) === colA ? '#F2F2F2' : colour(opp);
    const r = random;
    let atk, def, youAt = -1;
    if (penalty) { atk = [{ x: 96, y: GL + 38, name: nm[0] }]; def = []; youAt = 0; }
    else if (kind === 'counter') { atk = [{ x: 96 + (r() * 30 - 15), y: 205, name: nm[0] }, { x: 48, y: 178, name: nm[1] }, { x: 146, y: 182, name: nm[2] }]; def = [{ x: 78, y: 112 }, { x: 116, y: 100 }]; youAt = 0; }
    else if (kind === 'solo') { atk = [{ x: 96 + (r() * 40 - 20), y: 128, name: nm[0] }]; def = [{ x: 96 + (r() * 20 - 10), y: 168 }]; youAt = 0; }
    else if (kind === 'freekick') {
      const bx = 70 + r() * 52, by = 84 + r() * 22, gx = 96 - bx, gy = GL - by, gd = Math.hypot(gx, gy), ux = gx / gd, uy = gy / gd;
      atk = [{ x: bx, y: by + 5, name: nm[0] }]; youAt = 0;
      def = [-8, 0, 8].map(o => ({ x: bx + ux * 22 - uy * o, y: by + uy * 22 + ux * o, wall: true }));
    } else {
      atk = [{ x: 96 + (r() * 40 - 20), y: 212, name: nm[3] }, { x: 34 + r() * 12, y: 150, name: nm[1] }, { x: 158 - r() * 12, y: 150, name: nm[2] }, { x: 96 + (r() * 20 - 10), y: 118, name: nm[0] }];
      def = [{ x: 62, y: 96 }, { x: 130, y: 96 }, { x: 96, y: 82 }, { x: 96 + (r() * 30 - 15), y: 168 }];
      youAt = pro ? ({ ST: 3, WG: 1, PM: 0 }[pro.pos] ?? 3) : -1;
    }
    if (pro && youAt >= 0) { atk[youAt].you = true; atk[youAt].name = pro.name; const mates = nm.filter(n => n !== pro.name); atk.forEach((a, i) => { if (i !== youAt) a.name = mates[i % mates.length]; }); }
    def.forEach(d => { d.stun = 0; d.contact = 0; });
    const PS = pro ? { pace: (.75 + pro.pace / 200) * (.8 + pro.energy / 500) * (pro.perks?.includes('speed') ? 1.12 : 1), shoot: .6 + pro.shoot / 110, pass: 1.3 - pro.pass / 200, drib: pro.dribble, perks: pro.perks || [] } : null;
    const isYou = i => i != null && !!atk[i]?.you && !!PS;
    const S = { shots: 0, skills: 0, tackled: false, touches: 0 };
    const keeper = { x: 96, y: GL + 5 };
    atk.forEach((a, i) => { a.tx = a.x; a.ty = a.y; a.run = i > 0; });
    let carrier = 0, ball = { x: atk[0].x, y: atk[0].y - 6, vx: 0, vy: 0 }, t = 0, over = null, lastKick = null, touched = new Set(), last = performance.now(), dive = null;
    let mode = null, aim = null, drib = null, downAt = 0, downPos = null, boost = 0, combo = 0, gotAt = 0, shake = 0, receiver = -1;
    const pops = [], keys = new Set();
    const pop = (txt, x, y, col = '#FFE27A') => pops.push({ txt, x, y, t: 0, col });
    const limit = penalty || kind === 'freekick' ? 99 : kind === 'solo' ? 6 : kind === 'counter' && !live ? 8 : 10;
    const end = (result, scorer) => { if (over) return; if (result === 'tackled' && isYou(carrier)) S.tackled = true; over = { result, scorer, t, combo, S }; };
    const cpos = () => carrier != null ? atk[carrier] : null;
    if (/[?&]debug/.test(location.search)) window.__arc = () => ({ atk: atk.map(p => ({ x: p.x, y: p.y })), carrier, combo, over: over?.result, ball: { ...ball }, receiver, lk: lastKick, t });

    const kick = (tx, ty) => {
      if (carrier == null || over) return;
      const dx = tx - ball.x, dy = ty - ball.y, d = Math.hypot(dx, dy) || 1, shot = ty < GL + 14;
      const me2 = isYou(carrier);
      const sp = shot ? clamp(150 + d * .9, 165, 275) * strength * (me2 ? .9 + pro.shoot / 500 : 1) : clamp(d * 1.3 + 26, 55, 235);
      if (me2 && shot) S.shots++;
      ball.vx = dx / d * sp; ball.vy = dy / d * sp;
      const oneTouch = t - gotAt < .45 && combo > 0;
      lastKick = { by: carrier, shot, t, pm: me2 ? PS.pass : 1 }; touched = new Set(); carrier = null; mode = null;
      if (shot) {
        SFX.kick(); shake = 3;
        if (oneTouch) pop('ONE-TOUCH!', ball.x, ball.y - 10);
        else if (d > 120) pop('FROM DISTANCE!', ball.x, ball.y - 10, '#FFFFFF');
        if (live) return;
        // the keeper reads it; passing moves and one-touch finishes make him slower
        const cross = ball.x + ball.vx * Math.max(0, (ball.y - keeper.y) / Math.max(1, -ball.vy));
        const err = (penalty ? 0 : 22) * (1 + .3 * combo + (oneTouch ? .6 : 0)) / dStrength * (me2 ? PS.shoot * (PS.perks.includes('clinical') ? 1.35 : 1) : 1);
        const guess = penalty ? [80, 96, 112][Math.floor(r() * 3)] : clamp(cross + (r() - .5) * err, POST_L + 2, POST_R - 2);
        const delay = (penalty ? 120 : 150 + 60 * combo + (oneTouch ? 120 : 0)) / dStrength;
        const ice = me2 && penalty && PS.perks.includes('pens');
        setTimeout(() => (dive = { x: guess, speed: (penalty ? 95 : 80) * dStrength * (ice ? .75 : 1) }), delay * (ice ? 1.7 : 1));
      } else SFX.pass();
    };
    // input: drag from your player = dribble, drag elsewhere = pass/shoot, tap your player = skill move
    cv.onpointerdown = e => {
      if (carrier == null || over) return;
      const p = toPix(cv, e), cp = cpos(); downAt = performance.now(); downPos = p;
      if (!penalty && kind !== 'freekick' && Math.hypot(p.x - cp.x, p.y - (cp.y - 4)) < 18) { mode = 'drib'; drib = p; } else { mode = 'aim'; aim = p; }
      cv.setPointerCapture(e.pointerId);
    };
    cv.onpointermove = e => { const p = toPix(cv, e); if (mode === 'drib') drib = p; else if (mode === 'aim') aim = p; };
    cv.onpointerup = e => {
      const p = toPix(cv, e), quick = performance.now() - downAt < 200 && Math.hypot(p.x - downPos.x, p.y - downPos.y) < 5;
      if (mode === 'drib' && quick) skill();
      else if (mode === 'aim') kick(p.x, p.y);
      mode = null; aim = null; drib = null;
    };
    cv.onpointercancel = () => { mode = null; aim = null; drib = null; };
    // phone controller: right pad aims on a mini pitch, left stick dribbles
    if (!live) PAD.onAim = (ph, x, y) => {
      const p = { x: x * W, y: y * H };
      if (ph === 'down') { if (carrier == null || over) return; mode = 'aim'; aim = p; downAt = performance.now(); downPos = p; }
      else if (ph === 'move') { if (mode === 'aim') aim = p; }
      else if (ph === 'up') { if (mode === 'aim' && carrier != null) { kick(p.x, p.y); padBuzz([30]); } mode = null; aim = null; }
    };
    if (!live) PAD.onSkill = () => { if (!penalty && kind !== 'freekick') { skill(); padBuzz([20, 30, 20]); } };
    let lastPos = 0;
    const onKey = e => { if (/^(Arrow|Key[WASD])/.test(e.code)) { e.type === 'keydown' ? keys.add(e.code) : keys.delete(e.code); e.preventDefault(); } if (e.type === 'keydown' && e.code === 'Space' && carrier != null) { e.preventDefault(); kick(96 + (r() - .5) * 30, GL - 2); } };
    window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKey);
    function skill() {
      if (carrier == null || boost > 0) return;
      const me2 = isYou(carrier); if (me2) S.skills++;
      boost = me2 ? .5 + PS.drib / 200 + (PS.perks.includes('magic') ? .25 : 0) : .7; blip(1200, .05); blip(1500, .05);
      const cp = cpos(); let beat = 0;
      def.forEach(d => { if (Math.hypot(d.x - cp.x, d.y - cp.y) < 22) { d.stun = me2 ? .6 + PS.drib / 100 + (PS.perks.includes('magic') ? .6 : 0) : 1; beat++; } });
      pop(beat ? ['STEPOVER!', 'ELASTICO!', 'RAINBOW!', 'NUTMEG!'][Math.floor(r() * 4)] : 'BURST!', cp.x, cp.y - 14);
    }

    function update(dt) {
      t += dt; boost = Math.max(0, boost - dt);
      if (!penalty && t > limit && !over && carrier != null) end('timeout');
      const freeBall = carrier == null && !over;
      // who should go and meet a loose pass: the attacker nearest to where it will stop
      if (freeBall && !lastKick?.shot) {
        const stop = { x: ball.x + ball.vx / 1.15, y: ball.y + ball.vy / 1.15 };
        receiver = atk.reduce((b, a, i) => (i === lastKick?.by && t - lastKick.t < .35) ? b : (b < 0 || Math.hypot(a.x - stop.x, a.y - stop.y) < Math.hypot(atk[b].x - stop.x, atk[b].y - stop.y) ? i : b), -1);
      } else receiver = -1;
      atk.forEach((a, i) => {
        a.moving = false;
        if (penalty) return;
        if (i === carrier) {
          let vx = 0, vy = 0;
          const stick = !live && Math.hypot(PAD.sx, PAD.sy) > .2;
          const kx = stick ? PAD.sx : (keys.has('ArrowRight') || keys.has('KeyD')) - (keys.has('ArrowLeft') || keys.has('KeyA')), ky = stick ? PAD.sy : (keys.has('ArrowDown') || keys.has('KeyS')) - (keys.has('ArrowUp') || keys.has('KeyW'));
          if (kind === 'freekick') { ball.x = a.x + 1; ball.y = a.y - 4; return; }
          const sp = (mode === 'drib' || kx || ky ? 36 : 17) * strength * (boost ? 1.8 : 1) * (isYou(i) ? PS.pace : 1);
          if (mode === 'drib' && drib) { const dx = drib.x - a.x, dy = drib.y + 4 - a.y, d = Math.hypot(dx, dy); if (d > 2) { vx = dx / d; vy = dy / d; } }
          else if (kx || ky) { const d = Math.hypot(kx, ky), m = stick ? Math.min(1, d) : 1; vx = kx / d * m; vy = ky / d * m; }
          else { const pr = def.reduce((b, d) => Math.hypot(d.x - a.x, d.y - a.y) < Math.hypot(b.x - a.x, b.y - a.y) ? d : b, def[0]); vx = (Math.sign(a.x - pr.x) || 1) * .35; vy = -1; }
          a.x = clamp(a.x + vx * sp * dt, 8, W - 8); a.y = clamp(a.y + vy * sp * dt, GL + 10, H - 6); a.moving = vx || vy;
          ball.x = a.x + 1; ball.y = a.y - 4;
        } else if (i === receiver) {
          // sprint onto the pass
          const lead = { x: ball.x + ball.vx * .2, y: ball.y + ball.vy * .2 + 3 }, d = Math.hypot(lead.x - a.x, lead.y - a.y) || 1, sp = 44 * strength;
          a.x += (lead.x - a.x) / d * Math.min(d, sp * dt); a.y += (lead.y - a.y) / d * Math.min(d, sp * dt); a.moving = true;
        } else if (a.run) {
          if (Math.hypot(a.tx - a.x, a.ty - a.y) < 3) { a.tx = clamp(a.x + (r() - .5) * 60, 26, W - 26); a.ty = clamp(GL + 22 + r() * 60, GL + 18, 140); }
          const d = Math.hypot(a.tx - a.x, a.ty - a.y) || 1, sp = 24 * strength;
          a.x += (a.tx - a.x) / d * sp * dt; a.y += (a.ty - a.y) / d * sp * dt; a.moving = true;
        }
      });
      // defenders: mark, press, tackle; a skill move leaves them stumbling
      const target = carrier != null ? atk[carrier] : ball;
      const presser = def.reduce((b, d, i) => d.stun > 0 ? b : (b < 0 || Math.hypot(d.x - target.x, d.y - target.y) < Math.hypot(def[b].x - target.x, def[b].y - target.y) ? i : b), -1);
      def.forEach((d, i) => {
        if (d.stun > 0) { d.stun -= dt; d.moving = false; return; }
        if (d.wall) { d.moving = false; return; }
        let tx, ty, sp;
        if (i === presser) { tx = target.x; ty = target.y - 2; sp = 28 * dStrength; }
        else { const m = atk[(i + 1) % atk.length]; tx = m.x + (96 - m.x) * .25; ty = m.y - 10; sp = 22 * dStrength; }
        const dd = Math.hypot(tx - d.x, ty - d.y) || 1, step = Math.min(dd, sp * dt);
        d.x += (tx - d.x) / dd * step; d.y += (ty - d.y) / dd * step; d.moving = step > .05;
        if (carrier != null && i === presser) {
          const close = Math.hypot(d.x - atk[carrier].x, d.y - atk[carrier].y) < 5;
          d.contact = close ? d.contact + dt : 0;
          if (d.contact > .22) {
            if (boost > 0) { d.stun = 1; d.contact = 0; pop('NUTMEG!', atk[carrier].x, atk[carrier].y - 14); blip(1400, .05); }
            else if (r() < .7 * (isYou(carrier) ? clamp(1.4 - PS.drib / 110, .4, 1.1) : 1)) end('tackled'); else { d.stun = .6; d.contact = 0; pop('SHRUGS HIM OFF!', atk[carrier].x, atk[carrier].y - 14, '#FFFFFF'); }
          }
        }
      });
      if (live) {
        const dx = live.keeperX - keeper.x;
        keeper.x += clamp(dx, -82 * dt, 82 * dt);
        keeper.moving = Math.abs(dx) > .5;
      } else if (dive) { const dd = dive.x - keeper.x; keeper.x += Math.sign(dd) * Math.min(Math.abs(dd), dive.speed * dt); }
      else { const tx = clamp(ball.x, POST_L + 6, POST_R - 6); keeper.x += Math.sign(tx - keeper.x) * Math.min(Math.abs(tx - keeper.x), 30 * dt); }
      if (freeBall) {
        ball.x += ball.vx * dt; ball.y += ball.vy * dt;
        const f = Math.exp(-1.15 * dt); ball.vx *= f; ball.vy *= f;
        const sp = Math.hypot(ball.vx, ball.vy);
        if (lastKick?.shot) trail.push({ x: ball.x, y: ball.y, a: 1 });
        if (!penalty) {
          atk.forEach((a, i) => {
            if (carrier != null || (i === lastKick?.by && t - lastKick.t < .4)) return;
            if (Math.hypot(a.x - ball.x, a.y - 3 - ball.y) < 9 && sp < (lastKick?.shot ? 70 : 230)) {
              carrier = i; ball.vx = ball.vy = 0; dive = null; gotAt = t; a.from = lastKick?.by; if (isYou(i)) S.touches++;
              if (!lastKick?.shot && i !== lastKick?.by) { combo++; if (combo >= 2) pop(`PASS x${combo}`, a.x, a.y - 14); blip(520 + combo * 120, .04); }
            }
          });
          def.forEach((d, i) => { if (carrier != null || d.stun > 0 || touched.has(i) || Math.hypot(d.x - ball.x, d.y - 4 - ball.y) > 5.5) return; touched.add(i); if (d.wall ? r() < (lastKick && isYou(lastKick.by) && PS.perks.includes('fk') ? .4 : .8) : r() < (sp < 90 ? .75 : sp < 150 ? .45 : .2) * dStrength * (lastKick?.shot ? 1 : lastKick?.pm || 1)) { end(d.wall ? 'wall' : 'intercepted'); } else pop(d.wall ? 'OVER THE WALL!' : 'JUST MISSED IT', d.x, d.y - 14, '#FFFFFF'); });
          if (sp < 14 && carrier == null) end('loose');
        }
        if (carrier == null) {
          if (ball.y <= keeper.y + 2 && ball.y > GL - 4 && Math.abs(keeper.x - ball.x) < (live || dive ? 8 : 6)) { ball.vy = Math.abs(ball.vy) * .5; ball.vx *= -.4; end('saved'); shake = 2; }
          else if (ball.y <= GL) { if (ball.x > POST_L && ball.x < POST_R) { const si = lastKick?.by ?? 0, ai = atk[si].from; end('goal', atk[si].name); over.you = isYou(si); over.assist = ai != null && ai !== si ? atk[ai].name : null; over.assistYou = ai != null && ai !== si && isYou(ai); shake = 6; } else end('wide'); }
          else if (ball.x < 0 || ball.x > W || ball.y > H) end('wide');
          else if (penalty && sp < 20) end('saved');
        }
      }
      pops.forEach(p => (p.t += dt));
      shake = Math.max(0, shake - dt * 12);
    }
    let trail = [];
    function draw(now) {
      c.save();
      if (shake > 0) c.translate(Math.round((Math.random() - .5) * shake), Math.round((Math.random() - .5) * shake));
      drawPitch(c, false);
      trail = trail.filter(p => (p.a -= .06) > 0);
      trail.forEach(p => { c.fillStyle = `rgba(255,255,255,${p.a * .7})`; c.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); });
      def.forEach(d => { drawMan(c, d, colD, false, SKINS[2], false, now / 1000); if (d.stun > 0) { c.fillStyle = '#FFE27A'; const a = now / 120; c.fillRect(Math.round(d.x + Math.cos(a) * 4), Math.round(d.y - 13 + Math.sin(a)), 1, 1); c.fillRect(Math.round(d.x - Math.cos(a) * 4), Math.round(d.y - 13 - Math.sin(a)), 1, 1); } });
      drawMan(c, keeper, gkCol(colA, colD), false, SKINS[1], false, now / 1000);
      atk.forEach((a, i) => {
        drawMan(c, a, colA, false, a.you ? SKINS[pro.skin] : SKINS[(i * 2 + 1) % 5], i === carrier || i === receiver, now / 1000);
        if (a.you) { c.font = '7px monospace'; c.fillStyle = '#14162B'; c.fillText('YOU', Math.round(a.x) - 5, Math.round(a.y) - 15); c.fillStyle = '#FFD23F'; c.fillText('YOU', Math.round(a.x) - 6, Math.round(a.y) - 16); }
      });
      if (boost > 0 && carrier != null) { const cp = cpos(); c.fillStyle = 'rgba(255,226,122,.5)'; c.fillRect(Math.round(cp.x) - 6, Math.round(cp.y) + 2, 3, 1); c.fillRect(Math.round(cp.x) - 7, Math.round(cp.y) - 1, 2, 1); }
      if (mode === 'aim' && aim && carrier != null) {
        const dx = aim.x - ball.x, dy = aim.y - ball.y, n = Math.floor(Math.hypot(dx, dy) / 5), shot = aim.y < GL + 14;
        c.fillStyle = shot ? '#FFD23F' : '#FFFFFF';
        for (let k = 1; k < n; k++) if (k % 2) c.fillRect(Math.round(ball.x + dx * k / n) - 1, Math.round(ball.y + dy * k / n) - 1, 2, 2);
        const ax = Math.round(aim.x), ay = Math.round(aim.y);
        c.fillRect(ax - 4, ay, 3, 1); c.fillRect(ax + 2, ay, 3, 1); c.fillRect(ax, ay - 4, 1, 3); c.fillRect(ax, ay + 2, 1, 3);
        c.font = '8px monospace'; c.fillText(shot ? 'SHOOT' : 'PASS', ax + 6, ay - 3);
      }
      if (mode === 'drib' && drib) { c.fillStyle = 'rgba(255,255,255,.6)'; c.fillRect(Math.round(drib.x) - 1, Math.round(drib.y) - 1, 3, 3); }
      c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(Math.round(ball.x) - 1, Math.round(ball.y) + 2, 3, 1);
      c.fillStyle = '#fff'; c.fillRect(Math.round(ball.x) - 1, Math.round(ball.y) - 1, 2, 2);
      c.font = '8px monospace';
      pops.filter(p => p.t < 1.1).forEach(p => { c.fillStyle = '#14162B'; c.fillText(p.txt, Math.round(p.x - p.txt.length * 2.4) + 1, Math.round(p.y - p.t * 14) + 1); c.fillStyle = p.col; c.fillText(p.txt, Math.round(p.x - p.txt.length * 2.4), Math.round(p.y - p.t * 14)); });
      c.restore();
      if (!penalty) { c.fillStyle = 'rgba(0,0,0,.4)'; c.fillRect(0, H - 3, W, 3); c.fillStyle = t > limit - 2.5 ? '#FF5252' : '#FFD23F'; c.fillRect(0, H - 3, W * Math.max(0, 1 - t / limit), 3); }
      if (combo >= 2) { c.fillStyle = '#FFD23F'; c.font = '8px monospace'; c.fillText(`COMBO x${combo}`, W - 52, H - 7); }
      if (mode === 'aim' && !live) { c.fillStyle = 'rgba(20,22,43,.22)'; c.fillRect(0, 0, W, H); c.fillStyle = '#FFD23F'; c.fillText('SLOW-MO', 4, H - 7); }
    }
    const finish = () => {
      cv.onpointerdown = cv.onpointermove = cv.onpointerup = cv.onpointercancel = null;
      if (!live) { PAD.onAim = PAD.onSkill = null; padMode('menu', 'Press A to continue'); }
      window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey);
      res(over);
    };
    let lastLiveFrame = -Infinity;
    function frame(now) {
      if ((live || deadline !== Infinity) && !cv.isConnected) return finish();
      if (!over && Date.now() >= deadline) {
        if (!live) return finish();
        end('timeout');
      }
      const dt = Math.min(.05, (now - last) / 1000); last = now;
      if (!over || (!live && now - over.shown < 1100)) update(dt * (!live && mode === 'aim' ? .25 : 1));
      draw(now);
      if (live && (now - lastLiveFrame >= 40 || (over && !over.shown))) {
        lastLiveFrame = now;
        const player = p => [Math.round(p.x), Math.round(p.y), !!p.moving];
        live.publish({ a: atk.map(player), d: def.map(player), k: player(keeper), b: [Math.round(ball.x), Math.round(ball.y)], carrier, receiver, time: Math.max(0, Math.ceil(limit - t)) });
      }
      if (!live && PAD.connected) {
        padMode('attack', over ? '' : carrier == null ? 'Ball moving…' : penalty ? 'PENALTY: touch the goal where you want it' : kind === 'freekick' ? 'FREE KICK: touch where to curl it' : 'Left: run · Right: touch where to pass/shoot');
        if (now - lastPos > 66) { lastPos = now; const q = v => Math.round(v * 10) / 10; padSend({ t: 'pos', b: [q(ball.x), q(ball.y)], a: atk.map((a, i) => [q(a.x), q(a.y), i === carrier ? 2 : a.you ? 1 : 0]), d: def.map(d => [q(d.x), q(d.y)]), k: [q(keeper.x), q(keeper.y)], aim: mode === 'aim' && aim ? [q(aim.x), q(aim.y)] : null }); }
      }
      $('#hint').textContent = over ? '' : carrier != null ? (penalty || kind === 'freekick' ? (kind === 'freekick' ? 'FREE KICK! DRAG TO AIM. GET IT PAST THE WALL' : 'DRAG TO AIM, RELEASE TO SHOOT') : kind === 'solo' ? '1 ON 1! DRAG TO DRIBBLE, DRAG AWAY TO SHOOT' : `${surname(atk[carrier].name)}: DRAG HIM TO DRIBBLE · DRAG AWAY TO PASS/SHOOT · TAP HIM = SKILL`) : '…';
      if (over && !over.shown) over.shown = now;
      if (over && now - over.shown > 1100) return finish();
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
}

// They shoot at your goal: tap where to dive. Your goal is at the bottom.
function saveChance({ me, opp, penalty = false }) {
  return new Promise(res => {
    const { cv, c } = setupCanvas();
    const dStrength = clamp(1 + (ELO[opp] - ELO[me]) / 1800, .82, 1.2), kStrength = clamp(1 + (ELO[me] - ELO[opp]) / 2400, .88, 1.12);
    const colA = colour(opp), r = Math.random;
    const shooter = penalty ? { x: 96, y: GL + 42 } : { x: 50 + r() * 92, y: GL + 34 + r() * 40 };
    const keeper = { x: 96, y: GL + 5 }; let ktx = 96;
    const others = penalty ? [] : [{ x: shooter.x + 30 * (shooter.x < 96 ? 1 : -1), y: shooter.y + 20 }, { x: 96 + (r() - .5) * 40, y: shooter.y + 40 }];
    let t = 0, ball = { x: shooter.x + 1, y: shooter.y - 6, vx: 0, vy: 0 }, shot = false, over = null, last = performance.now(), raf = 0;
    const windup = penalty ? 1.1 : .75 + r() * .5;
    cv.onpointerdown = e => { const p = toPix(cv, e); ktx = clamp(p.x, POST_L - 4, POST_R + 4); };
    PAD.onAim = (ph, x) => { if (ph !== 'up') ktx = clamp(x * W, POST_L - 4, POST_R + 4); };
    padMode('save', 'THEY’RE SHOOTING! Touch left or right to dive');
    function update(dt) {
      t += dt;
      if (!shot && t > windup) {
        shot = true; SFX.kick();
        // a good finisher shoots away from where your keeper is leaning
        const lean = keeper.x - 96, side = Math.abs(lean) > 4 && r() < .7 ? -Math.sign(lean) : (r() < .5 ? -1 : 1);
        const tx = 96 + side * (8 + r() * 13), ty = GL - 2, dx = tx - ball.x, dy = ty - ball.y, d = Math.hypot(dx, dy), sp = (penalty ? 175 : 150 + r() * 40) * dStrength;
        ball.vx = dx / d * sp; ball.vy = dy / d * sp;
      }
      if (Math.abs(PAD.sx) > .3) ktx = clamp(96 + PAD.sx * 26, POST_L - 4, POST_R + 4);
      const dd = ktx - keeper.x; keeper.x += Math.sign(dd) * Math.min(Math.abs(dd), 92 * kStrength * dt);
      if (shot && !over) {
        ball.x += ball.vx * dt; ball.y += ball.vy * dt;
        if (ball.y <= keeper.y + 2 && Math.abs(keeper.x - ball.x) < 8) { ball.vy *= -.4; ball.vx *= -.5; over = { result: 'saved' }; SFX.save(); }
        else if (ball.y <= GL) over = { result: ball.x > POST_L && ball.x < POST_R ? 'goal' : 'wide' };
      } else if (over) { ball.x += ball.vx * dt; ball.y += ball.vy * dt; }
    }
    function draw(now) {
      // drawn flipped: your goal at the bottom of the screen
      c.save(); c.translate(0, H); c.scale(1, -1);
      drawPitch(c, false);
      c.restore();
      const flipP = p => ({ x: p.x, y: H - p.y + 4, moving: p.moving });
      others.forEach(o => drawMan(c, flipP(o), colA, false, SKINS[3], false, now / 1000));
      drawMan(c, flipP(shooter), colA, false, SKINS[2], !shot, now / 1000);
      drawMan(c, flipP(keeper), gkCol(colA, colour(me)), false, SKINS[1], false, now / 1000);
      c.fillStyle = '#fff'; c.fillRect(Math.round(ball.x) - 1, Math.round(H - ball.y) - 1, 2, 2);
      if (!shot) { c.fillStyle = '#FF5252'; c.fillRect(Math.round(shooter.x), Math.round(H - shooter.y) - 8, 1, 3); c.fillRect(Math.round(shooter.x), Math.round(H - shooter.y) - 4, 1, 1); }
    }
    function frame(now) {
      const dt = Math.min(.05, (now - last) / 1000); last = now;
      update(dt); draw(now);
      $('#hint').textContent = over ? '' : 'TAP WHERE TO DIVE!';
      if (over) { over.shown ??= now; if (now - over.shown > 1000) { cancelAnimationFrame(raf); cv.onpointerdown = null; PAD.onAim = null; padMode('menu', 'Press A to continue'); return res(over); } }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
  });
}

// ---------- a match: your chances and theirs, the rest simulated ----------
function matchScreen(me, opp, f) {
  const a = f.t1, b = f.t2;
  render(`<section class="amatch">
    <div class="board">
      <div class="side" style="${kit(a)}"><b>${code(a)}</b></div>
      <div class="score"><b id="s0">0</b><i>-</i><b id="s1">0</b><span id="clock">0'</span></div>
      <div class="side away" style="${kit(b)}"><b>${code(b)}</b></div>
    </div>
    <div class="arena"><canvas id="cv" aria-label="Match moment. Drag to pass or shoot, tap to dive."></canvas><div class="banner" id="banner"></div></div>
    <p class="hint" id="hint"></p>
    <ol class="feed" id="feed"></ol>
  </section>`);
}
function banner(big, small = '', cls = '') { padFx(`${big} ${small}`, cls); if (cls === 'bad') padBuzz([140]); const el = $('#banner'); if (!el) return; el.className = 'banner on ' + cls; el.innerHTML = `<b>${big}</b><span>${small}</span>`; }
function hideBanner() { const el = $('#banner'); if (el) el.className = 'banner'; }
const feed = (html, team) => { const li = document.createElement('li'); li.innerHTML = html; if (team) li.style.cssText = kit(team); $('#feed').prepend(li); };
async function tickClock(from, to) { for (let m = from; m <= to; m += 2) { $('#clock').textContent = Math.min(m, to) + "'"; await wait(28); } $('#clock').textContent = to + "'"; }
// a static pitch between moments, so the arena never looks empty
function idlePitch() { const { c } = setupCanvas(); drawPitch(c, false); }

async function playMatch(f) {
  const me = R.team, u = f.t1 === me ? 0 : 1, opp = u ? f.t1 : f.t2, score = [0, 0], goals = [];
  matchScreen(me, opp, f); idlePitch();
  const diff = ELO[me] - ELO[opp];
  const nMe = clamp(Math.round(5 + diff / 170), 3, 7), nOpp = clamp(Math.round(4 - diff / 170), 2, 7);
  const pOpp = clamp(.22 - diff / 1300, .08, .42);
  const r = Math.random, mins = n => Array.from({ length: n }, () => 3 + Math.floor(r() * 86));
  const timeline = [...mins(nMe).map(m => ({ m, side: u, play: true })), ...mins(nOpp).map(m => ({ m, side: 1 - u, play: r() < .45 }))].sort((x, y) => x.m - y.m);
  banner(`${code(f.t1)} V ${code(f.t2)}`, `${stageName(f)} · ${esc(VENUES[f.ground]?.stadium || '')}`); Audio.setLevel(1); SFX.whistle(1); await wait(1600); hideBanner();
  let clock = 0;
  const addGoal = (side, name, min) => { score[side]++; goals.push({ side, name, min }); $('#s' + side).textContent = score[side]; };
  async function moment(ev) {
    await tickClock(clock, ev.m); clock = ev.m;
    if (ev.side === u) {
      banner(`${ev.m}'`, 'YOUR CHANCE!'); jingle([660, 880], 70); await wait(900); hideBanner();
      const out = await attackChance({ me, opp });
      if (out.result === 'goal') { addGoal(u, out.scorer, ev.m); flash(out.combo >= 3 ? 'TEAM GOAL!' : 'GOAL!', `${esc(out.scorer)} ${ev.m}'${out.combo >= 2 ? ` · ${out.combo} PASSES` : ''}`, me); SFX.goal(); Audio.roar(1, 4); feed(`<b>${ev.m}'</b> GOAL! ${esc(out.scorer)}`, me); await wait(1600); }
      else { const txt = { saved: 'SAVED!', tackled: 'TACKLED!', wide: 'WIDE!', intercepted: 'CUT OUT!', loose: 'LOST IT!', timeout: 'TOO SLOW!' }[out.result]; banner(txt, '', 'bad'); feed(`<b>${ev.m}'</b> ${txt} Chance gone.`); Audio.roar(.4, 2); await wait(900); hideBanner(); }
    } else if (ev.play) {
      banner(`${ev.m}'`, `${esc(opp).toUpperCase()} BREAK THROUGH! TAP TO DIVE`, 'bad'); jingle([880, 660], 70); await wait(900); hideBanner();
      const out = await saveChance({ me, opp });
      const name = names(opp)[Math.floor(r() * 3)];
      if (out.result === 'goal') { addGoal(1 - u, name, ev.m); flash('GOAL', `${esc(name)} ${ev.m}'`, opp); SFX.lose(); feed(`<b>${ev.m}'</b> ${code(opp)} score. ${esc(name)}.`, opp); await wait(1400); }
      else { banner(out.result === 'saved' ? 'WHAT A SAVE!' : 'OFF TARGET!'); Audio.roar(1, 3); feed(`<b>${ev.m}'</b> ${out.result === 'saved' ? 'Huge save!' : `${esc(name)} misses.`}`, me); await wait(1000); hideBanner(); }
    } else {
      const scored = r() < pOpp, name = names(opp)[Math.floor(r() * 3)];
      if (scored) { addGoal(1 - u, name, ev.m); flash('GOAL', `${esc(name)} ${ev.m}'`, opp); SFX.lose(); feed(`<b>${ev.m}'</b> ${code(opp)} score. ${esc(name)}.`, opp); await wait(1300); }
      else feed(`<b>${ev.m}'</b> ${code(opp)} attack... ${['your defence holds', 'over the bar', 'your keeper gathers', 'blocked'][Math.floor(r() * 4)]}.`);
    }
    idlePitch();
  }
  for (const ev of timeline.filter(e => e.m <= 45)) await moment(ev);
  await tickClock(clock, 45); clock = 45; banner('HALF TIME', `${code(f.t1)} ${score[0]}-${score[1]} ${code(f.t2)}`); SFX.whistle(2); await wait(1600); hideBanner();
  for (const ev of timeline.filter(e => e.m > 45)) await moment(ev);
  await tickClock(clock, 90); clock = 90;
  const ft = score.slice(); let et = null, p = null;
  if (f.ko && ft[0] === ft[1]) {
    banner('EXTRA TIME', `${ft[0]}-${ft[1]} after 90`); SFX.whistle(2); await wait(1600); hideBanner();
    for (const ev of [{ m: 96 + Math.floor(r() * 10), side: u, play: true }, { m: 108 + Math.floor(r() * 10), side: 1 - u, play: true }].sort((x, y) => x.m - y.m)) await moment(ev);
    await tickClock(clock, 120); et = score.slice();
    if (et[0] === et[1]) p = await shootout(me, opp, u);
  }
  SFX.whistle(3);
  const fin = et || ft, gf = fin[u], ga = fin[1 - u];
  const m = { num: f.num, stage: E.STAGE_OF(f.num), group: REAL.find(x => x.num === f.num)?.group || null, date: f.date, ground: f.ground, t1: f.t1, t2: f.t2, ft, et, p,
    goals1: goals.filter(g => g.side === 0).map(g => ({ name: g.name, minute: String(g.min) })), goals2: goals.filter(g => g.side === 1).map(g => ({ name: g.name, minute: String(g.min) })) };
  R.over[f.num] = m;
  const res = f.ko ? (E.winnerOf(m) === me ? 'W' : 'L') : gf > ga ? 'W' : gf < ga ? 'L' : 'D';
  R.log.push({ num: f.num, stage: E.STAGE_OF(f.num), opp, gf, ga, res, pens: p ? [p[u], p[1 - u]] : null });
  goals.filter(g => g.side === u).forEach(g => (R.goals[g.name] = (R.goals[g.name] || 0) + 1));
  save();
  resultScreen(m, res, me, opp);
}

async function shootout(me, opp, u) {
  const s = [0, 0], kicks = [[], []], nm = names(me), on = names(opp);
  banner('PENALTIES!', 'Drag to shoot. Tap to dive.'); SFX.whistle(3); await wait(1800); hideBanner();
  for (let k = 0; k < 30; k++) {
    const side = k % 2 === 0 ? u : 1 - u; let goal;
    $('#hint').textContent = `PENS ${code(me)} ${s[u]}-${s[1 - u]} ${code(opp)}`;
    if (side === u) { banner(`${surname(nm[Math.floor(k / 2) % 4])} STEPS UP`); await wait(700); hideBanner(); goal = (await attackChance({ me, opp, penalty: true })).result === 'goal'; }
    else { banner(`${surname(on[Math.floor(k / 2) % 4])} FOR ${code(opp)}`, 'TAP TO DIVE', 'bad'); await wait(700); hideBanner(); goal = (await saveChance({ me, opp, penalty: true })).result === 'goal'; }
    if (goal) s[side]++; kicks[side].push(goal);
    banner(goal ? 'SCORED' : side === u ? 'MISSED!' : 'SAVED!', `${code(me)} ${s[u]}-${s[1 - u]} ${code(opp)}`, goal === (side === u) ? '' : 'bad'); await wait(900); hideBanner();
    const t = k + 1, left = [5 - Math.ceil(t / 2), 5 - Math.floor(t / 2)].map(x => Math.max(0, x)); // left[0] = first kicker’s remaining
    const first = u, a = s[first], b = s[1 - first];
    if (t <= 10 && (a > b + left[1] || b > a + left[0])) break;
    if (t >= 10 && t % 2 === 0 && a !== b) break;
  }
  return s;
}

function resultScreen(m, res, me, opp) {
  const s = m.et || m.ft;
  if (res === 'W') { confetti(); jingle([392, 523, 659, 784, 1047], 110); } else if (res === 'L') SFX.lose();
  $('#hint').textContent = '';
  const list = side => (side ? m.goals2 : m.goals1).map(g => `<li>${esc(g.name)} ${g.minute}'</li>`).join('') || '<li class="dim">—</li>';
  app.querySelector('.amatch').insertAdjacentHTML('beforeend', `<div class="box result ${res}">
    <h3>${res === 'W' ? 'WIN!' : res === 'D' ? 'DRAW' : 'LOSS'}</h3>
    <p class="big">${code(m.t1)} ${s[0]}-${s[1]} ${code(m.t2)}${m.p ? ` <small>PENS ${m.p[0]}-${m.p[1]}</small>` : ''}</p>
    <div class="scorers"><ul>${list(0)}</ul><ul>${list(1)}</ul></div>
    <div class="menu row"><button class="btn big y" id="cont">CONTINUE ▶</button></div></div>`);
  app.querySelector('.result').scrollIntoView({ behavior: 'smooth', block: 'center' });
  $('#cont').onclick = () => { Audio.setLevel(.25); hubScreen(); };
}

function endScreen() {
  const me = R.team, f = R.finish ?? 0, real = REALFINISH[me];
  const top = Object.entries(R.goals).sort((a, b) => b[1] - a[1])[0];
  const emoji = R.log.map(l => l.res === 'W' ? '🟩' : l.res === 'D' ? '🟨' : '🟥').join('');
  if (f === 7) setTimeout(confetti, 300);
  render(`<section class="end" style="${kit(me)}">
    ${f === 7 ? '<div class="trophy" aria-hidden="true"></div>' : ''}
    <p class="lbl">${esc(me).toUpperCase()} · GOAL RUSH ’26</p>
    <h1 class="finish">${FINISH[f]}</h1>
    <p class="vs-real">REAL ${esc(me).toUpperCase()}: <b>${FINISH[real]}</b> · ${f > real ? '<span class="up">YOU BEAT HISTORY!</span>' : f === real ? 'HISTORY REPEATS' : 'HISTORY WINS'}</p>
    ${top ? `<p class="small">YOUR TOP SCORER: <b>${esc(top[0])}</b> (${top[1]})</p>` : ''}
    <div class="emoji">${emoji}</div>
    <ol class="games">${R.log.map(l => `<li class="${l.res}"><span>${l.stage === 'G' ? 'GROUP' : E.STAGE_NAMES[l.stage].toUpperCase()}</span><b>${code(me)} ${l.gf}-${l.ga} ${code(l.opp)}</b>${l.pens ? `<em>PENS ${l.pens[0]}-${l.pens[1]}</em>` : ''}</li>`).join('')}</ol>
    ${R.champ ? `<p class="small">CHAMPIONS IN YOUR WORLD: <b>${esc(R.champ).toUpperCase()}</b></p>` : ''}
    <div class="menu row"><button class="btn big y" id="again">PLAY AGAIN ▶</button><button class="btn" id="share">COPY RESULT</button></div>
  </section>`);
  $('#again').onclick = () => { store.del('ft-arcade'); R = null; location.hash = ''; pickTeam(); };
  $('#share').onclick = () => navigator.clipboard?.writeText(`GOAL RUSH ’26 ⚽ ${me}: ${FINISH[f]} (real: ${FINISH[real]})\n${emoji}`).then(() => toast('COPIED!'));
}

// =============================================================
//  BE A PRO: a whole career. World Cup 2026 is your big break,
//  then club seasons, transfers, more World Cups and retirement.
//  New Star Soccer-style choices off the pitch, Goal Rush on it.
// =============================================================
let PRO = null;
const PRO_SAVED = () => { const p = store.get('ft-pro'); return p && !p.done; };
const psave = () => PRO && store.set('ft-pro', PRO);
const POS = {
  ST: { name: 'STRIKER', tip: 'Lives in the box. Big shot, more 1-on-1s.', base: { pace: 60, shoot: 67, pass: 51, dribble: 57 } },
  WG: { name: 'WINGER', tip: 'Fast and tricky. Loves a counter-attack.', base: { pace: 69, shoot: 56, pass: 55, dribble: 65 } },
  PM: { name: 'PLAYMAKER', tip: 'Runs the game. Takes the free kicks.', base: { pace: 55, shoot: 55, pass: 69, dribble: 62 } }
};
const STATN = { pace: 'PACE', shoot: 'SHOOTING', pass: 'PASSING', dribble: 'DRIBBLING' };
const CELEBS = ['KNEE SLIDE', 'THE ROBOT', 'BACKFLIP', 'SHUSH THE CROWD', 'AIRPLANE', 'CORNER FLAG DANCE', 'HEART HANDS'];
const ovr = p => Math.round((p.stats.pace + p.stats.shoot + p.stats.pass + p.stats.dribble) / 4);
const fmtK = n => n >= 1e9 ? (n / 1e9).toFixed(1) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(Math.round(n));
const cash = n => '$' + fmtK(n);
// fan growth slows down as you get famous, and tops out around the real-world biggest stars
const growFans = g => { PRO.followers = Math.min(6e8, Math.round(PRO.followers * (1 + g * Math.max(.04, 1 - Math.log10(PRO.followers + 10) / 9)))); };
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const ORD = n => n + (['TH', 'ST', 'ND', 'RD'][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10] || 'TH');

// perks: pick one every 5 levels
const PERKS = {
  clinical: { name: 'CLINICAL', tip: 'Keepers read your shots worse' },
  speed: { name: 'SPEEDSTER', tip: '+12% sprint speed' },
  magic: { name: 'MAGICIAN', tip: 'Skill moves leave defenders dizzy for longer' },
  fk: { name: 'DEAD-BALL KING', tip: 'Your free kicks clear the wall far more often' },
  pens: { name: 'ICE COLD', tip: 'Keepers dive late on your penalties' },
  engine: { name: 'ENGINE', tip: 'Matches drain half the energy' },
  poacher: { name: 'POACHER', tip: 'More 1-on-1 chances fall to you' },
  captain: { name: 'CAPTAIN', tip: 'Trust rises 50% faster' },
  fans: { name: 'FAN FAVOURITE', tip: 'Fans grow 50% faster' },
  late: { name: 'CLUTCH', tip: 'Way more last-minute chances when it matters' }
};
const has = k => !!PRO?.perks?.includes(k);
const proArg = () => ({ name: PRO.name, pos: PRO.pos, skin: PRO.skin, energy: PRO.energy, perks: PRO.perks || [], ...PRO.stats });

// the manager sets you a target every match
const OBJ = [
  { txt: 'SCORE A GOAL', ok: s => s.goals >= 1 },
  { txt: 'GET AN ASSIST', ok: s => s.assists >= 1 },
  { txt: 'RATING OF 7.0 OR MORE', ok: (s, r) => r >= 7 },
  { txt: '2 GOALS + ASSISTS', ok: s => s.goals + s.assists >= 2 },
  { txt: 'PULL OFF 3 SKILL MOVES', ok: s => s.skills >= 3 },
  { txt: 'WIN THE MATCH', ok: (s, r, res) => res === 'W' }
];

const SHOP = [
  { id: 'boots', name: 'GOLDEN BOOTS', tip: '+3 SHOOTING', cost: 40000, fx: { shoot: 3 } },
  { id: 'spikes', name: 'SPEED BOOTS', tip: '+3 PACE', cost: 40000, fx: { pace: 3 } },
  { id: 'skills', name: 'SKILLS COACH', tip: '+3 DRIBBLING', cost: 60000, fx: { dribble: 3 } },
  { id: 'analyst', name: 'VIDEO ANALYST', tip: '+3 PASSING', cost: 60000, fx: { pass: 3 } },
  { id: 'chef', name: 'PERSONAL CHEF', tip: '+10 energy after every match', cost: 120000 },
  { id: 'trainer', name: 'PERSONAL TRAINER', tip: '+25% XP forever', cost: 250000 },
  { id: 'physio', name: 'PRIVATE PHYSIO', tip: 'Half as many injuries, heal twice as fast', cost: 300000 },
  { id: 'car', name: 'SUPERCAR', tip: 'Fans +20%. Pure flex.', cost: 600000, fx: { followers: .2 } },
  { id: 'mansion', name: 'MANSION', tip: 'Fans +40%. Massive flex.', cost: 2000000, fx: { followers: .4 } },
  { id: 'academy', name: 'YOUR OWN ACADEMY', tip: '+150 legacy score. Give back to your hometown.', cost: 5000000 }
];

// ---------- the club league (fictional clubs) ----------
const CLUBS = [
  ['Northgate City', 'NGC', '#6CB4EE', 2080], ['Kingsfield United', 'KFU', '#D7263D', 2040], ['Atlético Solara', 'ATS', '#E8B10C', 1990],
  ['Port Azure', 'PAZ', '#1F4FA8', 1940], ['Ironbridge FC', 'IRB', '#3A3A3A', 1890], ['Westmoor Wanderers', 'WMW', '#E87722', 1840],
  ['Redcliff Town', 'RCT', '#A3122B', 1790], ['Sunvale Athletic', 'SVA', '#2E9E5B', 1740], ['Old Harbour', 'OHB', '#4B2E83', 1690], ['Rivermouth Rovers', 'RMR', '#00A0A8', 1630]
];
const CLUB_NAMES = CLUBS.map(c => c[0]);
const isClub = t => CLUB_NAMES.includes(t);
function registerClubs() {
  const FN = ['Leo', 'Marco', 'Kofi', 'Yuki', 'Diego', 'Luca', 'Tomás', 'Ibra', 'Sami', 'Rafa', 'Niko', 'Jonas', 'André', 'Mateo', 'Kenji', 'Omar', 'Theo', 'Viktor', 'Enzo', 'Bruno', 'Malik', 'Felix', 'Joao', 'Aleks'];
  const LN = ['Silva', 'Okafor', 'Tanaka', 'Moreau', 'Rossi', 'Novak', 'Hansen', 'Mendes', 'Kowalski', 'Diallo', 'Fischer', 'Costa', 'Ivanov', 'Park', 'Herrera', 'Lindqvist', 'Mensah', 'Duarte', 'Becker', 'Ortega', 'Asante', 'Varga', 'Sato', 'Brandt'];
  const used = new Set(), r = mulberry(4242);
  CLUBS.forEach(([name, c, col, elo]) => {
    NAT[name] = [c, col]; ELO[name] = elo;
    const pl = [];
    while (pl.length < 4) { const n = FN[Math.floor(r() * FN.length)] + ' ' + LN[Math.floor(r() * LN.length)]; if (!used.has(n)) { used.add(n); pl.push({ name: n, goals: 4 - pl.length * .9 }); } }
    // the rest of the squad chips in too, so the stars don't score everything
    ROSTER[name] = [...pl, ...['SQUAD A', 'SQUAD B', 'SQUAD C'].map(() => { let n; do n = FN[Math.floor(r() * FN.length)] + ' ' + LN[Math.floor(r() * LN.length)]; while (used.has(n)); used.add(n); return { name: n, goals: .9 }; })];
    RANK[name] = TEAMS.filter(t => ELO[t] > elo).length + 1;
  });
}
const clubWage = c => Math.max(5000, Math.round((ELO[c] - 1500) / 10) * 1000);
const CUP_R = ['ROUND OF 16', 'QUARTER-FINAL', 'SEMI-FINAL', 'FINAL'];
const PLAN = ['L0', 'L1', 'C0', 'L2', 'L3', 'C1', 'L4', 'L5', 'C2', 'L6', 'L7', 'L8', 'C3'];
function roundRobin(teams) {
  const t = teams.slice(), n = t.length, rounds = [];
  for (let k = 0; k < n - 1; k++) {
    const pr = []; for (let i = 0; i < n / 2; i++) { const a = t[i], b = t[n - 1 - i]; pr.push((k + i) % 2 ? [b, a] : [a, b]); }
    rounds.push(pr); t.splice(1, 0, t.pop());
  }
  return rounds;
}
function addRes(T, a, b, x, y) {
  const A = T[a], B = T[b]; A.p++; B.p++; A.gf += x; A.ga += y; B.gf += y; B.ga += x; A.gd = A.gf - A.ga; B.gd = B.gf - B.ga;
  if (x > y) { A.w++; B.l++; A.pts += 3; } else if (y > x) { B.w++; A.l++; B.pts += 3; } else { A.d++; B.d++; A.pts++; B.pts++; }
}
const leagueRows = S => Object.values(S.table).sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.team.localeCompare(b.team));
const tally = (name, team) => { const sc = PRO.season.sc; (sc[name] ||= { name, team, goals: 0 }).goals++; };
const scorersOf = S => { const l = Object.values(S.sc); if (!S.sc[PRO.name]) l.push({ name: PRO.name, team: S.club, goals: 0 }); return l.sort((a, b) => b.goals - a.goals || (b.name === PRO.name) - (a.name === PRO.name)); };

function newSeason() {
  const year = (PRO.season?.year ?? 2026) + 1;
  const shuffled = CLUB_NAMES.slice().sort(() => Math.random() - .5);
  const table = Object.fromEntries(CLUB_NAMES.map(c => [c, { team: c, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 }]));
  PRO.season = { year, club: PRO.club, rounds: roundRobin(shuffled), idx: 0, table, sc: {}, cup: { alive: true, opp: {}, home: {} }, st: { apps: 0, goals: 0, assists: 0, ratings: [] }, log: [], trophies: [] };
  if (!PRO.rival || PRO.rival.club === PRO.club) { const top = CLUB_NAMES.filter(c => c !== PRO.club).slice(0, 3), c = top[Math.floor(Math.random() * 3)]; PRO.rival = { name: ROSTER[c][0].name, club: c }; }
  PRO.phase = 'club'; PRO.obj = Math.floor(Math.random() * OBJ.length); psave();
}
function clubFixture() {
  const S = PRO.season, me = S.club;
  while (S.idx < PLAN.length) {
    const p = PLAN[S.idx], n = +p.slice(1);
    if (p[0] === 'C' && !S.cup.alive) { S.idx++; continue; }
    if (p[0] === 'L') { const pair = S.rounds[n].find(x => x.includes(me)); return { club: true, ko: false, kind: 'L', n, t1: pair[0], t2: pair[1], me, label: `LEAGUE · MATCHDAY ${n + 1} OF 9` }; }
    if (!S.cup.opp[n]) {
      const others = CLUB_NAMES.filter(c => c !== me), pool = [others.slice(-5), others.slice(2, 7), others.slice(0, 5), others.slice(0, 3)][n];
      S.cup.opp[n] = pool[Math.floor(Math.random() * pool.length)]; S.cup.home[n] = Math.random() < .5; psave();
    }
    const o = S.cup.opp[n];
    return { club: true, ko: true, kind: 'C', n, t1: S.cup.home[n] ? me : o, t2: S.cup.home[n] ? o : me, me, label: `PIXEL CUP · ${CUP_R[n]}` };
  }
  return null;
}
function recordClub(f, m, res, u) {
  const S = PRO.season, me = S.club, s = m.et || m.ft;
  m.goals1.forEach(g => tally(g.name, m.t1)); m.goals2.forEach(g => tally(g.name, m.t2));
  if (f.kind === 'L') {
    addRes(S.table, m.t1, m.t2, m.ft[0], m.ft[1]);
    for (const [a, b] of S.rounds[f.n]) if (a !== me && b !== me) {
      const x = simKO(a, b, null, Math.random); addRes(S.table, a, b, x.ft[0], x.ft[1]);
      x.goals1.slice(0, x.ft[0]).forEach(g => tally(g.name, a)); x.goals2.slice(0, x.ft[1]).forEach(g => tally(g.name, b));
    }
  } else if (res !== 'W') S.cup.alive = false;
  else if (f.n === 3) { S.trophies.push('PIXEL CUP'); S.cup.won = true; S.cup.alive = false; }
  S.log.push({ kind: f.kind, n: f.n, opp: u ? f.t1 : f.t2, gf: s[u], ga: s[1 - u], res, pens: m.p ? [m.p[u], m.p[1 - u]] : null });
  S.idx++;
}

// ---------- World Cups ----------
function wcFixture() {
  R = PRO.cup; const f = nextFixture(); if (!f) return null;
  f.me = PRO.team; f.label = `WORLD CUP ${PRO.cup.year} · ${stageName(f)} · ${day(f.date)}`; return f;
}
// a fresh World Cup (2030, 2034): same groups and venues, every other result simulated
function newWC(year) {
  const team = PRO.team, r = mulberry((Math.random() * 1e9) | 0), over = {};
  for (const m of REAL) if (m.num <= 72 && m.t1 !== team && m.t2 !== team) {
    const x = simKO(m.t1, m.t2, m.num, r);
    over[m.num] = { ...x, group: m.group, stage: 'G', et: null, p: null, goals1: x.goals1.slice(0, x.ft[0]), goals2: x.goals2.slice(0, x.ft[1]) };
  }
  const need = Math.round(78 - (RANK[team] - 1) * 16 / 47);
  PRO.cup = { team, year, fresh: true, seed: (Math.random() * 1e9) | 0, over, log: [], done: false, goals: {}, need, notCalled: ovr(PRO) < need, apps: 0, myGoals: 0, ratings: [] };
  PRO.clubTrust = PRO.trust; PRO.trust = clamp(50 + (ovr(PRO) - need) * 3, 30, 95);
  PRO.phase = 'wc'; psave();
}
function recordWC(f, m, res, u) {
  const C = PRO.cup, fin = m.et || m.ft;
  C.over[f.num] = m;
  C.log.push({ num: f.num, stage: E.STAGE_OF(f.num), opp: u ? f.t1 : f.t2, gf: fin[u], ga: fin[1 - u], res, pens: m.p ? [m.p[u], m.p[1 - u]] : null });
  (u ? m.goals2 : m.goals1).forEach(g => (C.goals[g.name] = (C.goals[g.name] || 0) + 1));
}
const canPlay = () => !PRO.injured && !(PRO.phase === 'wc' && PRO.cup.notCalled);

function sprite(scale = 6, team = PRO.team) {
  const cv = document.createElement('canvas'); cv.width = 12; cv.height = 16; cv.className = 'pro-sprite'; cv.style.width = 12 * scale + 'px'; cv.style.height = 16 * scale + 'px';
  const c = cv.getContext('2d'); drawMan(c, { x: 6, y: 13, moving: false }, colour(team), false, SKINS[PRO.skin], false, 0); return cv;
}

// old saves from before the career update
function migrate(P) {
  P.age ??= 18; P.money ??= 0; P.perks ??= []; P.owned ??= {}; P.trophies ??= []; P.history ??= []; P.wcs ??= [];
  P.intl ??= { apps: 0, goals: 0 }; P.phase ??= 'wc'; P.cup.year ??= 2026; P.cup.apps ??= 0; P.cup.myGoals ??= 0; P.cup.ratings ??= [];
  return P;
}

function proCreate() {
  const P = { name: '', skin: Math.floor(Math.random() * 5), num: 10, pos: 'ST' };
  const paint = () => {
    render(`<section class="create">
      <h2 class="screen-title">CREATE YOUR PLAYER</h2>
      <div class="create-grid">
        <div class="box portrait"><div class="big-face" id="pv"></div>
          <label class="namebox"><span>NAME ON YOUR SHIRT</span><input id="nm" maxlength="14" value="${esc(P.name)}" placeholder="YOUR NAME" autocomplete="off"></label></div>
        <div class="box">
          <div class="asel"><span class="alab">SKIN</span><button class="arw" data-a="skin" data-d="-1">◀</button><b><i class="sw" style="background:${SKINS[P.skin]}"></i></b><button class="arw" data-a="skin" data-d="1">▶</button></div>
          <div class="asel"><span class="alab">NUMBER</span><button class="arw" data-a="num" data-d="-1">◀</button><b>#${P.num}</b><button class="arw" data-a="num" data-d="1">▶</button></div>
          <p class="lbl" style="margin-top:14px">POSITION</p>
          <div class="perks pos3">${Object.entries(POS).map(([k, v]) => `<button class="perk" data-p="${k}" aria-pressed="${P.pos === k}"><b>${v.name}</b><span>${v.tip}</span></button>`).join('')}</div>
          <p class="small" style="margin-top:14px">You’re 18. The 2026 World Cup is your big break. Then come club seasons, transfers, two more World Cups, and one day, retirement.</p>
        </div>
      </div>
      <div class="menu row"><button class="btn big y" id="go">PICK YOUR NATION ▶</button></div>
    </section>`);
    const pv = $('#pv'); const cv = document.createElement('canvas'); cv.width = 12; cv.height = 16; cv.className = 'pro-sprite'; cv.style.cssText = 'width:144px;height:192px'; pv.append(cv);
    const c = cv.getContext('2d'); drawMan(c, { x: 6, y: 13 }, '#FFD23F', false, SKINS[P.skin], false, 0);
    const nm = $('#nm'); nm.oninput = () => (P.name = nm.value.toUpperCase());
    app.querySelectorAll('[data-a]').forEach(b => b.onclick = () => { P.name = nm.value.toUpperCase(); if (b.dataset.a === 'skin') P.skin = (P.skin + +b.dataset.d + 5) % 5; else P.num = ((P.num - 1 + +b.dataset.d + 99) % 99) + 1; paint(); });
    app.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { P.name = nm.value.toUpperCase(); P.pos = b.dataset.p; paint(); });
    $('#go').onclick = () => { P.name = (nm.value.trim() || 'THE KID').toUpperCase().replace(/[^A-Z0-9 .'-]/g, '').slice(0, 14); proNation(P); };
  };
  paint();
}
function proNation(P) {
  render(`<section class="pick"><h2 class="screen-title">WHO DO YOU PLAY FOR?</h2>
    <p class="lede center">You’ll join the real 2026 squad. Big nations = better teammates. Small nations = you’re the hero.</p>
    <div class="grid" id="grid">${[...TEAMS].sort((a, b) => RANK[a] - RANK[b]).map(t => `<button class="tile" data-team="${esc(t)}" style="${kit(t)}"><span class="tc">${code(t)}</span><span class="tn">${esc(t)}</span><span class="ts">${stars(t)}</span><span class="tr">Star: ${esc(names(t)[0])}</span></button>`).join('')}</div></section>`);
  $('#grid').onclick = e => {
    const b = e.target.closest('[data-team]'); if (!b) return;
    const team = b.dataset.team;
    PRO = migrate({ ...P, team, stats: { ...POS[P.pos].base }, energy: 100, trust: 50, followers: 900 + Math.floor(Math.random() * 600), xp: 0, level: 1, points: 0, chem: 0,
      celeb: null, did: false, career: { goals: 0, assists: 0, apps: 0, ratings: [] }, posts: [], inbox: null, done: false, club: null, phase: 'wc',
      obj: Math.floor(Math.random() * OBJ.length),
      cup: { team, year: 2026, seed: (Math.random() * 1e9) | 0, over: {}, log: [], done: false, goals: {}, apps: 0, myGoals: 0, ratings: [] } });
    R = PRO.cup; psave();
    const star = names(team)[0];
    render(`<section class="presser">
      <h2 class="screen-title">YOU’RE IN!</h2>
      ${dialogA('THE MANAGER', `We’ve been watching you, ${esc(PRO.name)}. You’re in the ${esc(team)} squad for the World Cup. Train hard and you’ll start. Mess around and you’ll watch from the bench.`)}
      ${dialogA('YOUR AGENT', `Every big club in the world is watching this tournament. Play well and they’ll come calling. Play badly and… let’s not.`)}
      ${dialogA(esc(star), `Welcome, #${PRO.num}. Pass me the ball and we’ll get along.`)}
      <div class="menu row"><button class="btn big y" id="go">LET’S GO ▶</button></div></section>`);
    $('#go').onclick = proGo;
  };
}
const dialogA = (who, txt) => `<div class="dialog"><span class="dface">${esc(who)[0]}</span><p><b>${who}:</b> ${txt}</p></div>`;

// ---------- Golden Boot: the real 2026 scorers up to today, plus you ----------
function goldenBoot(cut) {
  R = PRO.cup;
  const tally = {};
  for (const m of eff()) {
    if (!m.ft || m.date >= cut) continue;
    for (const [gs, t] of [[m.goals1 || [], m.t1], [m.goals2 || [], m.t2]]) for (const g of gs) if (!g.owngoal) (tally[g.name + '|' + t] ||= { name: g.name, team: t, goals: 0 }).goals++;
  }
  const mine = (tally[PRO.name + '|' + PRO.team] ||= { name: PRO.name, team: PRO.team, goals: 0 }); mine.you = true;
  const list = Object.values(tally).sort((a, b) => b.goals - a.goals || (b.you ? 1 : 0) - (a.you ? 1 : 0) || a.name.localeCompare(b.name));
  let rank = 0, prev = null; list.forEach((x, i) => { if (x.goals !== prev) { rank = i + 1; prev = x.goals; } x.rank = rank; });
  return list;
}
function bootTable(gb, n = 5) {
  const me = gb.find(x => x.you), top = gb.slice(0, n), gap = gb[0].goals - me.goals;
  return `<ol class="gb">${top.map(x => `<li class="${x.you ? 'you' : ''}"><em>${x.rank}</em><span>${esc(x.you ? x.name + ' (YOU)' : x.name)}</span><small><i class="dot" style="${kit(x.team)}"></i>${code(x.team)}</small><b>${x.goals}</b></li>`).join('')}
    ${top.includes(me) ? '' : `<li class="gap">···</li><li class="you"><em>${me.rank}</em><span>${esc(me.name)} (YOU)</span><small><i class="dot" style="${kit(me.team)}"></i>${code(me.team)}</small><b>${me.goals}</b></li>`}</ol>
    <p class="gb-note">${me.rank === 1 && me.goals > 0 ? (gb[1] && gb[1].goals === me.goals ? '🔥 TIED FOR THE LEAD!' : '👑 YOU’RE LEADING THE RACE!') : gap > 0 ? `${gap} GOAL${gap > 1 ? 'S' : ''} BEHIND ${esc(surname(gb[0].name))}` : 'NOBODY HAS SCORED YET'}</p>`;
}
const rankList = l => { let rank = 0, prev = null; l.forEach((x, i) => { if (x.goals !== prev) { rank = i + 1; prev = x.goals; } x.rank = rank; x.you = x.name === PRO.name; }); return l; };

// ---------- off the pitch ----------
const ACTS = {
  train: { name: 'TRAIN HARD', tip: '+30 XP · manager notices · −15 energy' },
  rest: { name: 'REST UP', tip: '+35 energy' },
  media: { name: 'MEDIA DAY', tip: 'Big follower boost · manager not a fan' },
  dinner: { name: 'TEAM DINNER', tip: 'Teammates pass to you more' }
};
const INBOX_PRO = [
  t => ({ from: names(t)[0] === PRO.name ? names(t)[1] : names(t)[0], text: 'Extra shooting drills tonight? Just us.', a: [['I’M IN', { shoot: 2, energy: -10 }, 'Your finishing gets sharper. SHOOTING +2'], ['NEED SLEEP', { energy: 10 }, 'Good night’s sleep.']] }),
  () => ({ from: 'YOUR AGENT', text: 'A boot company wants you in an advert. Big money.', a: [['DO THE AD', { followers: .4, money: 30000, energy: -8 }, 'The advert goes everywhere. +$30K'], ['FOCUS ON FOOTBALL', { trust: 4 }, 'The manager respects that.']] }),
  () => ({ from: 'A FAN', text: 'If you score next game, what’s the celebration?', a: CELEBS.slice().sort(() => Math.random() - .5).slice(0, 3).map(c => [c, { celeb: c }, `Locked in: ${c}.`]) }),
  () => ({ from: 'RIVAL DEFENDER', text: '“That kid won’t get past me.”', a: [['“WE’LL SEE.”', { followers: .15, pace: 1 }, 'Fired up. PACE +1'], ['IGNORE IT', { trust: 2 }, 'Mature. The manager likes it.']] }),
  t => ({ from: names(t)[1], text: 'Bro, FIFA tournament in my room tonight?', a: [['BRING IT', { chem: 1, energy: -5 }, 'You win. Team chemistry up.'], ['EARLY NIGHT', { energy: 8 }, 'Rested.']] }),
  () => ({ from: 'YOUR AGENT', text: 'An energy drink brand wants to sponsor you.', a: [['SIGN IT', { money: 50000, energy: -5 }, '+$50K. Tastes awful though.'], ['NOT MY STYLE', { trust: 2 }, 'Your manager likes that you’re focused.']] }),
  () => ({ from: 'A JOURNALIST', text: 'Is it true you want to leave?', a: [['“I LOVE IT HERE”', { trust: 5 }, 'The fans love that. TRUST +5'], ['“NEVER SAY NEVER”', { followers: .12, trust: -4 }, 'The rumour mill goes wild.']] }),
  () => ({ from: 'YOUR MUM', text: 'A kid from your old school wrote you a letter. He wants to be like you.', a: [['VISIT THE SCHOOL', { followers: .15, energy: -6, xp: 20 }, 'Best day ever, for him and you. +20 XP'], ['SEND A SIGNED SHIRT', { followers: .05 }, 'He framed it.']] }),
  () => ({ from: 'THE SKILLS COACH', text: 'Want to learn a new skill move after training?', a: [['STAY LATE', { dribble: 2, energy: -10 }, 'Learned the elastico. DRIBBLING +2'], ['NOT TODAY', { energy: 5 }, 'Maybe next time.']] }),
  t => ({ from: names(t)[2], text: 'Party at mine tonight. Whole squad’s coming.', a: [['GO', { chem: 1, energy: -20, trust: -3 }, 'Great night. Rough morning.'], ['STAY HOME', { energy: 6, trust: 1 }, 'Smart.']] }),
  () => ({ from: 'A CHARITY', text: 'Would you play in our charity match?', a: [['PLAY', { followers: .1, trust: 2, energy: -8 }, 'Everyone loved it.'], ['DONATE $10K', { money: -10000, followers: .12 }, 'Generous. The fans noticed.']] }),
  () => PRO.rival ? ({ from: 'A JOURNALIST', text: `${PRO.rival.name} says he’s better than you. Any response?`, a: [['“SEE YOU ON THE PITCH”', { followers: .12, shoot: 1 }, 'Fired up. SHOOTING +1'], ['“HE’S A GREAT PLAYER”', { trust: 3 }, 'Classy.']] }) : ({ from: 'A SCOUT', text: 'I’m watching your next game. No pressure.', a: [['BRING IT ON', { followers: .05, pace: 1 }, 'PACE +1'], ['…GULP', { energy: -3 }, 'Nervous.']] })
];
function applyPro(fx) {
  for (const k of ['pace', 'shoot', 'pass', 'dribble']) if (fx[k]) PRO.stats[k] = Math.min(99, PRO.stats[k] + fx[k]);
  if (fx.energy) PRO.energy = clamp(PRO.energy + fx.energy, 0, 100);
  if (fx.trust) PRO.trust = clamp(PRO.trust + fx.trust, 0, 100);
  if (fx.followers) growFans(fx.followers);
  if (fx.chem) PRO.chem = Math.min(5, PRO.chem + fx.chem);
  if (fx.money) PRO.money = Math.max(0, PRO.money + fx.money);
  if (fx.xp) gainXP(fx.xp);
  if (fx.celeb) PRO.celeb = fx.celeb;
}
function gainXP(n) {
  PRO.xp += Math.round(n * (PRO.owned?.trainer ? 1.25 : 1)); let ups = 0;
  while (PRO.xp >= PRO.level * 100) {
    PRO.xp -= PRO.level * 100; PRO.level++; PRO.points += 2; ups++;
    if (PRO.level % 5 === 0) { const left = Object.keys(PERKS).filter(k => !PRO.perks.includes(k)).sort(() => Math.random() - .5); if (left.length) PRO.perkChoices = left.slice(0, 3); }
  }
  if (ups) setTimeout(() => { toast(`⬆ LEVEL ${PRO.level}! +${ups * 2} SKILL POINTS`); jingle([523, 659, 784, 1047, 1319], 80); }, 400);
}
const bar = (label, v, cls = '') => `<div class="meter ${cls}"><span>${label}</span><div class="mt"><i style="width:${clamp(v, 0, 100)}%"></i></div><b>${Math.round(v)}</b></div>`;

// ---------- where are we in the career? ----------
function proGo() {
  if (!PRO) return title();
  R = PRO.cup;
  if (PRO.done) return careerEnd();
  if (PRO.phase === 'offers') return offersScreen();
  if (PRO.phase === 'summary') return seasonEnd();
  if (PRO.phase === 'wc') { const f = wcFixture(); return f ? proHub(f) : wcEnd(); }
  const f = clubFixture(); return f ? proHub(f) : seasonEnd();
}

function proCard(me) {
  return `<header class="box procard" style="${kit(me)}">
      <div class="sprite-box" id="spr"></div>
      <div class="pc-main"><b>${esc(PRO.name)} <span class="num">#${PRO.num}</span></b>
        <span>${POS[PRO.pos].name} · ${esc(me).toUpperCase()} · AGE ${PRO.age} · LEVEL ${PRO.level}</span>
        <div class="xpbar"><i style="width:${PRO.xp / (PRO.level * 100) * 100}%"></i></div>
        <div class="statrow">${Object.entries(STATN).map(([k, n]) => `<span><small>${n.slice(0, 3)}</small><b>${PRO.stats[k]}</b>${PRO.points ? `<button class="plus" data-up="${k}" aria-label="Upgrade ${n}">+</button>` : ''}</span>`).join('')}<span><small>$</small><b>${fmtK(PRO.money)}</b></span></div>
        ${PRO.points ? `<p class="pts">⬆ ${PRO.points} SKILL POINTS: TAP + TO UPGRADE (+3)</p>` : ''}
      </div>
      <div class="ovr"><small>OVR</small><b>${ovr(PRO)}</b></div>
    </header>`;
}
function leagueBox(S) {
  const rows = leagueRows(S), mi = rows.findIndex(r => r.team === S.club), show = rows.filter((r, i) => i < 4 || i === mi || i === rows.length - 1);
  const nextCup = PLAN.slice(S.idx).find(p => p[0] === 'C');
  return `<p class="lbl">🏆 LEAGUE · SEASON ${S.year - 1}/${String(S.year).slice(2)}</p>
    <table class="tbl"><thead><tr><th>CLUB</th><th>P</th><th>GD</th><th>PTS</th></tr></thead><tbody>${show.map(r => { const i = rows.indexOf(r); return `<tr class="${r.team === S.club ? 'me' : ''} ${i === 0 ? 'q' : ''}"><td>${i + 1}. <i class="dot" style="${kit(r.team)}"></i>${code(r.team)}</td><td>${r.p}</td><td>${r.gd > 0 ? '+' : ''}${r.gd}</td><td><b>${r.pts}</b></td></tr>`; }).join('')}</tbody></table>
    <p class="cupline">🏆 PIXEL CUP: ${S.cup.won ? '<b>WON IT!</b>' : S.cup.alive && nextCup ? `STILL IN · NEXT: ${CUP_R[+nextCup.slice(1)]}` : 'KNOCKED OUT'}</p>`;
}
function rivalBox(S) {
  const sc = scorersOf(S), mine = S.sc[PRO.name]?.goals || 0, rv = S.sc[PRO.rival.name]?.goals || 0, top = rankList(sc.slice(0, 5));
  return `<p class="lbl">⚔ RIVAL: ${esc(PRO.rival.name).toUpperCase()} (${code(PRO.rival.club)})</p>
    <div class="rival"><span>YOU <b>${mine}</b></span><small>GOALS THIS SEASON</small><span><b>${rv}</b> HIM</span></div>
    <p class="lbl" style="margin-top:12px">🥇 LEAGUE TOP SCORERS</p>
    <ol class="gb">${top.map(x => `<li class="${x.you ? 'you' : ''}"><em>${x.rank}</em><span>${esc(x.you ? x.name + ' (YOU)' : x.name)}</span><small><i class="dot" style="${kit(x.team)}"></i>${code(x.team)}</small><b>${x.goals}</b></li>`).join('')}</ol>`;
}

function proHub(f) {
  const me = f.me, opp = f.t1 === me ? f.t2 : f.t1, play = canPlay(), starting = play && PRO.trust >= 45, club = PRO.phase === 'club', S = PRO.season;
  PRO.obj ??= Math.floor(Math.random() * OBJ.length);
  const ib = PRO.inbox != null ? INBOX_PRO[PRO.inbox % INBOX_PRO.length](me) : null;
  const status = !play ? (PRO.injured ? `🤕 INJURED: OUT FOR ${PRO.injured} MORE MATCH${PRO.injured > 1 ? 'ES' : ''}` : `✖ NOT CALLED UP. YOU NEED OVR ${PRO.cup.need}`) : starting ? '✔ YOU’RE IN THE STARTING XI' : '✖ ON THE BENCH. YOU MIGHT COME ON LATE';
  render(`<section class="prohub" style="${kit(me)}">
    ${proCard(me)}
    <div class="topbar"><button class="btn sm" id="career">📖 CAREER</button><button class="btn sm" id="shop">🛒 SHOP</button><button class="btn sm" id="restart">⟲ NEW PLAYER</button><a class="btn sm" href="#" data-go="home">MENU</a></div>
    ${PRO.perkChoices ? `<article class="box inbox perkpick"><p class="lbl">⭐ LEVEL ${PRO.level} REWARD: PICK A PERK</p><div class="choices">${PRO.perkChoices.map(k => `<button class="choice" data-perk="${k}"><b>${PERKS[k].name}</b><span>${PERKS[k].tip}</span></button>`).join('')}</div></article>` : ''}
    ${ib ? `<article class="box inbox"><p class="lbl">📱 DM FROM ${esc(ib.from).toUpperCase()}</p><p class="msg">${esc(ib.text)}</p><div class="choices">${ib.a.map(([t], i) => `<button class="choice" data-ib="${i}"><b>${t}</b></button>`).join('')}</div></article>` : ''}
    <div class="hub-grid">
      <article class="box next">
        <p class="lbl">${esc(f.label)}</p>
        <div class="vs"><span class="crest-px" style="${kit(me)}">${code(me)}</span><i>VS</i><span class="crest-px" style="${kit(opp)}">${code(opp)}</span></div>
        <p class="o-line">${esc(opp).toUpperCase()} · ${club ? '' : `WORLD #${RANK[opp]} `}${stars(opp)}</p>
        <p class="lineup ${starting ? 'start' : 'bench'}">${status}</p>
        ${play ? `<p class="obj">🎯 MANAGER’S TARGET: <b>${OBJ[PRO.obj].txt}</b> <small>+40 XP & BONUS</small></p><button class="btn big y" id="kick">PLAY MATCH ▶</button>` : ''}
        <div class="menu row simrow"><button class="btn sm" id="sim">⏩ ${play ? 'SIM MATCH (½ XP)' : 'SIM MATCH'}</button><button class="btn sm" id="simall">⏩⏩ SIM REST OF ${club ? 'SEASON' : 'CUP'}</button></div>
      </article>
      <article class="box">
        ${bar('ENERGY', PRO.energy, PRO.energy < 40 ? 'danger' : '')}${bar('TRUST', PRO.trust, PRO.trust < 45 ? 'danger' : '')}
        <div class="meter"><span>FANS</span><b class="big-f">${fmtK(PRO.followers)}</b></div>
        <p class="lbl" style="margin-top:12px">${PRO.did ? 'DONE TODAY ✔' : 'BEFORE THE MATCH, PICK ONE'}</p>
        <div class="acts">${Object.entries(ACTS).map(([k, a]) => `<button class="choice" data-act="${k}" ${PRO.did || (k === 'train' && PRO.injured) ? 'disabled' : ''}><b>${a.name}</b><span>${a.tip}</span></button>`).join('')}</div>
      </article>
      <article class="box">${club ? leagueBox(S) : `<p class="lbl">🥇 GOLDEN BOOT RACE</p>${bootTable(goldenBoot(f.date))}`}</article>
      <article class="box">
        ${club ? rivalBox(S) : ''}
        <p class="lbl" ${club ? 'style="margin-top:12px"' : ''}>📱 YOUR FEED</p>
        <ul class="posts">${(PRO.posts.slice(-3).reverse().map(p => `<li><b>${esc(p.u)}</b> ${esc(p.t)}</li>`).join('')) || '<li class="dim">No one is talking about you. Yet.</li>'}</ul>
      </article>
    </div>
  </section>`);
  $('#spr').append(sprite(5, me));
  app.querySelectorAll('[data-up]').forEach(b => b.onclick = () => { if (PRO.points < 1) return; PRO.stats[b.dataset.up] = Math.min(99, PRO.stats[b.dataset.up] + 3); PRO.points--; psave(); blip(1047, .08); proGo(); });
  app.querySelectorAll('[data-perk]').forEach(b => b.onclick = () => { PRO.perks.push(b.dataset.perk); PRO.perkChoices = null; psave(); jingle([523, 784, 1047], 90); toast(`⭐ PERK UNLOCKED: ${PERKS[b.dataset.perk].name}`); proGo(); });
  app.querySelectorAll('[data-act]').forEach(b => b.onclick = () => {
    const k = b.dataset.act; PRO.did = true;
    if (k === 'train') { applyPro({ xp: 30, trust: 4, energy: -15 }); toast('The manager saw that. +30 XP'); }
    if (k === 'rest') { applyPro({ energy: 35 }); toast('Fully charged. +35 ENERGY'); }
    if (k === 'media') { applyPro({ followers: .35, trust: -3 }); toast(`Your interview trends. FANS → ${fmtK(PRO.followers)}`); }
    if (k === 'dinner') { applyPro({ chem: 1, trust: 1 }); toast('Great night. Teammates will look for you more.'); }
    psave(); proGo();
  });
  app.querySelectorAll('[data-ib]').forEach(b => b.onclick = () => { const [, fx, msg] = ib.a[+b.dataset.ib]; applyPro(fx); PRO.inbox = null; psave(); toast(msg); proGo(); });
  const k = $('#kick'); if (k) k.onclick = () => proMatch(f, starting);
  $('#sim').onclick = () => proResult(simProMatch(f, play, starting), true);
  armRestart($('#simall'), simRest);
  $('#career').onclick = careerScreen;
  $('#shop').onclick = shopScreen;
  armRestart($('#restart'), () => { store.del('ft-pro'); PRO = null; R = null; proCreate(); });
}

// ---------- a match as a pro ----------
function pickKind() {
  if (has('poacher') && Math.random() < .2) return 'solo';
  const w = { ST: [['normal', .4], ['solo', .25], ['counter', .2], ['freekick', .15]], WG: [['normal', .35], ['counter', .35], ['solo', .2], ['freekick', .1]], PM: [['normal', .45], ['freekick', .3], ['counter', .15], ['solo', .1]] }[PRO.pos];
  let x = Math.random(); for (const [k, p] of w) { x -= p; if (x <= 0) return k; } return 'normal';
}
const KIND_TXT = { normal: 'YOU’RE IN THE ATTACK!', counter: 'COUNTER-ATTACK!', solo: 'THROUGH ON GOAL!', freekick: 'FREE KICK! YOU’RE TAKING IT' };
async function proMatch(f, starting) {
  const me = f.me, u = f.t1 === me ? 0 : 1, opp = u ? f.t1 : f.t2, score = [0, 0], goals = [];
  const stats = { goals: 0, assists: 0, shots: 0, skills: 0, tackled: 0, chances: 0, saves: 0 };
  matchScreen(me, opp, f); idlePitch();
  const diff = ELO[me] - ELO[opp], r = Math.random;
  const on = starting ? 1 : 55 + Math.floor(r() * 15);
  const nYou = starting ? 3 + Math.floor(r() * 2) + (PRO.chem >= 3 ? 1 : 0) : 2;
  const nTeam = clamp(Math.round(2 + diff / 220), 0, 4), nOpp = clamp(Math.round(4 - diff / 170), 2, 7), pOpp = clamp(.22 - diff / 1300, .08, .42), pTeam = clamp(.2 + diff / 1500, .08, .35);
  const span = (a, b, n) => Array.from({ length: n }, () => a + Math.floor(r() * (b - a)));
  const timeline = [...span(Math.max(on + 2, 4), 87, nYou).map(m => ({ m, t: 'you' })), ...span(3, 89, nTeam).map(m => ({ m, t: 'team' })), ...span(3, 89, nOpp).map(m => ({ m, t: 'opp' }))].sort((a, b) => a.m - b.m);
  banner(`${code(f.t1)} V ${code(f.t2)}`, starting ? `#${PRO.num} ${esc(PRO.name)} STARTS` : `${esc(PRO.name)} ON THE BENCH`); Audio.setLevel(1); SFX.whistle(1); await wait(1700); hideBanner();
  let clock = 0, subbed = starting;
  const addGoal = (side, name, min) => { score[side]++; goals.push({ side, name, min }); $('#s' + side).textContent = score[side]; };
  const mates = names(me).filter(n => n !== PRO.name);
  async function ev(e) {
    await tickClock(clock, e.m); clock = e.m;
    if (!subbed && e.m >= on) { subbed = true; banner('SUBSTITUTION', `#${PRO.num} ${esc(PRO.name)} IS COMING ON`); jingle([523, 784], 100); await wait(1500); hideBanner(); }
    if (e.t === 'you') {
      stats.chances++;
      const pen = !e.last && r() < .1, kind = pen ? null : e.last ? (r() < .5 ? 'solo' : 'normal') : pickKind();
      banner(`${e.m}'`, e.last ? 'LAST-MINUTE CHANCE! THIS IS IT!' : pen ? 'PENALTY! YOU’RE TAKING IT' : KIND_TXT[kind]); jingle(e.last ? [660, 880, 1047] : [660, 880], 70); await wait(e.last ? 1300 : 1000); hideBanner();
      const out = await attackChance({ me, opp, kind: kind || 'normal', penalty: pen, pro: proArg() });
      stats.shots += out.S.shots + (pen ? 1 : 0); stats.skills += out.S.skills; if (out.S.tackled) stats.tackled++;
      if (out.result === 'goal') {
        addGoal(u, out.scorer, e.m);
        if (out.you || pen) {
          stats.goals++;
          const big = stats.goals === 3 ? 'HAT-TRICK!' : e.last ? 'LAST-GASP WINNER!'.replace('WINNER', score[u] > score[1 - u] ? 'WINNER' : 'EQUALISER') : PRO.celeb ? PRO.celeb + '!' : 'GOAL!';
          flash(big, `${esc(PRO.name)} ${e.m}'${out.assist && !pen ? ` · assist ${esc(surname(out.assist))}` : ''}`, me); feed(`<b>${e.m}'</b> GOAL! YOU (${esc(PRO.name)})${stats.goals === 3 ? ' · HAT-TRICK!' : ''}`, me);
          if (stats.goals === 3) confetti();
        } else { if (out.assistYou) stats.assists++; flash('GOAL!', `${esc(out.scorer)} ${e.m}'${out.assistYou ? ' · YOUR ASSIST!' : ''}`, me); feed(`<b>${e.m}'</b> GOAL! ${esc(out.scorer)}${out.assistYou ? ' · assist: YOU' : ''}`, me); }
        SFX.goal(); Audio.roar(1, 4); await wait(1700);
      } else { const txt = { saved: 'SAVED!', tackled: 'TACKLED!', wide: 'WIDE!', intercepted: 'CUT OUT!', loose: 'LOST IT!', wall: 'HIT THE WALL!', timeout: 'TOO SLOW!' }[out.result]; banner(txt, '', 'bad'); feed(`<b>${e.m}'</b> ${txt}`); Audio.roar(.4, 2); await wait(900); hideBanner(); }
    } else if (e.t === 'team') {
      if (r() < pTeam) {
        const name = mates[Math.floor(r() * 3)], assist = subbed && r() < .15 + PRO.chem * .05;
        addGoal(u, name, e.m); if (assist) stats.assists++;
        flash('GOAL!', `${esc(name)} ${e.m}'${assist ? ' · YOUR ASSIST!' : ''}`, me); SFX.goal(); feed(`<b>${e.m}'</b> GOAL! ${esc(name)}${assist ? ' · assist: YOU' : ''}`, me); await wait(1400);
      } else feed(`<b>${e.m}'</b> ${esc(surname(mates[Math.floor(r() * 3)]))} ${['shoots wide', 'forces a save', 'hits the bar!', 'heads over'][Math.floor(r() * 4)]}.`);
    } else if (r() < .5) {
      const name = names(opp)[Math.floor(r() * 3)];
      banner(`${e.m}'`, `${esc(surname(name))} IS THROUGH! TAP TO DIVE`, 'bad'); jingle([880, 660], 70); await wait(950); hideBanner();
      const out = await saveChance({ me, opp });
      if (out.result === 'goal') { addGoal(1 - u, name, e.m); flash('GOAL', `${esc(name)} ${e.m}'`, opp); SFX.lose(); feed(`<b>${e.m}'</b> ${code(opp)} score. ${esc(name)}.`, opp); await wait(1300); }
      else { stats.saves++; banner(out.result === 'saved' ? 'WHAT A SAVE!' : 'OFF TARGET!'); Audio.roar(1, 3); feed(`<b>${e.m}'</b> ${out.result === 'saved' ? `Huge save from ${esc(surname(name))}!` : `${esc(surname(name))} misses.`}`, me); await wait(1000); hideBanner(); }
    } else {
      if (r() < pOpp) { const name = names(opp)[Math.floor(r() * 3)]; addGoal(1 - u, name, e.m); flash('GOAL', `${esc(name)} ${e.m}'`, opp); SFX.lose(); feed(`<b>${e.m}'</b> ${code(opp)} score. ${esc(name)}.`, opp); await wait(1300); }
      else feed(`<b>${e.m}'</b> ${code(opp)} attack... ${['your defence holds', 'over the bar', 'your keeper saves', 'blocked'][Math.floor(r() * 4)]}.`);
    }
    idlePitch();
  }
  for (const e of timeline.filter(x => x.m <= 45)) await ev(e);
  await tickClock(clock, 45); clock = 45; banner('HALF TIME', `${code(f.t1)} ${score[0]}-${score[1]} ${code(f.t2)}`); SFX.whistle(2); await wait(1500); hideBanner();
  for (const e of timeline.filter(x => x.m > 45)) await ev(e);
  // drama: level or one down at the death, the ball falls to you
  const gap = score[1 - u] - score[u];
  if ((gap === 0 || gap === 1) && r() < (has('late') ? .9 : .45)) await ev({ m: 89 + Math.floor(r() * 3), t: 'you', last: true });
  await tickClock(clock, 90); clock = 90;
  const ft = score.slice(); let et = null, p = null;
  if (f.ko && ft[0] === ft[1]) {
    banner('EXTRA TIME'); SFX.whistle(2); await wait(1400); hideBanner();
    await ev({ m: 100 + Math.floor(r() * 15), t: 'you' }); if (r() < .5) await ev({ m: 115, t: 'opp' });
    await tickClock(clock, 120); et = score.slice();
    if (et[0] === et[1]) {
      banner('PENALTIES!', 'YOU TAKE THE FIRST ONE'); SFX.whistle(3); await wait(1500); hideBanner();
      const mine = (await attackChance({ me, opp, penalty: true, pro: proArg() })).result === 'goal';
      let a = mine ? 1 : 0, b = 0; for (let k = 0; k < 5; k++) { if (k && r() < .76) a++; if (r() < .76) b++; }
      while (a === b) { if (r() < .76) a++; if (r() < .76) b++; }
      p = u === 0 ? [a, b] : [b, a];
      banner(mine ? 'YOU SCORED!' : 'YOU MISSED...', `SHOOTOUT ${code(me)} ${a}-${b} ${code(opp)}`, mine ? '' : 'bad'); await wait(2000); hideBanner();
    }
  }
  SFX.whistle(3);
  proResult(finishMatch(f, { ft, et, p, goals, stats, played: true, starting, u, me, opp }), false);
}

// quick sim: no mini-games, half XP
function simProMatch(f, playing, starting) {
  const me = f.me, u = f.t1 === me ? 0 : 1, opp = u ? f.t1 : f.t2, r = Math.random;
  const x = simKO(f.t1, f.t2, f.num ?? null, r);
  const ft = x.ft, et = f.ko ? x.et : null, p = f.ko ? x.p : null, fin = et || ft;
  const stats = { goals: 0, assists: 0, shots: 0, skills: 0, tackled: 0, chances: 0, saves: 0 }, goals = [];
  const k = clamp(ovr(PRO) / 75, .6, 1.4) * (playing ? (starting ? 1 : .45) : 0);
  const pg = { ST: .42, WG: .3, PM: .22 }[PRO.pos] * k, pa = { ST: .15, WG: .3, PM: .4 }[PRO.pos] * k;
  const mins = n => Array.from({ length: n }, () => 1 + Math.floor(r() * (et ? 119 : 89))).sort((a, b) => a - b);
  const mates = names(me).filter(n => n !== PRO.name);
  mins(fin[u]).forEach(mn => { if (r() < pg) { stats.goals++; goals.push({ side: u, name: PRO.name, min: mn }); } else { if (r() < pa) stats.assists++; goals.push({ side: u, name: mates[Math.floor(r() * 3)], min: mn }); } });
  mins(fin[1 - u]).forEach(mn => goals.push({ side: 1 - u, name: names(opp)[Math.floor(r() * 3)], min: mn }));
  if (playing) { stats.chances = starting ? 4 : 2; stats.shots = stats.goals + Math.floor(r() * 3); stats.skills = Math.floor(r() * 4); }
  return finishMatch(f, { ft, et, p, goals, stats, played: playing, starting, u, me, opp, simmed: true });
}
async function simRest() {
  let n = 0, xp = 0, g = 0;
  for (;;) {
    const f = PRO.phase === 'wc' ? wcFixture() : clubFixture(); if (!f) break;
    const play = canPlay(), o = simProMatch(f, play, play && PRO.trust >= 45);
    xp += o.xp; g += o.stats.goals; PRO.inbox = null; PRO.did = false; n++;
    if (n > 20) break;
  }
  gainXP(xp); psave(); toast(`⏩ SIMMED ${n} MATCHES · ${g} GOALS · +${xp} XP`); proGo();
}

function finishMatch(f, d) {
  const { ft, et, p, goals, stats, played, starting, u, me, opp, simmed } = d;
  const fin = et || ft, gf = fin[u], ga = fin[1 - u];
  const m = { num: f.num ?? null, stage: f.club ? null : E.STAGE_OF(f.num), group: f.club ? null : REAL.find(x => x.num === f.num)?.group || null, date: f.date, ground: f.ground, t1: f.t1, t2: f.t2, ft, et, p,
    goals1: goals.filter(g => g.side === 0).sort((a, b) => a.min - b.min).map(g => ({ name: g.name, minute: String(g.min) })), goals2: goals.filter(g => g.side === 1).sort((a, b) => a.min - b.min).map(g => ({ name: g.name, minute: String(g.min) })) };
  const res = f.ko ? (E.winnerOf(m) === me ? 'W' : 'L') : gf > ga ? 'W' : gf < ga ? 'L' : 'D';
  if (f.club) recordClub(f, m, res, u); else recordWC(f, m, res, u);
  const why = !played ? (PRO.injured ? 'injured' : 'notcalled') : null;
  let rating = null, xp = 0, objOk = false, earned = 0, injury = 0; const oldTrust = PRO.trust;
  if (played) {
    rating = Math.round(clamp(6 + (res === 'W' ? .5 : res === 'L' ? -.4 : 0) + stats.goals * 1.1 + stats.assists * .7 + stats.skills * .08 + stats.shots * .05 - stats.tackled * .2 - (stats.chances - stats.goals - stats.shots) * .1 - (starting ? 0 : .3) + (simmed ? (Math.random() - .5) * .6 : 0), 3, 10) * 10) / 10;
    PRO.career.apps++; PRO.career.goals += stats.goals; PRO.career.assists += stats.assists; PRO.career.ratings.push(rating);
    if (f.club) { const st = PRO.season.st; st.apps++; st.goals += stats.goals; st.assists += stats.assists; st.ratings.push(rating); }
    else { PRO.intl.apps++; PRO.intl.goals += stats.goals; PRO.cup.apps++; PRO.cup.myGoals += stats.goals; PRO.cup.ratings.push(rating); }
    const tg = rating >= 7.5 ? 12 : rating >= 6.5 ? 4 : rating < 5.5 ? -12 : -3;
    PRO.trust = clamp(PRO.trust + (tg > 0 && has('captain') ? Math.round(tg * 1.5) : tg), 0, 100);
    growFans((stats.goals * .3 + stats.assists * .12 + (rating >= 8 ? .2 : 0) + (res === 'W' ? .05 : 0)) * (has('fans') ? 1.5 : 1));
    PRO.energy = clamp(PRO.energy - (starting ? 25 : 12) * (has('engine') ? .5 : 1) + 20 + (PRO.owned.chef ? 10 : 0), 0, 100);
    posts(stats, rating, res, opp, starting, me);
    xp = Math.round((rating * 8 + stats.goals * 20 + stats.assists * 12) * (simmed ? .5 : 1));
    objOk = OBJ[PRO.obj ?? 0].ok(stats, rating, res);
    const wage = f.club ? clubWage(me) : 10000;
    earned = wage + Math.round(wage * .25) * (stats.goals + stats.assists) + (objOk ? wage : 0);
    if (objOk) { xp += 40; PRO.trust = clamp(PRO.trust + 4, 0, 100); }
    PRO.money += earned;
    const risk = (PRO.energy < 30 ? .3 : PRO.energy < 50 ? .08 : .02) * (PRO.owned.physio ? .5 : 1);
    if (Math.random() < risk) { injury = 1 + Math.floor(Math.random() * 3); if (PRO.owned.physio) injury = Math.ceil(injury / 2); PRO.injured = injury; }
  } else {
    if (PRO.injured) PRO.injured--;
    PRO.energy = clamp(PRO.energy + 25, 0, 100);
    if (f.club) PRO.money += Math.round(clubWage(me) * .5), earned = Math.round(clubWage(me) * .5);
  }
  PRO.did = false; PRO.obj = Math.floor(Math.random() * OBJ.length);
  if (Math.random() < .5) PRO.inbox = Math.floor(Math.random() * INBOX_PRO.length);
  psave();
  return { m, res, rating, xp, oldTrust, objOk, injury, stats, played, simmed, earned, why, me };
}
function posts(st, rating, res, opp, starting, me) {
  const S = surname(PRO.name), tag = code(me).toLowerCase(), pick = a => a[Math.floor(Math.random() * a.length)];
  const lines = [];
  if (st.goals >= 3) lines.push(['@golazo_hub', `HAT-TRICK ${PRO.name} 🎩🎩🎩`], ['@footy_daily', `${S} is the best player on the planet right now`]);
  else if (st.goals === 2) lines.push([pick(['@golazo_hub', '@footy_daily']), `${PRO.name} IS HIM 🔥🔥🔥`], [`@${tag}_ultras`, `name the stadium after ${S}`]);
  else if (st.goals === 1) lines.push([`@${tag}fan_22`, `what a finish from ${S}!!`], ['@xg_nerd', `${S} clinical today. ${rating}/10`]);
  if (st.assists) lines.push(['@assist_king', `${S} with the vision 👀`]);
  if (!starting) lines.push(['@why_tho', `why is ${S} on the bench??`]);
  if (rating < 6) lines.push(['@tactics_guy', `${S} was invisible today. bench him`]);
  if (PRO.age >= 32 && rating >= 7.5) lines.push(['@oldheads', `${S} at ${PRO.age} still cooking 👴🔥`]);
  if (res === 'W' && RANK[opp] < RANK[me] - 8) lines.push(['@football_memes', `${code(me)} beating ${code(opp)} wasn’t on my bingo card`]);
  if (!lines.length) lines.push(['@random_fan', `solid shift from #${PRO.num}`]);
  lines.slice(0, 3).forEach(([u, t]) => PRO.posts.push({ u, t }));
  PRO.posts = PRO.posts.slice(-12);
}
function proResult(o, standalone) {
  const { m, res, rating, xp, oldTrust, objOk, injury, stats: st, played, simmed, earned, why } = o;
  const s = m.et || m.ft, col = rating >= 8 ? 'r8' : rating >= 7 ? 'r7' : rating >= 6 ? 'r6' : 'r5';
  if (res === 'W') { confetti(); jingle([392, 523, 659, 784, 1047], 110); } else if (res === 'L') SFX.lose();
  const list = side => (side ? m.goals2 : m.goals1).map(g => `<li>${esc(g.name)}${g.name === PRO.name ? ' ★' : ''} ${g.minute}'</li>`).join('') || '<li class="dim">—</li>';
  const html = `<div class="box result ${res}">
    ${simmed ? '<p class="lbl">⏩ SIMULATED MATCH</p>' : ''}
    <h3>${res === 'W' ? 'WIN!' : res === 'D' ? 'DRAW' : 'LOSS'}</h3>
    <p class="big">${code(m.t1)} ${s[0]}-${s[1]} ${code(m.t2)}${m.p ? ` <small>PENS ${m.p[0]}-${m.p[1]}</small>` : ''}</p>
    ${simmed ? `<div class="scorers"><ul>${list(0)}</ul><ul>${list(1)}</ul></div>` : ''}
    ${played ? `<div class="rating ${col}"><small>YOUR RATING</small><b id="rt">0.0</b></div>
      <div class="mstats"><span>GOALS <b>${st.goals}</b></span><span>ASSISTS <b>${st.assists}</b></span><span>SHOTS <b>${st.shots}</b></span><span>SKILLS <b>${st.skills}</b></span>${simmed ? '' : `<span>SAVES <b>${st.saves}</b></span>`}</div>
      <p class="small">${objOk ? '🎯 TARGET HIT! +40 XP · ' : '🎯 Target missed · '}+${xp} XP · TRUST ${PRO.trust > oldTrust ? '▲' : PRO.trust < oldTrust ? '▼' : '='} ${PRO.trust} · FANS ${fmtK(PRO.followers)} · +${cash(earned)}</p>`
      : `<p class="small">${why === 'injured' ? '🤕 You watched from the stands.' : 'You weren’t in the squad. You watched it on TV.'}</p>`}
    ${injury ? `<p class="lineup bench">🤕 INJURED! OUT FOR ${injury} MATCH${injury > 1 ? 'ES' : ''}. REST MORE NEXT TIME</p>` : ''}
    <div class="menu row"><button class="btn big y" id="cont">CONTINUE ▶</button></div></div>`;
  if (standalone) render(`<section class="amatch">${html}</section>`);
  else { $('#hint').textContent = ''; app.querySelector('.amatch').insertAdjacentHTML('beforeend', html); app.querySelector('.result').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  let iv = 0;
  if (played) { let v = 0; iv = setInterval(() => { v = Math.min(rating, v + .3); const el = $('#rt'); if (!el) return clearInterval(iv); el.textContent = v.toFixed(1); blip(400 + v * 60, .03); if (v >= rating) { clearInterval(iv); blip(1200, .15); } }, 45); }
  $('#cont').onclick = () => { clearInterval(iv); Audio.setLevel(.25); gainXP(xp); psave(); proGo(); };
}

// ---------- end of a World Cup ----------
function wcEnd() {
  const C = PRO.cup; R = C;
  if (!C.closed) {
    const T = advance(); C.done = true; C.finish = finishOf(PRO.team, Object.values(C.over)); C.champ = T.ko[104].winner; C.closed = true;
    const gb = goldenBoot('9999'), me = gb.find(x => x.you), avg = mean(C.ratings);
    C.bootRank = me.rank; C.avg = avg; C.awards = [];
    if (C.finish === 7) C.awards.push(`🌍 WORLD CUP ${C.year}`);
    if (me.rank === 1 && me.goals > 0) C.awards.push(`🥇 WORLD CUP GOLDEN BOOT ${C.year}`);
    if (C.apps >= 3 && avg >= 7.6 && C.finish >= 4) C.awards.push(`🏆 PLAYER OF THE TOURNAMENT ${C.year}`);
    PRO.trophies.push(...C.awards);
    PRO.wcs.push({ year: C.year, finish: C.finish, apps: C.apps, goals: C.myGoals, called: !C.notCalled });
    if (PRO.club) PRO.trust = PRO.clubTrust ?? 50;
    if (C.apps) PRO.lastAvg = avg;
    psave();
  }
  const f = C.finish ?? 0, real = C.year === 2026 ? REALFINISH[PRO.team] : null, gb = goldenBoot('9999');
  if (C.awards.length) setTimeout(confetti, 300);
  render(`<section class="end" style="${kit(PRO.team)}">
    ${f === 7 ? '<div class="trophy" aria-hidden="true"></div>' : ''}
    <p class="lbl">WORLD CUP ${C.year} · #${PRO.num} ${esc(PRO.name)} · ${esc(PRO.team).toUpperCase()}</p>
    <h1 class="finish">${FINISH[f]}</h1>
    ${real != null ? `<p class="vs-real">REAL ${esc(PRO.team).toUpperCase()}: <b>${FINISH[real]}</b>${f > real ? ' · <span class="up">YOU BEAT HISTORY!</span>' : ''}</p>` : ''}
    ${C.notCalled ? '<p class="small">You weren’t called up for this one. Get your OVR up for the next.</p>' : `<div class="mstats big"><span>APPS <b>${C.apps}</b></span><span>GOALS <b>${C.myGoals}</b></span><span>AVG <b>${C.avg ? C.avg.toFixed(1) : '-'}</b></span></div>`}
    <div class="box gb-end"><p class="lbl">🥇 FINAL GOLDEN BOOT · YOU FINISHED #${C.bootRank}</p>${bootTable(gb, 5)}</div>
    ${C.champ ? `<p class="small">WORLD CHAMPIONS: <b>${esc(C.champ).toUpperCase()}</b></p>` : ''}
    ${C.awards.length ? `<div class="awards">${C.awards.map(a => `<span class="badge">${a}</span>`).join('')}</div>` : ''}
    <div class="menu row"><button class="btn big y" id="go">${PRO.club ? 'BACK TO CLUB FOOTBALL ▶' : 'SEE WHO WANTS TO SIGN YOU ▶'}</button><button class="btn" id="share">COPY RESULT</button></div>
  </section>`);
  $('#go').onclick = () => { if (!PRO.club) { PRO.phase = 'offers'; PRO.offers = null; } else newSeason(); psave(); proGo(); };
  $('#share').onclick = () => navigator.clipboard?.writeText(`GOAL RUSH ’26 · BE A PRO ⚽\nWorld Cup ${C.year}: #${PRO.num} ${PRO.name} (${PRO.team}) · ${FINISH[f]} · ${C.myGoals} goals`).then(() => toast('COPIED!'));
}

// ---------- transfer window ----------
function offersScreen() {
  const first = !PRO.club;
  if (!PRO.offers) {
    const reach = 1200 + ovr(PRO) * 9 + ((PRO.lastAvg || 6.5) - 6.5) * 80 + Math.log10(PRO.followers + 10) * 10;
    let list = CLUBS.filter(c => c[0] !== PRO.club && c[3] <= reach).slice(0, 3).map(c => c[0]);
    if (!list.length) list = CLUB_NAMES.slice(-3).filter(c => c !== PRO.club).slice(0, 2);
    PRO.offers = list; psave();
  }
  const card = (c, stay) => `<button class="offer" data-club="${esc(c)}" style="${kit(c)}">
      <span class="crest-px sm" style="${kit(c)}">${code(c)}</span>
      <span class="o-name">${esc(c).toUpperCase()}</span>
      <span class="o-stars">${stars(c)}</span>
      <span class="o-line">${cash(clubWage(c))} / MATCH</span>
      <span class="o-goal">${stay ? 'STAY' : 'SIGN'}<b>${stay ? 'KEEP BUILDING' : CLUB_NAMES.indexOf(c) < 3 ? 'A GIANT OF THE LEAGUE' : CLUB_NAMES.indexOf(c) < 6 ? 'A SOLID TOP-HALF CLUB' : 'YOU’D BE THE STAR'}</b></span>
    </button>`;
  render(`<section class="pick career-sec">
    <h2 class="screen-title">${first ? 'CLUBS WANT YOU!' : 'TRANSFER WINDOW'}</h2>
    ${dialogA('YOUR AGENT', first ? `After that World Cup, my phone hasn’t stopped ringing. Pick your first club. Bigger clubs pay more, but you’ll have to earn your place.` : `Season’s over. Here’s who wants you. You’re OVR ${ovr(PRO)} with ${fmtK(PRO.followers)} fans, and that’s what clubs look at.`)}
    <div class="offer-list">${!first ? card(PRO.club, true) : ''}${PRO.offers.map(c => card(c, false)).join('')}</div>
    ${PRO.nextWC ? `<p class="small center">After the window: <b>WORLD CUP ${PRO.nextWC}</b> with ${esc(PRO.team)}.</p>` : ''}
  </section>`);
  app.querySelectorAll('[data-club]').forEach(b => b.onclick = () => {
    const c = b.dataset.club;
    if (c !== PRO.club) { PRO.club = c; PRO.trust = 50; PRO.clubTrust = 50; toast(`✍ SIGNED FOR ${c.toUpperCase()}!`); jingle([523, 659, 784, 1047], 90); }
    PRO.offers = null;
    if (PRO.nextWC) { const y = PRO.nextWC; PRO.nextWC = null; newWC(y); } else newSeason();
    psave(); proGo();
  });
}

// ---------- end of a club season ----------
function seasonEnd() {
  const S = PRO.season;
  if (!S.closed) {
    S.closed = true;
    const rows = leagueRows(S), pos = rows.findIndex(r => r.team === S.club) + 1, sc = scorersOf(S), mine = S.sc[PRO.name]?.goals || 0, avg = mean(S.st.ratings);
    if (pos === 1) S.trophies.push('LEAGUE TITLE');
    if (mine > 0 && mine >= sc[0].goals) S.trophies.push('GOLDEN BOOT');
    if (avg >= 7.5 && S.st.apps >= 5) S.trophies.push('PLAYER OF THE SEASON');
    if (PRO.age <= 21 && avg >= 7 && S.st.apps >= 5) S.trophies.push('YOUNG PLAYER OF THE YEAR');
    // the Golden Pixel: best player in the world this year
    const champs = rows[0].team, others = sc.filter(x => x.name !== PRO.name).slice(0, 6).map(x => ({ name: x.name, team: x.team, score: x.goals * 4 + 42 + Math.random() * 10 + (x.team === champs ? 15 : 0) }));
    const me = { name: PRO.name, team: S.club, you: true, score: mine * 4 + S.st.assists * 2 + (S.st.apps ? (avg - 6.8) * 20 : -40) + 42 + S.trophies.length * 12 };
    S.pixel = [...others, me].sort((a, b) => b.score - a.score); S.pixelRank = S.pixel.findIndex(x => x.you) + 1;
    if (S.pixelRank === 1) S.trophies.push('GOLDEN PIXEL');
    S.sponsor = Math.round(Math.sqrt(PRO.followers) * 300); PRO.money += S.sponsor;
    const ICON = { 'LEAGUE TITLE': '🏆', 'PIXEL CUP': '🏆', 'GOLDEN BOOT': '🥇', 'PLAYER OF THE SEASON': '⭐', 'YOUNG PLAYER OF THE YEAR': '🌱', 'GOLDEN PIXEL': '🟨' };
    PRO.trophies.push(...S.trophies.map(t => `${ICON[t] || '🏅'} ${t} ${S.year}`));
    PRO.history.push({ year: S.year, club: S.club, pos, apps: S.st.apps, goals: S.st.goals, assists: S.st.assists, avg, trophies: S.trophies.slice() });
    if (S.st.apps) PRO.lastAvg = avg;
    S.pos = pos; S.avg = avg; S.mine = mine; S.rival = S.sc[PRO.rival.name]?.goals || 0;
    PRO.age++; S.decline = {};
    if (PRO.age >= 31) for (const k of Object.keys(STATN)) { const d = Math.floor(Math.random() * 3) + (k === 'pace' ? 1 : 0); if (d) { PRO.stats[k] = Math.max(40, PRO.stats[k] - d); S.decline[k] = d; } }
    PRO.phase = 'summary'; psave();
  }
  const rows = leagueRows(S), forced = PRO.age >= 36, canRetire = PRO.age >= 32, wcNext = S.year % 4 === 2;
  if (S.trophies.length) setTimeout(confetti, 300);
  const dec = Object.entries(S.decline);
  render(`<section class="end career-sec" style="${kit(S.club)}">
    ${S.trophies.includes('LEAGUE TITLE') ? '<div class="trophy" aria-hidden="true"></div>' : ''}
    <p class="lbl">SEASON ${S.year - 1}/${String(S.year).slice(2)} · ${esc(S.club).toUpperCase()}</p>
    <h1 class="finish">${ORD(S.pos)} PLACE</h1>
    <div class="mstats big"><span>APPS <b>${S.st.apps}</b></span><span>GOALS <b>${S.st.goals}</b></span><span>ASSISTS <b>${S.st.assists}</b></span><span>AVG <b>${S.avg ? S.avg.toFixed(1) : '-'}</b></span></div>
    ${S.trophies.length ? `<div class="awards">${S.trophies.map(a => `<span class="badge">${a}</span>`).join('')}</div>` : '<p class="small">No trophies this year.</p>'}
    <p class="small">⚔ YOU ${S.mine} – ${S.rival} ${esc(PRO.rival.name).toUpperCase()} · ${S.mine > S.rival ? '<b class="up">YOU WIN THE RIVALRY</b>' : S.mine === S.rival ? 'DEAD EVEN' : 'HE WINS THIS ROUND'}</p>
    <div class="hub-grid">
      <article class="box"><p class="lbl">🟨 GOLDEN PIXEL · YOU FINISHED ${ORD(S.pixelRank)}</p>
        <ol class="gb">${S.pixel.slice(0, 5).map((x, i) => `<li class="${x.you ? 'you' : ''}"><em>${i + 1}</em><span>${esc(x.you ? x.name + ' (YOU)' : x.name)}</span><small><i class="dot" style="${kit(x.team)}"></i>${code(x.team)}</small><b>${Math.round(x.score)}</b></li>`).join('')}</ol></article>
      <article class="box"><table class="tbl"><caption>FINAL TABLE</caption><thead><tr><th>CLUB</th><th>GD</th><th>PTS</th></tr></thead><tbody>${rows.map((r, i) => `<tr class="${r.team === S.club ? 'me' : ''} ${i === 0 ? 'q' : ''}"><td>${i + 1}. <i class="dot" style="${kit(r.team)}"></i>${code(r.team)}</td><td>${r.gd > 0 ? '+' : ''}${r.gd}</td><td><b>${r.pts}</b></td></tr>`).join('')}</tbody></table></article>
    </div>
    <p class="small">💰 SPONSORS PAID YOU ${cash(S.sponsor)} · YOU’RE NOW ${PRO.age}${dec.length ? ` · AGE CATCHES UP: ${dec.map(([k, d]) => `${STATN[k]} −${d}`).join(', ')}` : ''}</p>
    ${forced ? '<p class="small"><b>Your body says it’s time. One last bow.</b></p>' : ''}
    <div class="menu row">${forced ? '' : `<button class="btn big y" id="next">${wcNext ? `TRANSFER WINDOW, THEN WORLD CUP ${S.year} ▶` : 'TRANSFER WINDOW ▶'}</button>`}${canRetire ? `<button class="btn ${forced ? 'big y' : ''}" id="retire">${forced ? 'RETIRE A LEGEND ▶' : 'RETIRE'}</button>` : ''}</div>
  </section>`);
  const nx = $('#next'); if (nx) nx.onclick = () => { PRO.nextWC = wcNext ? S.year : null; PRO.phase = 'offers'; PRO.offers = null; psave(); proGo(); };
  const rt = $('#retire'); if (rt) (forced ? (rt.onclick = retire) : armRestart(rt, retire));
}
function retire() { PRO.done = true; psave(); careerEnd(); }

// ---------- legacy ----------
const legacyScore = P => Math.round(P.career.goals * 2 + P.career.assists + P.trophies.length * 25 + P.trophies.filter(t => /WORLD CUP \d|GOLDEN PIXEL/.test(t)).length * 75 + (P.owned?.academy ? 150 : 0) + Math.log10(P.followers + 1) * 10);
const legacyTier = s => s >= 1500 ? 'ALL-TIME GREAT' : s >= 900 ? 'LEGEND' : s >= 450 ? 'CLUB HERO' : s >= 180 ? 'SOLID PRO' : 'JOURNEYMAN';
function careerEnd() {
  const c = PRO.career, score = legacyScore(PRO), avg = mean(c.ratings);
  if (!PRO.legendSaved) {
    const L = store.get('gr-legends') || [];
    L.push({ name: PRO.name, num: PRO.num, team: PRO.team, club: PRO.club, seasons: PRO.history.length, apps: c.apps, goals: c.goals, assists: c.assists, trophies: PRO.trophies.length, score, tier: legacyTier(score) });
    L.sort((a, b) => b.score - a.score); store.set('gr-legends', L.slice(0, 10)); PRO.legendSaved = true; psave();
  }
  const L = store.get('gr-legends') || [], place = L.findIndex(x => x.score === score && x.name === PRO.name) + 1;
  setTimeout(confetti, 300);
  render(`<section class="end career-sec" style="${kit(PRO.team)}">
    <p class="lbl">#${PRO.num} ${esc(PRO.name)} · RETIRED AT ${PRO.age}</p>
    <h1 class="finish">${legacyTier(score)}</h1>
    <p class="legacy">${score}</p><p class="small">LEGACY SCORE${place ? ` · #${place} IN YOUR HALL OF LEGENDS` : ''}</p>
    <div class="mstats big"><span>APPS <b>${c.apps}</b></span><span>GOALS <b>${c.goals}</b></span><span>ASSISTS <b>${c.assists}</b></span><span>AVG <b>${avg.toFixed(1)}</b></span></div>
    <div class="mstats"><span>CAPS <b>${PRO.intl.apps}</b></span><span>INTL GOALS <b>${PRO.intl.goals}</b></span><span>SEASONS <b>${PRO.history.length}</b></span><span>FANS <b>${fmtK(PRO.followers)}</b></span><span>BANK <b>${cash(PRO.money)}</b></span></div>
    <div class="awards">${PRO.trophies.map(a => `<span class="badge">${a}</span>`).join('') || '<span class="badge">🎟 YOU WERE THERE</span>'}</div>
    <div class="menu row"><button class="btn big y" id="again">NEW CAREER ▶</button><button class="btn" id="share">COPY RESULT</button><button class="btn" id="hall">🏛 HALL OF LEGENDS</button><a class="btn" href="#" data-go="home">MENU</a></div>
  </section>`);
  $('#again').onclick = () => { store.del('ft-pro'); PRO = null; proCreate(); };
  $('#hall').onclick = legendsScreen;
  $('#share').onclick = () => navigator.clipboard?.writeText(`GOAL RUSH ’26 · BE A PRO ⚽\n#${PRO.num} ${PRO.name} (${PRO.team}) · ${legacyTier(score)} · legacy ${score}\n${c.apps} apps · ${c.goals} goals · ${c.assists} assists · ${PRO.trophies.length} trophies`).then(() => toast('COPIED!'));
}
function legendsScreen() {
  const L = store.get('gr-legends') || [];
  render(`<section class="career-sec"><h2 class="screen-title">🏛 HALL OF LEGENDS</h2>
    <p class="lede center">Your best careers. Beat your top score.</p>
    <article class="box"><ol class="gb">${L.map((x, i) => `<li><em>${i + 1}</em><span>#${x.num} ${esc(x.name)} · ${x.tier}<br><small>${x.seasons} SEASONS · ${x.goals} GOALS · ${x.trophies} TROPHIES</small></span><small><i class="dot" style="${kit(x.team)}"></i>${code(x.team)}</small><b>${x.score}</b></li>`).join('') || '<li class="gap">Nobody yet. Go make history.</li>'}</ol></article>
    <div class="menu row"><a class="btn big y" href="#" data-go="home">◀ MENU</a></div></section>`);
}

// ---------- career book + shop ----------
function careerScreen() {
  const c = PRO.career;
  render(`<section class="career-sec">
    <h2 class="screen-title">${esc(PRO.name)}’S CAREER</h2>
    <div class="mstats big"><span>APPS <b>${c.apps}</b></span><span>GOALS <b>${c.goals}</b></span><span>ASSISTS <b>${c.assists}</b></span><span>CAPS <b>${PRO.intl.apps}</b></span></div>
    <p class="small center">LEGACY SCORE SO FAR: <b>${legacyScore(PRO)}</b> (${legacyTier(legacyScore(PRO))})</p>
    <article class="box"><p class="lbl">🏆 TROPHY CABINET (${PRO.trophies.length})</p><div class="awards">${PRO.trophies.map(a => `<span class="badge">${a}</span>`).join('') || '<p class="small">Empty. For now.</p>'}</div></article>
    <article class="box tblwrap"><table class="tbl wide"><caption>CLUB SEASONS</caption><thead><tr><th>SEASON</th><th>CLUB</th><th>POS</th><th>APPS</th><th>G</th><th>A</th><th>AVG</th></tr></thead><tbody>${PRO.history.map(h => `<tr><td>${h.year - 1}/${String(h.year).slice(2)}</td><td><i class="dot" style="${kit(h.club)}"></i>${code(h.club)}</td><td>${ORD(h.pos)}</td><td>${h.apps}</td><td>${h.goals}</td><td>${h.assists}</td><td>${h.avg ? h.avg.toFixed(1) : '-'}</td></tr>`).join('') || '<tr><td colspan="7" class="dim">Your first club season is coming.</td></tr>'}</tbody></table></article>
    <article class="box tblwrap"><table class="tbl wide"><caption>WORLD CUPS · ${esc(PRO.team).toUpperCase()}</caption><thead><tr><th>YEAR</th><th>FINISH</th><th>APPS</th><th>GOALS</th></tr></thead><tbody>${PRO.wcs.map(w => `<tr><td>${w.year}</td><td>${w.called ? FINISH[w.finish] : 'NOT CALLED UP'}</td><td>${w.apps}</td><td>${w.goals}</td></tr>`).join('') || '<tr><td colspan="4" class="dim">World Cup 2026 in progress.</td></tr>'}</tbody></table>
      <p class="small">Next World Cups: 2030 and 2034. Your nation needs you at OVR ${Math.round(78 - (RANK[PRO.team] - 1) * 16 / 47)}+.</p></article>
    <article class="box"><p class="lbl">⭐ PERKS (NEW ONE EVERY 5 LEVELS)</p>${PRO.perks.length ? `<ul class="posts">${PRO.perks.map(k => `<li><b>${PERKS[k].name}</b> ${PERKS[k].tip}</li>`).join('')}</ul>` : `<p class="small">None yet. First perk at level 5.</p>`}</article>
    <div class="menu row"><button class="btn big y" id="back">◀ BACK</button></div>
  </section>`);
  $('#back').onclick = proGo;
}
function shopScreen() {
  render(`<section class="career-sec">
    <h2 class="screen-title">🛒 SHOP</h2>
    <p class="lede center">You have <b>${cash(PRO.money)}</b>. Wages come in every match, bonuses for goals, assists and hitting targets, and sponsors pay at the end of each season.</p>
    <div class="acts shop">${SHOP.map(s => { const own = PRO.owned[s.id]; return `<button class="choice" data-buy="${s.id}" ${own || PRO.money < s.cost ? 'disabled' : ''}><b>${s.name} · ${own ? 'OWNED ✔' : cash(s.cost)}</b><span>${s.tip}</span></button>`; }).join('')}</div>
    <div class="menu row"><button class="btn big y" id="back">◀ BACK</button></div>
  </section>`);
  app.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => {
    const s = SHOP.find(x => x.id === b.dataset.buy); if (!s || PRO.owned[s.id] || PRO.money < s.cost) return;
    PRO.money -= s.cost; PRO.owned[s.id] = true; if (s.fx) applyPro(s.fx); psave(); jingle([784, 1047], 80); toast(`BOUGHT: ${s.name}`); shopScreen();
  });
  $('#back').onclick = proGo;
}

// =============================================================
//  MULTIPLAYER. Two-player WebRTC rooms and same-screen duels.
//   • LIVE MATCH: one player attacks while the other controls the keeper.
//   • GOAL RACE: both players get the same attacking chances for 60s.
// =============================================================
const MP = { room: null, code: '', host: false, gid: 0, view: null };
const hashN = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296; };
const mpPeers = () => MP.room?.peers() || [];
const hostPeer = () => mpPeers().find(p => p.presence.host === true);
const myPeer = () => MP.room?.self;
const pname = p => String(p.presence.n || 'PLAYER').toUpperCase().replace(/[^A-Z0-9 .'-]/g, '').slice(0, 12) || 'PLAYER';
const pteam = p => TEAMS.includes(p.presence.t) ? p.presence.t : TEAMS[0];
function leaveRoom() {
  MP.room?.leave();
  stopLiveMatch();
  MP.room = null; MP.gid = 0; MP.view = null; D = null; RC = null;
}
const teamOptions = sel => [...TEAMS].sort((a, b) => a.localeCompare(b)).map(t => `<option value="${esc(t)}" ${t === sel ? 'selected' : ''}>${esc(t)}</option>`).join('');

function multiMenu(message = '') {
  leaveRoom();
  const pref = store.get('gr-mp') || {};
  const t1 = TEAMS.includes(pref.t) ? pref.t : (PRO_SAVED() ? store.get('ft-pro').team : 'Brazil'), t2 = TEAMS.includes(pref.t2) ? pref.t2 : 'Argentina';
  render(`<section class="career-sec mp">
    <h2 class="screen-title">⚔ MULTIPLAYER</h2>
    <article class="box mp-me">
      <label class="namebox"><span>YOUR NAME</span><input id="mpn" maxlength="12" value="${esc(pref.n || (PRO_SAVED() ? store.get('ft-pro').name : ''))}" placeholder="YOUR NAME" autocomplete="off"></label>
      <label class="namebox"><span>YOUR NATION</span><select id="mpt">${teamOptions(t1)}</select></label>
    </article>
    <div class="mp-grid">
      <article class="box">
        <p class="lbl">🌐 ONLINE</p>
        <p class="small" id="mpstat" role="status">Create a room and share its 6-character code with a friend.</p>
        <button class="btn big y" id="mpnew">CREATE A ROOM</button>
        <div class="joinrow"><input id="mpc" placeholder="CODE" autocomplete="off" spellcheck="false" aria-label="Room code"><button class="btn" id="mpjoin">JOIN ▶</button></div>
      </article>
      <article class="box">
        <p class="lbl">🎮 SAME SCREEN · PENALTY DUEL</p>
        <p class="small">Two players, one device. One shoots, pass it over, the other dives.</p>
        <label class="namebox"><span>PLAYER 2</span><input id="mpn2" maxlength="12" value="${esc(pref.n2 || '')}" placeholder="PLAYER 2" autocomplete="off"></label>
        <label class="namebox"><span>PLAYER 2 NATION</span><select id="mpt2">${teamOptions(t2)}</select></label>
        <button class="btn big" id="mplocal">START DUEL ▶</button>
      </article>
    </div>
    <div class="menu row"><a class="btn" href="#" data-go="home">◀ MENU</a></div>
  </section>`);
  const me = () => { const n = ($('#mpn').value.trim() || 'PLAYER 1').toUpperCase().replace(/[^A-Z0-9 .'-]/g, '').slice(0, 12) || 'PLAYER 1', t = $('#mpt').value, n2 = ($('#mpn2').value.trim() || 'PLAYER 2').toUpperCase().replace(/[^A-Z0-9 .'-]/g, '').slice(0, 12) || 'PLAYER 2', t2 = $('#mpt2').value; store.set('gr-mp', { n: $('#mpn').value.trim(), t, n2: $('#mpn2').value.trim(), t2 }); return { n, t, n2, t2 }; };
  $('#mplocal').onclick = () => { const p = me(); duelStart({ id: Date.now(), seed: Math.random(), A: { n: p.n, t: p.t }, B: { n: p.n2, t: p.t2 } }); };
  const c = $('#mpc');
  c.oninput = () => { c.value = c.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); };
  const status = $('#mpstat'), create = $('#mpnew'), join = $('#mpjoin');
  if (typeof message === 'string' && message) status.textContent = message;
  if (!window.isSecureContext || !window.RTCPeerConnection) {
    status.textContent = 'Online play requires a WebRTC-capable browser and HTTPS or localhost.';
    create.disabled = join.disabled = true;
    return;
  }
  const connect = async host => {
    const code = c.value;
    if (!host && !/^[A-HJ-NP-Z2-9]{6}$/.test(code)) { toast('ENTER THE 6-CHARACTER ROOM CODE'); c.focus(); return; }
    const profile = me();
    create.disabled = join.disabled = true;
    status.textContent = 'Connecting…';
    try {
      const { openRoom, newRoomCode } = await import('./online-room.js');
      if (!status.isConnected) return;
      enterRoom(openRoom, host ? newRoomCode() : code, host, profile);
    } catch (error) {
      console.error(error);
      status.textContent = 'Couldn’t open online play. Try again.';
      create.disabled = join.disabled = false;
    }
  };
  create.onclick = () => connect(true);
  join.onclick = () => connect(false);
  c.onkeydown = e => { if (e.key === 'Enter') $('#mpjoin').click(); };
}

function enterRoom(openRoom, code, host, { n, t }) {
  MP.room = openRoom(code, host, { n, t }, { onChange: onRoom, onClose: onRoomClose, onLive: onLiveMessage });
  MP.code = code; MP.host = host; MP.gid = 0;
  lobby();
}

function onRoomClose(reason) {
  if (reason === 'full') return multiMenu('That room already has two players.');
  if (reason === 'timeout') return multiMenu('Couldn’t reach the host. Check the code and ask them to keep the room open.');
  if (reason === 'network') return multiMenu('Couldn’t establish a direct connection. Try joining from a different network.');
  if (MP.host && MP.view === 'lobby') { toast('YOUR FRIEND LEFT THE ROOM'); return lobby(); }
  stopLiveMatch();
  MP.gid = 0; MP.view = 'interrupted'; D = null; RC = null;
  render(`<section class="end">
    <h1 class="finish">${MP.host ? 'PLAYER DISCONNECTED' : 'HOST DISCONNECTED'}</h1>
    <div class="menu row"><button class="btn big y" id="room-back">${MP.host ? 'BACK TO LOBBY' : 'MULTIPLAYER MENU'}</button></div>
  </section>`);
  $('#room-back').onclick = MP.host ? hostToLobby : multiMenu;
}

function onRoom() {
  if (!MP.room) return;
  const h = hostPeer(), g = h?.presence?.game;
  if (g && typeof g === 'object' && g.id && g.id !== MP.gid && !MP.host) { MP.gid = g.id; return startGame(g); }
  if (!MP.host && !g && MP.gid) { MP.gid = 0; return lobby(); }
  if (MP.view === 'lobby') lobby();
  else if (MP.view === 'race') raceBoard();
  else if (MP.view === 'raceEnd') raceEnd();
}

function lobby() {
  stopLiveMatch();
  MP.view = 'lobby'; D = null; RC = null;
  const ps = mpPeers(), h = hostPeer(), mine = myPeer();
  render(`<section class="career-sec mp">
    <h2 class="screen-title">GAME LOBBY</h2>
    <article class="box center">
      <p class="lbl">ROOM CODE</p>
      <p class="mp-code">${esc(MP.code)}</p>
      ${MP.host ? '<button class="btn sm" id="mpcopy">COPY CODE</button><p class="small">Send this code to your friend so they can join from Multiplayer.</p>' : ''}
    </article>
    <article class="box">
      <p class="lbl">PLAYERS (${ps.length}/2)</p>
      <ul class="plist">${ps.map(p => `<li style="${kit(pteam(p))}"><span class="crest-px sm" style="${kit(pteam(p))}">${code(pteam(p))}</span><b>${esc(pname(p))}</b>${p.presence.host ? '<em>HOST</em>' : ''}${p.peer === mine ? '<em class="you">YOU</em>' : ''}</li>`).join('') || '<li class="dim">Connecting…</li>'}</ul>
    </article>
    ${MP.host ? `<div class="mp-grid">
      <article class="box"><p class="lbl">⚽ LIVE MATCH · 1 V 1</p><p class="small">One player dribbles, passes and shoots while the other moves the keeper. Possession switches after each play.</p><button class="btn big y" id="g-live" ${ps.length < 2 ? 'disabled' : ''}>${ps.length < 2 ? 'WAITING FOR A FRIEND…' : 'START MATCH ▶'}</button></article>
      <article class="box"><p class="lbl">⚡ GOAL RACE · 1 V 1</p><p class="small">Same team, same chances, 60 seconds. Most goals wins.</p><button class="btn big y" id="g-race" ${ps.length < 2 ? 'disabled' : ''}>START RACE ▶</button></article>
    </div>` : `<p class="hint" role="status">${h ? 'WAITING FOR THE HOST TO START…' : 'CONNECTING TO THE HOST…'}</p>`}
    <div class="menu row"><button class="btn" id="mpleave">LEAVE</button></div>
  </section>`);
  $('#mpleave').onclick = multiMenu;
  const copy = $('#mpcopy');
  if (copy) copy.onclick = async () => {
    try { await navigator.clipboard.writeText(MP.code); toast('ROOM CODE COPIED'); }
    catch { toast('SELECT THE ROOM CODE TO COPY IT'); }
  };
  const live = $('#g-live'); if (live) live.onclick = () => {
    const players = mpPeers().map(p => ({ n: pname(p), t: pteam(p) }));
    hostStart({ mode: 'live', players, first: 0 });
  };
  const gr = $('#g-race'); if (gr) gr.onclick = () => {
    const top = [...TEAMS].sort((a, b) => RANK[a] - RANK[b]), ta = top[Math.floor(Math.random() * 12)];
    let tb; do tb = top[12 + Math.floor(Math.random() * 20)]; while (tb === ta);
    hostStart({ mode: 'race', ta, tb, dur: 60 });
  };
}
function hostStart(g) {
  if (!MP.host || mpPeers().length !== 2) return hostToLobby();
  g.id = Date.now() * 10 + Math.floor(Math.random() * 10); g.seed = Math.random();
  MP.gid = g.id; MP.room.update({ game: g, rs: null });
  startGame(g);
}
function hostToLobby() { MP.gid = 0; MP.room?.update({ game: null, rs: null }); lobby(); }
function startGame(g) {
  if (g.mode === 'live' && Array.isArray(g.players) && g.players.length === 2 && g.players.every(p => TEAMS.includes(p?.t) && typeof p.n === 'string')) {
    liveStart(g);
  } else if (g.mode === 'race' && TEAMS.includes(g.ta) && TEAMS.includes(g.tb)) raceStart({ id: g.id, ta: g.ta, tb: g.tb, dur: clamp(+g.dur || 60, 20, 120), seed: Number(g.seed) || 0 });
}
const endButtons = (again) => MP.room
  ? (MP.host ? `<button class="btn big y" id="again">REMATCH ▶</button><button class="btn" id="tolobby">LOBBY</button>` : `<p class="hint">WAITING FOR THE HOST…</p><button class="btn" id="mpleave">LEAVE</button>`)
  : `<button class="btn big y" id="again">${again}</button><button class="btn" id="mpback">MULTIPLAYER MENU</button>`;

// ---------- live match ----------
const LIVE_POSSESSIONS = 6;
const LIVE_RESULTS = { goal: 'GOAL!', saved: 'SAVED!', tackled: 'TACKLED!', wide: 'WIDE!', intercepted: 'INTERCEPTED!', loose: 'LOST THE BALL!', timeout: 'TIME’S UP!' };
let liveMatch = null;

function stopLiveMatch() {
  if (!liveMatch) return;
  clearTimeout(liveMatch.timer);
  liveMatch.stopDefense?.();
  liveMatch = null;
}

function liveStart(game) {
  stopLiveMatch();
  const match = { game, score: [0, 0], first: game.first === 1 ? 1 : 0 };
  liveMatch = match;
  MP.view = 'live';
  livePossession(match, 0);
}

function liveSend(match, type, data) {
  MP.room?.live({ id: match.game.id, play: match.play, type, data });
}

async function livePossession(match, play) {
  match.stopDefense?.();
  match.play = play;
  match.attacker = (match.first + play) % 2;
  match.attacking = match.attacker === (MP.host ? 0 : 1);
  match.stage = 'playing';
  match.keeperX = W / 2;
  const [home, away] = match.game.players;
  const attack = match.game.players[match.attacker], defense = match.game.players[1 - match.attacker];
  const role = match.attacking ? 'YOU ATTACK' : 'YOU DEFEND';
  render(`<section class="amatch live-match">
    <div class="board"><div class="side" style="${kit(home.t)}"><b>${code(home.t)}</b></div>
      <div class="score"><b id="s0">${match.score[0]}</b><i>-</i><b id="s1">${match.score[1]}</b><span id="clock">10s</span></div>
      <div class="side away" style="${kit(away.t)}"><b>${code(away.t)}</b></div></div>
    <p class="lbl center" id="live-role">${role} · POSSESSION ${play + 1}/${LIVE_POSSESSIONS}</p>
    <div class="arena"><canvas id="cv" aria-label="${match.attacking ? 'Drag to dribble, pass or shoot' : 'Drag left or right to move your keeper'}"></canvas><div class="banner" id="banner"></div></div>
    <p class="hint" id="hint">${match.attacking ? 'DRAG TO DRIBBLE, PASS OR SHOOT' : 'DRAG LEFT OR RIGHT TO MOVE THE KEEPER'}</p>
    <div class="menu row"><button class="btn sm" id="quit">LEAVE GAME</button></div>
  </section>`);
  $('#quit').onclick = multiMenu;
  idlePitch();
  banner(role, `${esc(attack.n)} ON THE BALL`);
  if (!match.attacking) liveDefense(match, attack.t, defense.t);
  if (MP.host) match.timer = setTimeout(() => liveResolve(match, 'timeout'), 15000);

  await wait(650);
  if (liveMatch !== match || match.play !== play || match.stage !== 'playing') return;
  hideBanner();
  if (!match.attacking) return;
  match.publish = frame => {
    if (liveMatch !== match || match.play !== play || match.stage !== 'playing') return;
    $('#clock').textContent = frame.time + 's';
    liveSend(match, 'frame', frame);
  };
  const result = await attackChance({ me: attack.t, opp: defense.t, kind: 'counter', live: match, deadline: Date.now() + 10000 });
  if (!result || liveMatch !== match || match.play !== play || match.stage !== 'playing') return;
  if (MP.host) liveResolve(match, result.result);
  else liveSend(match, 'result', result.result);
}

function liveDefense(match, attack, defense) {
  const { cv, c } = setupCanvas();
  const colA = colour(attack), colD = colour(defense) === colA ? '#F2F2F2' : colour(defense);
  const keeperColour = gkCol(colA, colD);
  let dragging = false, lastMove = -Infinity, target = W / 2;
  const move = x => {
    target = clamp(x, POST_L + 2, POST_R - 2);
    liveSend(match, 'keeper', target);
  };
  const pointer = e => move(toPix(cv, e).x);
  cv.onpointerdown = e => { dragging = true; cv.setPointerCapture(e.pointerId); pointer(e); };
  cv.onpointermove = e => {
    if (!dragging || performance.now() - lastMove < 40) return;
    lastMove = performance.now();
    pointer(e);
  };
  cv.onpointerup = e => { if (dragging) pointer(e); dragging = false; };
  cv.onpointercancel = () => { dragging = false; };
  const keyboard = e => {
    const dx = ['ArrowLeft', 'KeyA'].includes(e.code) ? -7 : ['ArrowRight', 'KeyD'].includes(e.code) ? 7 : 0;
    if (dx) { e.preventDefault(); move(target + dx); }
  };
  window.addEventListener('keydown', keyboard);
  match.stopDefense = () => {
    window.removeEventListener('keydown', keyboard);
    cv.onpointerdown = cv.onpointermove = cv.onpointerup = cv.onpointercancel = null;
    match.drawDefense = match.stopDefense = null;
  };
  match.drawDefense = frame => {
    const now = performance.now() / 1000;
    const draw = ([x, y, moving], colour, skin, highlight = false) => drawMan(c, { x, y, moving }, colour, false, skin, highlight, now);
    drawPitch(c, false);
    frame.d.forEach(p => draw(p, colD, SKINS[2]));
    frame.a.forEach((p, i) => draw(p, colA, SKINS[(i * 2 + 1) % 5], i === frame.carrier || i === frame.receiver));
    draw(frame.k, keeperColour, SKINS[1], true);
    c.fillStyle = '#fff'; c.fillRect(frame.b[0] - 1, frame.b[1] - 1, 2, 2);
    $('#clock').textContent = frame.time + 's';
  };
}

function onLiveMessage(message) {
  const match = liveMatch;
  if (!match || MP.view !== 'live' || message?.id !== match.game.id) return;
  const { play, type, data } = message;
  if (!MP.host && type === 'next' && match.stage === 'outcome' && play === match.play) {
    if (play + 1 === LIVE_POSSESSIONS) return liveEnd(match);
    return livePossession(match, play + 1);
  }
  if (play !== match.play || match.stage !== 'playing') return;
  if (type === 'keeper' && match.attacking && Number.isFinite(data)) {
    match.keeperX = clamp(data, POST_L + 2, POST_R - 2);
  } else if (type === 'frame' && !match.attacking) {
    const point = p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]);
    if (Array.isArray(data?.a) && data.a.length <= 4 && data.a.every(point) && Array.isArray(data.d) && data.d.length <= 4 && data.d.every(point) && point(data.k) && point(data.b) && Number.isFinite(data.time)) {
      match.drawDefense?.(data);
    }
  } else if (type === 'result' && MP.host && !match.attacking && typeof data === 'string' && Object.hasOwn(LIVE_RESULTS, data)) {
    liveResolve(match, data);
  } else if (type === 'outcome' && !MP.host && typeof data === 'string' && Object.hasOwn(LIVE_RESULTS, data)) {
    liveOutcome(match, data);
  }
}

async function liveResolve(match, result) {
  if (liveMatch !== match || match.stage !== 'playing') return;
  clearTimeout(match.timer);
  liveSend(match, 'outcome', result);
  liveOutcome(match, result);
  await wait(1000);
  if (liveMatch !== match) return;
  liveSend(match, 'next', null);
  if (match.play + 1 === LIVE_POSSESSIONS) liveEnd(match);
  else livePossession(match, match.play + 1);
}

function liveOutcome(match, result) {
  match.stage = 'outcome';
  match.stopDefense?.();
  $('#hint').textContent = '';
  if (result === 'goal') {
    match.score[match.attacker]++;
    $('#s' + match.attacker).textContent = match.score[match.attacker];
    SFX.goal();
  } else if (result === 'saved') SFX.save();
  banner(LIVE_RESULTS[result], '', result === 'goal' ? '' : 'bad');
}

function liveEnd(match) {
  MP.view = 'liveEnd';
  const [home, away] = match.game.players, [a, b] = match.score;
  const winner = a === b ? null : a > b ? home : away;
  SFX.whistle(3);
  render(`<section class="end">
    <p class="lbl">FULL TIME</p>
    <h1 class="finish">${winner ? esc(winner.n) + ' WINS!' : 'IT’S A DRAW!'}</h1>
    <p class="big-score">${code(home.t)} ${a}-${b} ${code(away.t)}</p>
    <div class="menu row">${endButtons('PLAY AGAIN ▶')}</div>
  </section>`);
  wireEnd(() => hostStart({ mode: 'live', players: match.game.players, first: 1 - match.first }));
}

// ---------- the penalty duel ----------
let D = null;
const gx = x => POST_L + x * (POST_R - POST_L);
const shooterOf = k => k % 2 === 0 ? 'A' : 'B';
const otherSide = s => s === 'A' ? 'B' : 'A';
function penScene(c, o) {
  // zoomed in 2x on the goal so the target is big enough to tap
  c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#378F49'; c.fillRect(0, 0, W, H);
  c.setTransform(2, 0, 0, 2, -96, -(GL - 14) * 2);
  drawPitch(c, false);
  const now = o.t || 0;
  drawMan(c, { x: 92, y: GL + 50, moving: false }, colour(o.shoot), false, SKINS[2], false, now);
  drawMan(c, { x: o.kx, y: GL + 5, moving: !!o.moving }, gkCol(colour(o.keep), colour(o.shoot)), false, SKINS[1], false, now);
  c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(Math.round(o.bx) - 1, Math.round(o.by) + 2, 3, 1);
  c.fillStyle = '#fff'; c.fillRect(Math.round(o.bx) - 1, Math.round(o.by) - 1, 2, 2);
  if (o.aim != null) {
    const ax = Math.round(gx(o.aim)), ay = GL - 5; c.fillStyle = o.aim < 0 || o.aim > 1 ? '#FF5252' : '#FFD23F';
    c.fillRect(ax - 4, ay, 3, 1); c.fillRect(ax + 2, ay, 3, 1); c.fillRect(ax, ay - 4, 1, 3); c.fillRect(ax, ay + 2, 1, 3);
  }
  c.setTransform(1, 0, 0, 1, 0, 0);
}
function pickOnCanvas(role, shootT, keepT, secs = 12) {
  return new Promise(res => {
    const { cv, c } = setupCanvas(); let x = null, done = false, kx = 96, raf = 0; const t0 = performance.now();
    const fromEv = e => { const p = toPix(cv, e); return clamp(((p.x + 96) / 2 - POST_L) / (POST_R - POST_L), role === 'shoot' ? -.25 : 0, role === 'shoot' ? 1.25 : 1); };
    const finish = v => { if (done) return; done = true; cancelAnimationFrame(raf); cv.onpointerdown = cv.onpointermove = cv.onpointerup = null; window.removeEventListener('keydown', onKey); blip(1100, .06); res(v); };
    cv.onpointerdown = e => { x = fromEv(e); try { cv.setPointerCapture(e.pointerId); } catch {} };
    cv.onpointermove = e => { if (x != null) x = fromEv(e); };
    cv.onpointerup = e => { x = fromEv(e); finish(x); };
    const onKey = e => { const m = { ArrowLeft: role === 'shoot' ? .12 : .15, ArrowDown: .5, ArrowUp: .5, ArrowRight: role === 'shoot' ? .88 : .85 }[e.key]; if (m != null) { e.preventDefault(); finish(m); } };
    window.addEventListener('keydown', onKey);
    function frame(now) {
      if (!document.body.contains(cv)) return finish(.5);
      const left = secs - (now - t0) / 1000;
      if (left <= 0) return finish(role === 'shoot' ? .15 + Math.random() * .7 : Math.random());
      if (role === 'dive' && x != null) kx += (gx(x) - kx) * .3;
      penScene(c, { shoot: shootT, keep: keepT, kx, bx: 96, by: GL + 38, aim: role === 'shoot' ? x : null, t: now / 1000, moving: role === 'dive' && x != null });
      c.fillStyle = 'rgba(0,0,0,.4)'; c.fillRect(0, H - 3, W, 3); c.fillStyle = left < 3 ? '#FF5252' : '#FFD23F'; c.fillRect(0, H - 3, W * left / secs, 3);
      const h = $('#hint'); if (h) h.textContent = role === 'shoot' ? `YOU SHOOT: TAP WHERE IN THE GOAL · ${Math.ceil(left)}` : `YOU’RE IN GOAL: TAP WHERE TO DIVE · ${Math.ceil(left)}`;
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
  });
}
function idlePen(shootT, keepT, text) {
  const { c } = setupCanvas(); penScene(c, { shoot: shootT, keep: keepT, kx: 96, bx: 96, by: GL + 38 });
  const h = $('#hint'); if (h) h.textContent = text;
}
function animatePen(a, d, result, shootT, keepT) {
  return new Promise(res => {
    const { c } = setupCanvas(), t0 = performance.now(), tx = gx(a), ty = result === 'wide' ? GL - 9 : GL - 3, kT = gx(d);
    SFX.kick();
    function frame(now) {
      const t = (now - t0) / 1000, p = Math.min(1, t / .5), kp = Math.min(1, t / .42);
      let bx = 96 + (tx - 96) * p, by = GL + 38 + (ty - GL - 38) * p;
      if (result === 'saved') { const stop = .8; if (p >= stop) { const q = Math.min(1, (t - .4) / .5); bx = 96 + (tx - 96) * stop + (tx < 96 ? -14 : 14) * q; by = GL + 38 + (ty - GL - 38) * stop + 20 * q; } }
      penScene(c, { shoot: shootT, keep: keepT, kx: 96 + (kT - 96) * kp, bx, by, t: now / 1000, moving: kp < 1 });
      if (t < 1.25 && document.body.contains(c.canvas)) requestAnimationFrame(frame); else res();
    }
    requestAnimationFrame(frame);
  });
}
function passScreen(name, what) {
  return new Promise(res => {
    const ar = $('.arena'); if (!ar) return res();
    const ov = document.createElement('div'); ov.className = 'passov';
    ov.innerHTML = `<b>PASS TO ${esc(name)}</b><span>${what}</span><button class="btn big y">I’M READY ▶</button>`;
    ar.append(ov); ov.querySelector('button').onclick = () => { ov.remove(); res(); };
  });
}
function duelStart(o) {
  D = { ...o, k: 0, s: [0, 0], log: [] };
  MP.view = 'duel'; duelNext();
}
function duelDone() {
  const L = D.log, a = L.filter((g, i) => i % 2 === 0 && g).length, b = L.filter((g, i) => i % 2 === 1 && g).length, ta = Math.ceil(L.length / 2), tb = Math.floor(L.length / 2);
  if (ta <= 5 && tb <= 5 && (a + (5 - ta) < b || b + (5 - tb) < a)) return true;
  return ta >= 5 && ta === tb && a !== b;
}
const kickDots = side => { const mine = D.log.filter((g, i) => (i % 2 === 0) === (side === 'A')); const n = Math.max(5, mine.length + (shooterOf(D.k) === side ? 1 : 0)); return Array.from({ length: n }, (_, i) => i < mine.length ? (mine[i] ? '<i class="kd g">●</i>' : '<i class="kd m">✖</i>') : '<i class="kd">○</i>').join(''); };
function duelScreen() {
  render(`<section class="amatch duel">
    <div class="board"><div class="side" style="${kit(D.A.t)}"><b>${code(D.A.t)}</b></div><div class="score"><b id="s0">${D.s[0]}</b><i>-</i><b id="s1">${D.s[1]}</b><span id="clock">PENS</span></div><div class="side away" style="${kit(D.B.t)}"><b>${code(D.B.t)}</b></div></div>
    <div class="duel-names"><div><b>${esc(D.A.n)}</b><span>${kickDots('A')}</span></div><div><b>${esc(D.B.n)}</b><span>${kickDots('B')}</span></div></div>
    <div class="arena"><canvas id="cv" aria-label="Penalty duel. Tap in the goal to shoot or dive."></canvas><div class="banner" id="banner"></div></div>
    <p class="hint" id="hint"></p>
    <p class="small center">Aiming near a post is hard to save, but you might miss the target.</p>
    <div class="menu row"><button class="btn sm" id="quit">◀ QUIT</button></div>
  </section>`);
  $('#quit').onclick = multiMenu;
}
async function duelNext() {
  if (!D || MP.view !== 'duel') return;
  if (duelDone()) return duelEnd();
  duelScreen();
  const k = D.k, id = D.id, sh = shooterOf(k), kp = otherSide(sh), shootT = D[sh].t, keepT = D[kp].t;
  const alive = () => D && D.id === id && D.k === k && MP.view === 'duel';
  idlePen(shootT, keepT, '');
  banner(k >= 10 ? 'SUDDEN DEATH' : `KICK ${k + 1}`, `${esc(D[sh].n)} SHOOTS · ${esc(D[kp].n)} IN GOAL`, ''); await wait(1200);
  if (!alive()) return;
  hideBanner();
  if (k === 0) await passScreen(D[sh].n, 'You shoot first. Pick your spot!');
  if (!alive()) return;
  const aim = await pickOnCanvas('shoot', shootT, keepT);
  if (!alive()) return;
  idlePen(shootT, keepT, '');
  await passScreen(D[kp].n, 'You’re in goal. No peeking at where they shot!');
  if (!alive()) return;
  const dive = await pickOnCanvas('dive', shootT, keepT);
  if (alive()) duelResolve(k, aim, dive);
}
async function duelResolve(k, aim, dive) {
  const id = D.id, sh = shooterOf(k), kp = otherSide(sh);
  const a = aim + (hashN(D.seed + ':' + k) - .5) * .12;   // nobody kicks it exactly where they meant to
  const result = a < 0 || a > 1 ? 'wide' : Math.abs(a - dive) < .22 ? 'saved' : 'goal';
  const h = $('#hint'); if (h) h.textContent = '';
  await animatePen(a, dive, result, D[sh].t, D[kp].t);
  if (!D || D.id !== id) return;
  const goal = result === 'goal';
  if (goal) { D.s[sh === 'A' ? 0 : 1]++; SFX.goal(); } else SFX.save();
  D.log.push(goal);
  const s0 = $('#s' + (sh === 'A' ? 0 : 1)); if (s0) s0.textContent = D.s[sh === 'A' ? 0 : 1];
  banner(goal ? 'GOAL!' : result === 'saved' ? 'SAVED!' : 'MISSED!', goal ? `${esc(D[sh].n)} SCORES` : result === 'saved' ? `${esc(D[kp].n)} GUESSED RIGHT` : `${esc(D[sh].n)} PUT IT WIDE`, goal ? '' : 'bad');
  await wait(1400);
  if (!D || D.id !== id) return;
  hideBanner();
  D.k++; duelNext();
}
function duelEnd() {
  MP.view = 'duelEnd';
  const w = D.s[0] > D.s[1] ? 'A' : 'B';
  confetti(); jingle([392, 523, 659, 784, 1047], 110);
  render(`<section class="end" style="${kit(D[w].t)}">
    <div class="trophy" aria-hidden="true"></div>
    <p class="lbl">PENALTY DUEL</p>
    <h1 class="finish">${esc(D[w].n)} WINS!</h1>
    <p class="big-score">${code(D.A.t)} ${D.s[0]}-${D.s[1]} ${code(D.B.t)}</p>
    <div class="duel-names"><div><b>${esc(D.A.n)}</b><span>${kickDots('A')}</span></div><div><b>${esc(D.B.n)}</b><span>${kickDots('B')}</span></div></div>
    <div class="menu row">${endButtons('PLAY AGAIN ▶')}</div>
  </section>`);
  wireEnd(() => duelStart({ id: Date.now(), seed: Math.random(), A: D.B, B: D.A }));
}
function wireEnd(again) {
  const a = $('#again'); if (a) a.onclick = again;
  const l = $('#tolobby'); if (l) l.onclick = hostToLobby;
  const lv = $('#mpleave'); if (lv) lv.onclick = multiMenu;
  const b = $('#mpback'); if (b) b.onclick = multiMenu;
}

// ---------- the goal race ----------
let RC = null;
function racePub() { if (RC) MP.room?.update({ rs: { g: RC.id, goals: RC.goals, tries: RC.tries, done: RC.done } }); }
function raceRows() {
  const mine = myPeer();
  return mpPeers().map(p => { const rs = p.presence.rs, ok = rs?.g === RC?.id; return { n: pname(p), you: p.peer === mine, goals: ok ? clamp(+rs.goals || 0, 0, 999) : 0, tries: ok ? clamp(+rs.tries || 0, 0, 999) : 0, done: ok && rs.done === true }; })
    .sort((a, b) => b.goals - a.goals || a.tries - b.tries);
}
function raceBoard() {
  const el = $('#rb'); if (!el || !RC) return;
  el.innerHTML = raceRows().map((r, i) => `<li class="${r.you ? 'you' : ''}"><em>${i + 1}</em><span>${esc(r.n)}${r.you ? ' (YOU)' : ''}</span><b>${r.goals}</b>${r.done ? '<small>✔</small>' : ''}</li>`).join('');
}
async function raceStart(g) {
  RC = { id: g.id, ta: g.ta, tb: g.tb, dur: g.dur, goals: 0, tries: 0, done: false, end: 0 }; D = null;
  MP.view = 'race';
  render(`<section class="amatch race">
    <div class="board"><div class="side" style="${kit(g.ta)}"><b>${code(g.ta)}</b></div><div class="score"><b id="s0">0</b><i>/</i><b id="s1">0</b><span id="clock">${g.dur}s</span></div><div class="side away" style="${kit(g.tb)}"><b>${code(g.tb)}</b></div></div>
    <p class="small center">GOAL RACE: everyone plays as ${esc(g.ta)} against ${esc(g.tb)}. Most goals in ${g.dur} seconds wins.</p>
    <div class="race-wrap"><div class="arena"><canvas id="cv" aria-label="Goal race. Drag to pass or shoot."></canvas><div class="banner" id="banner"></div></div>
      <div class="box rbox"><p class="lbl">LIVE</p><ol class="gb rboard" id="rb"></ol></div></div>
    <p class="hint" id="hint"></p>
    <div class="menu row"><button class="btn sm" id="quit">LEAVE GAME</button></div>
  </section>`);
  $('#quit').onclick = multiMenu;
  const id = g.id, alive = () => RC && RC.id === id && MP.view === 'race' && document.querySelector('.race');
  idlePitch(); racePub(); raceBoard();
  for (const n of ['3', '2', '1']) { banner(n, 'GET READY'); blip(660, .08); await wait(800); if (!alive()) return; }
  banner('GO!'); blip(1320, .15); await wait(350);
  if (!alive()) return;
  hideBanner();
  RC.end = Date.now() + g.dur * 1000;
  const tick = setInterval(() => { if (!alive()) return clearInterval(tick); const l = Math.max(0, Math.ceil((RC.end - Date.now()) / 1000)), el = $('#clock'); if (el) { el.textContent = l + 's'; el.classList.toggle('low', l <= 10); } }, 200);
  while (alive() && Date.now() < RC.end) {
    const random = mulberry(hashN(`${g.seed}:${RC.tries}`) * 2 ** 32);
    const out = await attackChance({ me: g.ta, opp: g.tb, practice: true, random, deadline: RC.end });
    if (!alive() || !out) break;
    RC.tries++; if (out.result === 'goal') { RC.goals++; SFX.goal(); }
    $('#s0').textContent = RC.goals; $('#s1').textContent = RC.tries; racePub(); raceBoard();
    banner(out.result === 'goal' ? 'GOAL!' : out.result.toUpperCase() + '!', Date.now() < RC.end ? `${RC.goals} SO FAR` : 'TIME!', out.result === 'goal' ? '' : 'bad'); await wait(550);
    if (alive()) hideBanner();
  }
  clearInterval(tick);
  if (!RC || RC.id !== id || MP.view !== 'race') return;
  RC.done = true; racePub(); SFX.whistle(3); raceEnd();
}
function raceEnd() {
  MP.view = 'raceEnd';
  const rows = raceRows(), all = rows.length === 2 && rows.every(r => r.done), top = rows[0];
  const win = all && top && top.you && !(rows[1] && rows[1].goals === top.goals);
  if (win && !RC.cheered) { RC.cheered = true; confetti(); jingle([392, 523, 659, 784, 1047], 110); }
  render(`<section class="end career-sec">
    ${all ? '<div class="trophy" aria-hidden="true"></div>' : ''}
    <p class="lbl">GOAL RACE · ${code(RC.ta)} V ${code(RC.tb)}</p>
    <h1 class="finish">${all ? (rows.length > 1 && rows[1].goals === top.goals ? 'IT’S A TIE!' : `${esc(top.n)} WINS!`) : 'TIME!'}</h1>
    <p class="small">${all ? 'Final results' : 'Waiting for your opponent to finish…'}</p>
    <article class="box"><ol class="gb">${rows.map((r, i) => `<li class="${r.you ? 'you' : ''}"><em>${i + 1}</em><span>${esc(r.n)}${r.you ? ' (YOU)' : ''}</span><small>${r.tries} TRIES${r.done ? '' : ' · PLAYING'}</small><b>${r.goals}</b></li>`).join('')}</ol></article>
    <div class="menu row">${all ? endButtons('PLAY AGAIN ▶') : '<button class="btn" id="mpleave">LEAVE</button>'}</div>
  </section>`);
  wireEnd(() => hostStart({ mode: 'race', ta: RC.ta, tb: RC.tb, dur: RC.dur }));
}

// ---------- practice: endless chances against a random team ----------
async function practice() {
  const me = TEAMS[Math.floor(Math.random() * 12)], opp = TEAMS[24 + Math.floor(Math.random() * 24)];
  render(`<section class="amatch"><div class="board"><div class="side" style="${kit(me)}"><b>${code(me)}</b></div><div class="score"><b id="s0">0</b><i>/</i><b id="s1">0</b><span id="clock">PRACTICE</span></div><div class="side away" style="${kit(opp)}"><b>${code(opp)}</b></div></div>
    <div class="arena"><canvas id="cv"></canvas><div class="banner" id="banner"></div></div><p class="hint" id="hint"></p>
    <div class="menu row"><button class="btn" data-go="home">◀ BACK</button></div></section>`);
  let goals = 0, tries = 0;
  while (document.querySelector('.amatch')) {
    const out = await attackChance({ me, opp, practice: true });
    tries++; if (out.result === 'goal') { goals++; SFX.goal(); }
    if (!document.querySelector('.amatch')) break;
    $('#s0').textContent = goals; $('#s1').textContent = tries;
    banner(out.result === 'goal' ? 'GOAL!' : out.result.toUpperCase() + '!', `${goals} FROM ${tries}`, out.result === 'goal' ? '' : 'bad'); await wait(900); hideBanner();
  }
}

boot().catch(err => { console.error(err); app.innerHTML = '<p class="loading">COULDN’T LOAD. RUN FROM A LOCAL SERVER.</p>'; });
