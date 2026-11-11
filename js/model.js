// =============================================================
//  model.js — statistics for the Monte Carlo simulator.
//  1) Fit a Poisson goals model (attack / defence per team) by
//     penalised maximum likelihood with Newton-Raphson updates.
//  2) Simulate the rest of the tournament from any date.
// =============================================================
import { groupTable, rankThirds, assignThirds, BRACKET, winnerOf } from './engine.js';

// Expected goals for team i vs team j:  λ = exp(μ + attack_i − defence_j)
export function fitModel(teams, matches, { upTo = null, shrink = 2.0, iters = 60 } = {}) {
  const games = matches.filter(m => m.ft && (!upTo || m.date <= upTo));
  const att = Object.fromEntries(teams.map(t => [t, 0]));
  const def = Object.fromEntries(teams.map(t => [t, 0]));
  const goals = games.reduce((s, m) => s + m.ft[0] + m.ft[1], 0);
  const mu = Math.log(games.length ? goals / (2 * games.length) : 1.35);
  const lam = (a, b) => Math.exp(mu + att[a] - def[b]);

  for (let it = 0; it < iters; it++) {
    // Newton step on each attack parameter (shrink = L2 prior, pulls toward average)
    for (const t of teams) {
      let g = -shrink * att[t], h = -shrink;
      for (const m of games) {
        if (m.t1 === t) { const l = lam(t, m.t2); g += m.ft[0] - l; h -= l; }
        else if (m.t2 === t) { const l = lam(t, m.t1); g += m.ft[1] - l; h -= l; }
      }
      att[t] -= g / h;
    }
    for (const t of teams) {
      let g = -shrink * def[t], h = -shrink;
      for (const m of games) {
        if (m.t1 === t) { const l = lam(m.t2, t); g += l - m.ft[1]; h -= l; }
        else if (m.t2 === t) { const l = lam(m.t1, t); g += l - m.ft[0]; h -= l; }
      }
      def[t] -= g / h;
    }
  }
  return { mu, att, def, games: games.length };
}

export const expectedGoals = (model, a, b) => Math.exp(model.mu + model.att[a] - model.def[b]);

// Win / draw / loss probabilities from two independent Poisson scorelines
export function matchOdds(model, a, b) {
  const la = expectedGoals(model, a, b), lb = expectedGoals(model, b, a);
  const pa = poissonPmf(la, 10), pb = poissonPmf(lb, 10);
  let w = 0, d = 0, l = 0;
  for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) {
    const p = pa[i] * pb[j];
    if (i > j) w += p; else if (i === j) d += p; else l += p;
  }
  return { w, d, l, la, lb };
}
function poissonPmf(l, n) { const out = [Math.exp(-l)]; for (let k = 1; k <= n; k++) out.push(out[k - 1] * l / k); return out; }

// Seeded RNG (mulberry32) so a given seed always reproduces a run
export function rng(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function poisson(l, r) { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= r(); } while (p > L); return k - 1; }

// One full simulated tournament. Results on/before `upTo` are kept.
export function simulateOnce(groups, matches, model, upTo, r) {
  const played = m => m.ft && (!upTo || m.date <= upTo);
  const scoreline = (a, b) => [poisson(expectedGoals(model, a, b), r), poisson(expectedGoals(model, b, a), r)];

  const tables = {};
  for (const [g, teams] of Object.entries(groups)) {
    const games = matches.filter(m => m.group === g).map(m => played(m) ? m : { ...m, ft: scoreline(m.t1, m.t2) });
    tables[g] = groupTable(teams, games);
  }
  const best = rankThirds(tables).slice(0, 8).map(t => t.group);
  const thirds = assignThirds(best).map;
  const realByNum = Object.fromEntries(matches.filter(m => m.num > 72).map(m => [m.num, m]));

  const ko = {};
  const who = (code, num) => {
    if (code.startsWith('3:')) return tables[thirds[num]][2].team;
    if (code[0] === 'W') return ko[+code.slice(1)].w;
    if (code[0] === 'L') return ko[+code.slice(1)].l;
    return tables[code[1]][+code[0] - 1].team;
  };
  for (const s of BRACKET) {
    const a = who(s.a, s.num), b = who(s.b, s.num);
    const real = realByNum[s.num];
    let w;
    if (real && played(real) && real.t1 === a && real.t2 === b) w = winnerOf(real);
    else {
      let [x, y] = scoreline(a, b);
      if (x === y) { // extra time = a third of a match, then penalties ~ coin flip
        x += poisson(expectedGoals(model, a, b) / 3, r); y += poisson(expectedGoals(model, b, a) / 3, r);
      }
      w = x > y ? a : y > x ? b : (r() < 0.5 ? a : b);
    }
    ko[s.num] = { a, b, w, l: w === a ? b : a };
  }
  return ko;
}

// Run N tournaments and tally how far each team gets
export function simulateMany(groups, matches, model, { n = 10000, upTo = null, seed = 2026, onProgress } = {}) {
  const r = rng(seed);
  const reach = {};
  const finals = {};
  const bump = (t, k) => { (reach[t] ||= { R32: 0, R16: 0, QF: 0, SF: 0, F: 0, W: 0 })[k]++; };
  for (let i = 0; i < n; i++) {
    const ko = simulateOnce(groups, matches, model, upTo, r);
    for (let num = 73; num <= 88; num++) { bump(ko[num].a, 'R32'); bump(ko[num].b, 'R32'); }
    for (let num = 89; num <= 96; num++) { bump(ko[num].a, 'R16'); bump(ko[num].b, 'R16'); }
    for (let num = 97; num <= 100; num++) { bump(ko[num].a, 'QF'); bump(ko[num].b, 'QF'); }
    for (let num = 101; num <= 102; num++) { bump(ko[num].a, 'SF'); bump(ko[num].b, 'SF'); }
    bump(ko[104].a, 'F'); bump(ko[104].b, 'F'); bump(ko[104].w, 'W');
    const fk = [ko[104].a, ko[104].b].sort().join(' v ');
    finals[fk] = (finals[fk] || 0) + 1;
    if (onProgress && i % 500 === 499) onProgress(i + 1);
  }
  return { n, reach, finals };
}
