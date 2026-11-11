// =============================================================
//  elo.js — "before kickoff" odds from real pre-match ratings.
//  data/elo.json holds each team's World Football Elo rating
//  just before every match (eloratings.net). Elo is the standard
//  strength rating in international football: it knows England
//  is stronger than Ghana before a ball is kicked.
//
//  Elo difference -> expected goals -> Poisson scorelines
//  -> win / draw / loss. The constant BETA was calibrated so the
//  model agrees with Elo's own win expectancy.
// =============================================================
const HOME = 100;      // Elo's standard home advantage (hosts at home)
const BASE = 1.25;     // average goals per team per match
const BETA = 0.00237;  // goals multiplier per Elo point (calibrated)

let table = null;
export async function loadElo() {
  try { table = (await (await fetch('data/elo.json')).json()).ratings; } catch { table = {}; }
}
export const ratings = num => table?.[num] || null;

function pmf(l, n = 10) { const o = [Math.exp(-l)]; for (let k = 1; k <= n; k++) o.push(o[k - 1] * l / k); return o; }

export function eloOdds(num) {
  const r = ratings(num); if (!r) return null;
  const [e1, e2, h] = r;
  const dr = e1 - e2 + (h === 1 ? HOME : h === 2 ? -HOME : 0);
  const l1 = BASE * Math.exp(BETA * dr), l2 = BASE * Math.exp(-BETA * dr);
  const a = pmf(l1), b = pmf(l2);
  let w = 0, d = 0, l = 0;
  for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) { const p = a[i] * b[j]; if (i > j) w += p; else if (i === j) d += p; else l += p; }
  return { w, d, l, e1, e2, home: h, dr };
}
